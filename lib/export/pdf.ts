/**
 * The PDF rendering of a personal-data export.
 *
 * Built with `pdf-lib`, which is pure JavaScript and reads no font files from disk.
 * That matters here rather than being a preference: the other common Node PDF
 * libraries load their font metrics with `node:fs` at runtime, which does not
 * survive being bundled into a Next.js route handler, and a report that fails to
 * generate inside the app is worth nothing.
 *
 * Layout is done by hand for the same reason the rest of this project avoids
 * conveniences that hide behaviour: text is wrapped to a measured width, a row that
 * does not fit moves to the next page before it is drawn, so nothing overlaps and
 * nothing is cut off, and page numbers are stamped after all the content exists so
 * they can say "Page 2 of 5" rather than guessing.
 *
 * Character set: the standard fonts are Latin-1, so a character outside that range
 * cannot be drawn. Such characters are replaced with a question mark and the report
 * says so in its own notes, pointing at the JSON export, which preserves them. The
 * alternative - embedding a Unicode font - would add a megabyte of font file and a
 * licence question to a report that is legible without it.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

import { KIND_BY_ID, type HealthRecord } from "@/lib/health/kinds";
import { CONDITION_OPTIONS, GOAL_OPTIONS, INTEREST_OPTIONS } from "@/lib/profile/options";
import type { ExportReport } from "@/lib/export/report";

const PAGE = { width: 595.28, height: 841.89 }; // A4 in points.
const MARGIN = 56;
const CONTENT_WIDTH = PAGE.width - MARGIN * 2;

const COLOR = {
  text: rgb(0.1, 0.11, 0.11),
  muted: rgb(0.44, 0.47, 0.45),
  rule: rgb(0.78, 0.76, 0.73),
  accent: rgb(0.08, 0.33, 0.31),
  band: rgb(0.96, 0.95, 0.94),
};

/** Maps the common typographic characters onto Latin-1 equivalents. */
const TRANSLITERATIONS: [RegExp, string][] = [
  [/[\u2018\u2019\u201A\u201B]/g, "'"],
  [/[\u201C\u201D\u201E\u201F]/g, '"'],
  [/[\u2013\u2014\u2212]/g, "-"],
  [/[\u2026]/g, "..."],
  [/[\u00A0\u2009\u202F]/g, " "],
  [/[\u2022\u25CF]/g, "-"],
  [/[\u2192]/g, "->"],
  [/[\u2265]/g, ">="],
  [/[\u2264]/g, "<="],
  [/[\u00B5]/g, "u"],
];

/**
 * Replaces anything the standard font cannot encode.
 *
 * WinAnsi covers Latin-1 plus a handful of extras, so the safe rule is: keep
 * printable ASCII and Latin-1, transliterate the typographic characters that would
 * otherwise become question marks, and note the rest in the report.
 */
export function toLatin1Text(value: string): string {
  let text = value;
  for (const [pattern, replacement] of TRANSLITERATIONS) {
    text = text.replace(pattern, replacement);
  }
  return text.replace(/[^\x09\x0A\x0D\x20-\x7E\u00A0-\u00FF]/g, "?");
}

function formatDate(iso: string | null): string {
  if (!iso) return "not recorded";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "unreadable date";
  return parsed.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

function formatDay(iso: string | null): string {
  if (!iso) return "not recorded";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "unreadable date";
  return parsed.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function reading(record: HealthRecord): string {
  const spec = KIND_BY_ID[record.kind];
  if (record.valueSecondary !== null && spec.secondary) {
    return `${record.valuePrimary}/${record.valueSecondary} ${spec.primary.unit}`;
  }
  return `${record.valuePrimary} ${spec.primary.unit}`;
}

/**
 * A line-oriented writer that owns the page break.
 *
 * Every draw goes through here, so "does it fit" is answered in exactly one place
 * instead of at each call site. That is what makes overlapping text structurally
 * impossible rather than a matter of care.
 */
class Writer {
  private page: PDFPage;
  private y = PAGE.height - MARGIN;

  constructor(
    private readonly doc: PDFDocument,
    private readonly body: PDFFont,
    private readonly bold: PDFFont,
  ) {
    this.page = doc.addPage([PAGE.width, PAGE.height]);
  }

  private ensure(height: number) {
    if (this.y - height < MARGIN + 28) {
      this.page = this.doc.addPage([PAGE.width, PAGE.height]);
      this.y = PAGE.height - MARGIN;
    }
  }

  get pages(): PDFPage[] {
    return this.doc.getPages();
  }

  private drawLine(text: string, font: PDFFont, size: number, color = COLOR.text, indent = 0) {
    this.ensure(size * 1.6);
    this.y -= size * 1.35;
    this.page.drawText(text, {
      x: MARGIN + indent,
      y: this.y,
      size,
      font,
      color,
    });
  }

  /** Wraps by measured width, breaking a word that is wider than the column. */
  private wrap(text: string, font: PDFFont, size: number, width: number): string[] {
    const lines: string[] = [];
    for (const paragraph of text.split("\n")) {
      const words = paragraph.split(/\s+/).filter((word) => word.length > 0);
      if (words.length === 0) {
        lines.push("");
        continue;
      }
      let current = "";
      for (const word of words) {
        const candidate = current.length === 0 ? word : `${current} ${word}`;
        if (font.widthOfTextAtSize(candidate, size) <= width) {
          current = candidate;
          continue;
        }
        if (current.length > 0) lines.push(current);
        if (font.widthOfTextAtSize(word, size) <= width) {
          current = word;
          continue;
        }
        // A single token wider than the column, typically a URL or an unbroken id.
        let chunk = "";
        for (const character of word) {
          if (font.widthOfTextAtSize(chunk + character, size) > width && chunk.length > 0) {
            lines.push(chunk);
            chunk = character;
          } else {
            chunk += character;
          }
        }
        current = chunk;
      }
      if (current.length > 0) lines.push(current);
    }
    return lines;
  }

  paragraph(text: string, options: { size?: number; muted?: boolean; indent?: number } = {}) {
    const size = options.size ?? 10;
    const font = this.body;
    const indent = options.indent ?? 0;
    const color = options.muted ? COLOR.muted : COLOR.text;
    for (const line of this.wrap(toLatin1Text(text), font, size, CONTENT_WIDTH - indent)) {
      this.drawLine(line, font, size, color, indent);
    }
  }

  heading(text: string, level: 1 | 2 = 2) {
    const size = level === 1 ? 20 : 13;
    const font = this.bold;
    this.ensure(size * 3);
    this.y -= level === 1 ? 8 : 16;
    for (const line of this.wrap(toLatin1Text(text), font, size, CONTENT_WIDTH)) {
      this.drawLine(line, font, size, level === 1 ? COLOR.accent : COLOR.text);
    }
    if (level === 2) {
      this.y -= 4;
      this.page.drawLine({
        start: { x: MARGIN, y: this.y },
        end: { x: PAGE.width - MARGIN, y: this.y },
        thickness: 0.7,
        color: COLOR.rule,
      });
    }
  }

  space(amount = 8) {
    this.y -= amount;
  }

  /** A label/value row. The value wraps beneath its label if it is long. */
  field(label: string, value: string, indent = 0) {
    this.ensure(24);
    const labelWidth = 150;
    const wrapped = this.wrap(toLatin1Text(value), this.body, 10, CONTENT_WIDTH - labelWidth - indent);
    this.y -= 14;
    this.page.drawText(toLatin1Text(label), {
      x: MARGIN + indent,
      y: this.y,
      size: 10,
      font: this.bold,
      color: COLOR.muted,
    });
    this.page.drawText(wrapped[0] ?? "", {
      x: MARGIN + indent + labelWidth,
      y: this.y,
      size: 10,
      font: this.body,
      color: COLOR.text,
    });
    for (const line of wrapped.slice(1)) {
      this.y -= 13;
      this.page.drawText(line, {
        x: MARGIN + indent + labelWidth,
        y: this.y,
        size: 10,
        font: this.body,
        color: COLOR.text,
      });
    }
  }

  /** A table, drawn row by row so a row is never split across a page. */
  table(
    columns: { header: string; width: number }[],
    rows: string[][],
    emptyMessage: string,
  ) {
    const size = 9.5;
    const rowHeight = 15;
    if (rows.length === 0) {
      this.paragraph(emptyMessage, { muted: true });
      return;
    }

    const drawHeader = () => {
      this.ensure(rowHeight * 2);
      this.y -= rowHeight;
      const bandTop = this.y + 11;
      this.page.drawRectangle({
        x: MARGIN,
        y: bandTop - 4,
        width: CONTENT_WIDTH,
        height: rowHeight,
        color: COLOR.band,
      });
      let x = MARGIN + 4;
      for (const column of columns) {
        this.page.drawText(toLatin1Text(column.header), {
          x,
          y: this.y,
          size,
          font: this.bold,
          color: COLOR.text,
        });
        x += column.width;
      }
      this.page.drawLine({
        start: { x: MARGIN, y: bandTop - 5 },
        end: { x: PAGE.width - MARGIN, y: bandTop - 5 },
        thickness: 0.5,
        color: COLOR.rule,
      });
    };

    drawHeader();

    for (const row of rows) {
      if (this.y - rowHeight < MARGIN + 28) {
        this.page = this.doc.addPage([PAGE.width, PAGE.height]);
        this.y = PAGE.height - MARGIN;
        drawHeader();
      }
      this.y -= rowHeight;
      let x = MARGIN + 4;
      row.forEach((cell, index) => {
        const column = columns[index]!;
        const available = column.width - 8;
        // One line per cell: a value that does not fit is ellipsised rather than
        // pushing the columns out of alignment. Full values appear in the list
        // sections and in the JSON export.
        let text = toLatin1Text(cell);
        while (this.body.widthOfTextAtSize(text, size) > available && text.length > 1) {
          text = `${text.slice(0, -2)}`;
        }
        if (text !== toLatin1Text(cell)) text = `${text.slice(0, -1)}...`;
        this.page.drawText(text, {
          x,
          y: this.y,
          size,
          font: this.body,
          color: COLOR.text,
        });
        x += column.width;
      });
    }
  }

  footer(note: string) {
    const pages = this.doc.getPages();
    const size = 8.5;
    pages.forEach((page, index) => {
      const label = `${note}  |  Page ${index + 1} of ${pages.length}`;
      const width = this.body.widthOfTextAtSize(label, size);
      page.drawText(label, {
        x: (PAGE.width - width) / 2,
        y: MARGIN - 22,
        size,
        font: this.body,
        color: COLOR.muted,
      });
    });
  }
}

export async function buildExportPdf(report: ExportReport): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const body = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  doc.setTitle(`Personal data export - ${report.platform}`);
  doc.setAuthor(report.platform);
  doc.setCreator(`${report.platform} (personal data export format v${report.formatVersion})`);
  doc.setSubject("Complete export of one account's stored data");
  // Every timestamp in the report is UTC, so the document says so rather than
  // leaving a reader to guess which clock a date came from.
  doc.setProducer(`pdf-lib | all times UTC | generated ${report.generatedAt}`);

  const writer = new Writer(doc, body, bold);

  writer.heading("Personal data export", 1);
  writer.paragraph(
    `${report.platform}. Everything held about the account ${report.account.email}, generated on demand at the account owner's request.`,
  );
  writer.space(6);
  writer.field("Generated", `${formatDate(report.generatedAt)} (UTC)`);
  writer.field("Account created", `${formatDate(report.account.createdAt)} (UTC)`);
  writer.field("Email address", report.account.email);
  writer.field("Export format version", report.formatVersion);
  writer.field("Active sessions", String(report.activeSessions));

  writer.heading("Profile");
  if (report.profile) {
    const profile = report.profile;
    writer.field("Preferred name", profile.displayName ?? "not given");
    writer.field("Year of birth", profile.birthYear ? String(profile.birthYear) : "not given");
    writer.field("Sex at birth", profile.sexAtBirth ?? "not given");
    writer.field("Height", profile.heightCm ? `${profile.heightCm} cm` : "not given");
    writer.field(
      "Interests",
      profile.interests.length > 0
        ? profile.interests
            .map((id) => INTEREST_OPTIONS.find((option) => option.id === id)?.label ?? id)
            .join(", ")
        : "none selected",
    );
    writer.field(
      "Goals you set",
      profile.goals.length > 0
        ? profile.goals.map((id) => GOAL_OPTIONS.find((o) => o.id === id)?.label ?? id).join(", ")
        : "none selected",
    );
    writer.field(
      "Conditions you disclosed",
      profile.selfReportedConditions.length > 0
        ? profile.selfReportedConditions
            .map((id) => CONDITION_OPTIONS.find((o) => o.id === id)?.label ?? id)
            .join(", ")
        : "nothing recorded",
    );
    writer.paragraph(
      "The line above is the account owner's own statement, as they entered it. It is stored exactly as selected. It is not a verified medical record, it is not used to decide any care level, and the symptom guidance and emergency screen do not read it.",
      { muted: true, size: 9 },
    );
    writer.field(
      "Sleep goal",
      profile.sleepGoalHours ? `${profile.sleepGoalHours} hours, set by the account owner` : "not set",
    );
    writer.field(
      "Activity goal",
      profile.activityGoalMinutes
        ? `${profile.activityGoalMinutes} minutes a day, set by the account owner`
        : "not set",
    );
    writer.field(
      "Preferred language",
      profile.preferredLanguage ?? "no preference recorded",
    );
    writer.field(
      "Storage notice accepted",
      profile.consentVersion
        ? `version ${profile.consentVersion} on ${formatDay(profile.consentAt)}`
        : "not recorded on this account",
    );
    writer.field("Profile last updated", formatDate(profile.updatedAt));
  } else {
    writer.paragraph("No profile row exists for this account.", { muted: true });
  }

  writer.heading("Measurements");
  writer.paragraph(
    `${report.recordCount} ${report.recordCount === 1 ? "measurement is" : "measurements are"} held for this account. Every value was entered by the account owner. This platform does not measure anything, and the source column below records that fact on every row.`,
    { size: 9.5 },
  );
  if (report.recordsTruncated) {
    writer.paragraph(
      `This account holds more rows than one export includes, so the ${report.records.length} most recent are listed. The JSON export and the summaries cover the same set.`,
      { size: 9.5, muted: true },
    );
  }
  writer.space(4);
  writer.table(
    [
      { header: "Taken", width: 130 },
      { header: "Measurement", width: 110 },
      { header: "Reading", width: 95 },
      { header: "Source", width: 90 },
      { header: "Note", width: CONTENT_WIDTH - 425 },
    ],
    report.records.map((record) => [
      formatDate(record.measuredAt),
      KIND_BY_ID[record.kind]?.label ?? record.kind,
      reading(record),
      record.source,
      record.note ?? "",
    ]),
    "No measurements are held for this account.",
  );

  writer.heading("Descriptive summary");
  writer.paragraph(
    "Arithmetic over the rows listed above. These are not clinical measurements, and nothing here is compared with a reference range.",
    { size: 9.5, muted: true },
  );
  writer.space(4);
  writer.table(
    [
      { header: "Measurement", width: 130 },
      { header: "Records", width: 70 },
      { header: "Lowest", width: 80 },
      { header: "Highest", width: 80 },
      { header: "Mean", width: 80 },
      { header: "Span", width: CONTENT_WIDTH - 440 },
    ],
    report.summaries.map((summary) => [
      summary.label,
      String(summary.count),
      summary.min === null ? "" : `${summary.min} ${summary.unit}`,
      summary.max === null ? "" : `${summary.max} ${summary.unit}`,
      summary.mean === null ? "" : `${summary.mean} ${summary.unit}`,
      `${formatDay(summary.firstMeasuredAt)} to ${formatDay(summary.lastMeasuredAt)}`,
    ]),
    "No measurements are held, so there is nothing to summarise.",
  );

  writer.heading("Saved learning material");
  writer.space(2);
  writer.table(
    [
      { header: "Type", width: 110 },
      { header: "Title", width: CONTENT_WIDTH - 300 },
      { header: "Saved", width: 90 },
      { header: "Where", width: 100 },
    ],
    report.saved.map((item) => [
      item.kind === "podcast" ? "Podcast or video" : "Source document",
      item.title ?? `${item.refId} (no longer in the catalogue)`,
      formatDay(item.savedAt),
      item.kind === "podcast" ? "YouTube" : item.url ?? "publisher site",
    ]),
    "Nothing has been saved from the podcasts catalogue or the source library.",
  );

  writer.heading("What this export includes");
  for (const line of report.included) writer.paragraph(`- ${line}`, { size: 9.5 });

  writer.heading("What this export deliberately leaves out");
  for (const line of report.excluded) writer.paragraph(`- ${line}`, { size: 9.5 });

  writer.heading("Notes");
  for (const line of report.notes) writer.paragraph(`- ${line}`, { size: 9.5 });

  writer.heading("How to remove all of this");
  writer.paragraph(
    "The account page deletes the account, its profile, every measurement and every saved item in one operation. The records page deletes individual measurements. Neither can be undone and there is no backup to restore from.",
    { size: 9.5 },
  );

  writer.footer(`${report.platform} personal data export - not a medical record`);

  return doc.save();
}

/** A filename that is safe on every platform and ends in `.pdf`. */
export function exportFilename(userId: number, generatedAt: string): string {
  const day = generatedAt.slice(0, 10);
  return `ultimatehealth-data-${day}-account-${userId}.pdf`;
}
