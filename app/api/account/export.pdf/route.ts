import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/cookies";
import { buildExportReport } from "@/lib/export/report";
import { buildExportPdf, exportFilename } from "@/lib/export/pdf";

/**
 * The primary personal-data download: a formatted PDF.
 *
 * The account is taken from the session cookie, and there is no identifier in the
 * path, the query string or the body, so an unauthenticated caller cannot reach
 * this route at all and a signed-in caller cannot ask for someone else's report by
 * changing a number.
 *
 * Headers that matter: the content type is `application/pdf`, which is what makes a
 * browser download rather than render it, the disposition names a file ending in
 * `.pdf`, and `no-store` stops a shared proxy from holding a copy of a person's
 * health data. The PDF is generated in memory and never written to disk.
 *
 * The JSON export remains available at `/api/account` for anyone who wants to
 * process the data; this route is the one the account page offers first.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "Sign in to export your data.", kind: "unauthenticated" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const report = buildExportReport(user.id);
  if (!report) {
    // The session resolved but the account row is gone, which means it was deleted
    // in another tab between the session check and this read.
    return NextResponse.json(
      { error: "That account no longer exists.", kind: "unauthenticated" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const pdf = await buildExportPdf(report);
    return new NextResponse(Buffer.from(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${exportFilename(user.id, report.generatedAt)}"`,
        "Content-Length": String(pdf.byteLength),
        "Cache-Control": "no-store",
        // The report is personal data, so it is marked as such for any downstream
        // cache or proxy that chooses to honour the hint.
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    // A rendering failure returns an honest error rather than an empty or partial
    // file that a browser would happily save as a valid-looking download.
    console.error(
      "[export] PDF generation failed:",
      error instanceof Error ? error.name : typeof error,
    );
    return NextResponse.json(
      {
        error:
          "The PDF report could not be generated. Nothing was downloaded. The JSON export on the same page contains the same data.",
        kind: "pdf-generation-failed",
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
