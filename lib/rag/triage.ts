/**
 * Deterministic triage.
 *
 * The care level shown to a reader is decided by this module, not by the
 * language model. The model is only used afterwards to explain the relevant
 * information in plain language, grounded in retrieved passages.
 *
 * That separation matters for two reasons. It is auditable: the same input
 * always produces the same care level. And it is testable: the test suite asserts
 * care levels directly, without depending on model behaviour.
 *
 * Thresholds are not invented here. Each one records the corpus documents that
 * state it, and those documents are rendered as links in the interface.
 */

export type CareLevel = "emergency" | "medical-review" | "monitor";

export type Reading = {
  systolic: number;
  diastolic: number;
  raw: string;
};

export type TriageReason = {
  text: string;
  sourceIds: string[];
};

export type TriageOutcome = {
  level: CareLevel;
  reasons: TriageReason[];
  reading: Reading | null;
};

/**
 * Thresholds as documented in the corpus.
 *
 * WHO and MedlinePlus describe a hypertensive crisis at 180/120 or above, and
 * WHO, WHO India and the NHS describe raised blood pressure at 140/90 or above.
 *
 * The home threshold is lower, and that is not a rounding choice: the NHS page
 * says a reading of 135/85 or higher at home counts as raised, against 140/90 or
 * higher in a clinic. Ignoring the difference made the guidance less sensitive
 * than the source it cites for anyone measuring at home, which is where most
 * home-monitor users are.
 */
export const THRESHOLDS = {
  crisisSystolic: 180,
  crisisDiastolic: 120,
  hypertensionSystolic: 140,
  hypertensionDiastolic: 90,
  /** NHS: "135/85 or higher when checked at home". */
  homeSystolic: 135,
  homeDiastolic: 85,
  crisisSourceIds: ["who-hypertension", "mlp-high-blood-pressure"],
  hypertensionSourceIds: ["who-hypertension", "nhs-high-blood-pressure"],
  homeThresholdSourceIds: ["nhs-high-blood-pressure"],
  /** Confirmation is not based on one reading in either source. */
  repeatReadingSourceIds: ["who-india-hypertension", "nhs-high-blood-pressure"],
} as const;

/**
 * Where the reading was taken. The threshold that applies depends on this, so
 * the form asks for it and the guidance says which threshold it used.
 *
 * "unknown" is treated as a clinic reading, which is the stricter threshold of
 * the two. Guessing the more sensitive one would flag normal clinic readings.
 */
export type MeasurementContext = "clinic" | "home" | "unknown";

/**
 * Parses a blood pressure reading such as "168/104", "168 over 104", or
 * "BP 168 / 104". Returns null when no plausible pair is present.
 */
export function parseReading(text: string | undefined): Reading | null {
  if (!text) return null;
  const match = text.match(/\b(\d{2,3})\s*(?:\/|over)\s*(\d{2,3})\b/i);
  if (!match) return null;
  const systolic = Number(match[1]);
  const diastolic = Number(match[2]);
  if (systolic < 40 || systolic > 350 || diastolic < 20 || diastolic > 250) {
    return null;
  }
  return { systolic, diastolic, raw: match[0] };
}

export const CRISIS_READING_RULE_ID = "blood-pressure-crisis-reading";

export type TriageInput = {
  /** Rules matched by the emergency screen, empty when none matched. */
  warningRules: { id: string; label: string }[];
  reading: Reading | null;
  symptomCount: number;
  /** Defaults to "unknown", which uses the clinic threshold. */
  measuredAt?: MeasurementContext;
};

export function triage(input: TriageInput): TriageOutcome {
  const reasons: TriageReason[] = [];
  const reading = input.reading;
  const measuredAt = input.measuredAt ?? "unknown";
  const atHome = measuredAt === "home";
  const systolicThreshold = atHome
    ? THRESHOLDS.homeSystolic
    : THRESHOLDS.hypertensionSystolic;
  const diastolicThreshold = atHome
    ? THRESHOLDS.homeDiastolic
    : THRESHOLDS.hypertensionDiastolic;
  const thresholdSourceIds = atHome
    ? [...THRESHOLDS.homeThresholdSourceIds]
    : [...THRESHOLDS.hypertensionSourceIds];
  const thresholdLabel = `${systolicThreshold}/${diastolicThreshold}`;
  const thresholdDescription = atHome
    ? "a home reading"
    : "a reading taken by a healthcare professional";

  const isCrisis =
    reading !== null &&
    (reading.systolic >= THRESHOLDS.crisisSystolic ||
      reading.diastolic >= THRESHOLDS.crisisDiastolic);
  const isAboveHypertensionThreshold =
    reading !== null &&
    (reading.systolic >= systolicThreshold ||
      reading.diastolic >= diastolicThreshold);

  // Emergency. Reasons name the specific trigger so the reader can see whether the
  // escalation came from a warning-sign rule or from the reading itself.
  if (input.warningRules.length > 0 || isCrisis) {
    const signRules = input.warningRules.filter(
      (rule) => rule.id !== CRISIS_READING_RULE_ID,
    );
    if (signRules.length > 0) {
      reasons.push({
        text: `Public health guidance treats the following as an emergency warning sign: ${signRules.map((r) => r.label).join("; ")}.`,
        sourceIds: [],
      });
    }
    if (isCrisis && reading) {
      reasons.push({
        text: `A reading of ${reading.raw} is at or above the ${THRESHOLDS.crisisSystolic}/${THRESHOLDS.crisisDiastolic} threshold that guidance documents describe as a hypertensive crisis requiring immediate medical attention.`,
        sourceIds: [...THRESHOLDS.crisisSourceIds],
      });
    }
    if (reasons.length === 0) {
      reasons.push({
        text: "The information entered matched the emergency screen.",
        sourceIds: [],
      });
    }
    return { level: "emergency", reasons, reading };
  }

  if (reading) {
    reasons.push(
      isAboveHypertensionThreshold
        ? {
            text: `A reading of ${reading.raw} is at or above the ${thresholdLabel} threshold that guidance uses for ${thresholdDescription}. A single reading is not a diagnosis, and a clinician should confirm it.`,
            sourceIds: [...thresholdSourceIds],
          }
        : {
            text: `A reading of ${reading.raw} is below the ${thresholdLabel} threshold used for ${thresholdDescription} in the sources used here. A single reading is not a diagnosis either way.`,
            sourceIds: [...thresholdSourceIds],
          },
    );
    if (atHome && isAboveHypertensionThreshold) {
      reasons.push({
        text: `The threshold applied is the one that guidance gives for a home reading, ${THRESHOLDS.homeSystolic}/${THRESHOLDS.homeDiastolic}, which is lower than the ${THRESHOLDS.hypertensionSystolic}/${THRESHOLDS.hypertensionDiastolic} used in a clinic.`,
        sourceIds: [...THRESHOLDS.homeThresholdSourceIds],
      });
    }
    if (isAboveHypertensionThreshold) {
      reasons.push({
        text: "Raised blood pressure is confirmed from repeated readings rather than a single one: the sources describe measurement on two different days, a return visit, or a monitor worn for 24 hours.",
        sourceIds: [...THRESHOLDS.repeatReadingSourceIds],
      });
    }
  }

  if (input.symptomCount > 0) {
    reasons.push({
      text: `${input.symptomCount} symptom${input.symptomCount === 1 ? "" : "s"} reported. None of the reported items matched the emergency warning signs, so the appropriate next step is a review with a clinician rather than emergency care.`,
      sourceIds: [],
    });
  }

  const level: CareLevel =
    isAboveHypertensionThreshold || input.symptomCount > 0
      ? "medical-review"
      : "monitor";

  if (reasons.length === 0) {
    reasons.push({
      text: "No reading and no symptoms were reported, so the guidance below describes monitoring rather than a specific concern.",
      sourceIds: [],
    });
  }

  return { level, reasons, reading };
}

export const CARE_LEVEL_LABELS: Record<CareLevel, string> = {
  emergency: "Emergency care now",
  "medical-review": "Arrange a medical review",
  monitor: "Monitor and note changes",
};

export const CARE_LEVEL_EXPLANATIONS: Record<CareLevel, string> = {
  emergency:
    "The reported information includes a warning sign that guidance treats as an emergency. Seek emergency care immediately.",
  "medical-review":
    "Nothing reported matched the emergency warning signs. What you described is worth having assessed by a clinician at an ordinary appointment, or sooner if it worsens.",
  monitor:
    "Nothing reported matched the emergency warning signs. There is not enough information here to suggest a specific concern. Keep noting measurements and symptoms and raise them at your next routine appointment.",
};
