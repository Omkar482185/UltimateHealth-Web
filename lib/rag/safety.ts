/**
 * Emergency signal screen.
 *
 * This is a fixed, deterministic rule set. It is not a model and does not learn
 * from data. It exists because the single most harmful failure mode for a health
 * information system is answering a question about a medical emergency with
 * general educational content instead of telling the person to seek urgent care.
 *
 * Design decisions:
 *  - The screen runs before retrieval and short-circuits the whole pipeline, so
 *    no clarifying questions are asked and no generation latency is incurred.
 *  - Rules are deliberately sensitive rather than specific. A false positive
 *    costs the reader a moment of alarm and a link to urgent care; a false
 *    negative could cost considerably more. The screen never claims a diagnosis.
 *  - The matched rule labels are shown to the reader so the behaviour is
 *    inspectable, and each rule cites the corpus document that documents the
 *    warning sign.
 */

export type SafetyRule = {
  id: string;
  label: string;
  patterns: RegExp[];
  /** Optional co-signal; the rule only fires when one of these also matches. */
  requires?: RegExp[];
  /** Corpus documents that support this warning sign. */
  sourceIds: string[];
};

export type SafetyScreenResult = {
  isEmergency: boolean;
  matchedRules: { id: string; label: string; triggeredBy: string }[];
  message: string | null;
  steps: string[];
  /** Corpus document ids supporting the warning signs. Resolved to links by the caller. */
  sourceIds: string[];
};

/** Blood pressure crisis thresholds, as documented in the corpus. */
const SYSTOLIC_CRISIS = 180;
const DIASTOLIC_CRISIS = 120;

function matchedText(text: string, pattern: RegExp): string | null {
  const m = text.match(pattern);
  return m ? m[0] : null;
}

export const SAFETY_RULES: SafetyRule[] = [
  {
    id: "possible-heart-attack",
    label: "Chest pain or pressure",
    patterns: [
      /\bchest\s+(pain|pressure|tightness|discomfort|heaviness)\b/,
      /\bpain\s+in\s+(my|the|your)\s+chest\b/,
      /\bcrushing\s+(chest|pain)\b/,
      // "my chest feels tight" and similar linking-verb forms.
      /\bchest\s+(?:is\s+|feels?\s+|was\s+)?(tight|heavy|tender|sore)\b/,
    ],
    sourceIds: ["mlp-heart-attack", "nhs-heart-attack"],
  },
  {
    id: "possible-stroke",
    label: "Possible stroke signs",
    patterns: [
      // Linking verbs are optional because people write "my face is drooping"
      // far more often than "face drooping". An earlier version required the
      // adjacent form and missed the natural phrasing, which the safety cases in
      // the evaluation set caught.
      /\bface\s+(?:is\s+|was\s+)?(droop|drooping|droops|numb|numbness|weakness|sagging)\b/,
      /\b(speech\s+(?:is\s+|was\s+)?slurred|(?:slurred|slurry)\s+speech)\b/,
      /\b((?:difficulty|trouble|problem)\s+speaking|cannot\s+speak|can't\s+speak|unable\s+to\s+speak)\b/,
      /\bsudden\s+(confusion|weakness|numbness|vision loss|blurred vision|severe headache|dizziness)\b/,
      /\b(sudden|worst)\s+headache\b/,
      /\b(one|1)\s+side\s+of\s+(my|the|your)\s+(body|face|arm|leg)\b/,
      /\b(arm|leg|hand|foot)\s+(?:is\s+|was\s+)?(weak|weakness|numb|numbness|drooping|heavy)\b/,
    ],
    sourceIds: ["nhs-stroke-symptoms", "mlp-stroke"],
  },
  {
    id: "breathing-difficulty",
    label: "Difficulty breathing",
    patterns: [
      /\b(severe\s+)?(difficulty|trouble)\s+breathing\b/,
      /\b(shortness of breath|short of breath)\b/,
      /\b(cannot|can't)\s+breathe\b/,
      /\b(gasping|choking|suffocating)\b/,
    ],
    sourceIds: ["nhs-heart-attack", "mlp-heart-attack"],
  },
  {
    id: "loss-of-consciousness",
    label: "Fainting or loss of consciousness",
    patterns: [
      /\b(fainted|fainting|passed out|passing out|unconscious|unresponsive)\b/,
      /\blost consciousness\b/,
    ],
    sourceIds: ["nhs-low-blood-pressure", "nhs-stroke-symptoms"],
  },
  {
    id: "seizure",
    label: "Seizure",
    patterns: [/\b(seizure|convulsion|convulsing|fitting)\b/],
    sourceIds: ["nhs-stroke-symptoms"],
  },
  {
    id: "severe-bleeding",
    label: "Severe or uncontrolled bleeding",
    patterns: [
      /\b(severe|heavy|uncontrolled|a lot of)\s+bleeding\b/,
      /\b(vomiting|coughing up)\s+blood\b/,
    ],
    sourceIds: ["mlp-stroke", "nhs-stroke-treatment"],
  },
  // The arboviral warning signs come from the WHO dengue fact sheet, which lists
  // bleeding gums or nose, blood in vomit or stool, persistent vomiting and
  // severe abdominal pain as reasons to seek care immediately, and notes that
  // they often appear after the fever has settled. That last detail is why the
  // rule cannot wait for the word "dengue": by the time the fever is gone the
  // illness looks like it is improving.
  {
    id: "possible-severe-arboviral-bleeding",
    label: "Bleeding that guidance associates with severe dengue",
    patterns: [
      /\bbleeding\s+gums\b/,
      /\bbleeding\s+from\s+(my\s+|the\s+)?(gums|nose)\b/,
      // People write "my gums are bleeding" more often than "bleeding gums".
      // The linking-verb form is optional here for the same reason the stroke
      // rule allows it, and the evaluation cases caught the omission.
      /\b(gums|nose)\s+(?:is\s+|are\s+|was\s+|were\s+|keeps?\s+)?bleeding\b/,
      /\b(blood|bleeding)\s+in\s+(my\s+|the\s+)?(vomit|vomiting|stool|stools|poo|faeces)\b/,
    ],
    sourceIds: ["who-dengue", "who-chikungunya"],
  },
  {
    id: "possible-severe-dengue",
    label: "Possible severe dengue",
    // These two are common complaints on their own, so they escalate only when
    // the message also carries a febrile or mosquito-borne context. The bleeding
    // signs above deliberately have no such requirement: bleeding is never
    // benign, whatever the cause.
    patterns: [
      /\bpersistent\s+vomiting\b/,
      /\bsevere\s+(abdominal|stomach|belly)\s+pain\b/,
      /\bnosebleeds?\b/,
    ],
    requires: [
      /\b(fever|feverish|dengue|chikungunya|mosquito|aedes|rash|platelet|temperature)\b/,
    ],
    sourceIds: ["who-dengue"],
  },
  {
    id: "possible-anaphylaxis",
    label: "Swelling of the face, lips, or throat",
    patterns: [
      /\b(swollen|swelling)\s+(face|throat|lips|tongue)\b/,
      /\b(face|throat|lips|tongue)\s+(?:is\s+|are\s+|was\s+|were\s+)?(swollen|swelling|puffy)\b/,
      /\bswelling\s+of\s+the\s+(face|throat|lips|tongue)\b/,
      /\bthroat\s+(?:is\s+|was\s+|feels?\s+)?(closing|closing up|tightening|tight)\b/,
      /\banaphyla(xis|ctic)\b/,
    ],
    sourceIds: ["mlp-stress"],
  },
  {
    id: "mentioned-hypertensive-crisis",
    label: "Hypertensive crisis mentioned",
    patterns: [/\bhypertensive\s+(crisis|emergency)\b/],
    sourceIds: ["who-hypertension", "mlp-high-blood-pressure"],
  },
  {
    id: "possible-self-harm",
    label: "Thoughts of self-harm",
    patterns: [
      /\b(suicidal|suicide|kill myself|end my life|want to die)\b/,
      /\b(self[-\s]?harm|hurting myself|harm myself)\b/,
    ],
    sourceIds: ["mlp-stress"],
  },
  {
    id: "pregnancy-warning-sign",
    label: "Warning signs during pregnancy",
    patterns: [/\bpregnan(t|cy)\b/],
    requires: [
      /\b(severe headache|blurred vision|vision changes|sudden swelling|severe abdominal pain|bleeding)\b/,
    ],
    sourceIds: ["who-hypertension"],
  },
];

/**
 * Detects blood pressure readings at or above the crisis thresholds.
 * Accepts "180/120", "180 over 120", and "180 / 120".
 */
export function detectCrisisReading(text: string): string | null {
  const match = text.match(/\b(\d{2,3})\s*(?:\/|over)\s*(\d{2,3})\b/);
  if (!match) return null;
  const systolic = Number(match[1]);
  const diastolic = Number(match[2]);
  if (systolic >= SYSTOLIC_CRISIS || diastolic >= DIASTOLIC_CRISIS) {
    return match[0];
  }
  return null;
}

/**
 * Exported so the emergency step can show these instructions the instant a
 * warning sign is reported, without waiting for a response. The wording is fixed
 * here rather than in the component precisely so that what is shown urgently
 * cannot drift from what the server-side screen produces.
 */
export const EMERGENCY_MESSAGE =
  "What you described includes a warning sign that public health guidance treats as a medical emergency.";

export const EMERGENCY_STEPS = [
  "Contact your local emergency number or go to the nearest emergency department now. Do not wait to see whether the symptoms pass.",
  "Do not drive yourself if you feel faint, confused, or short of breath. Ask someone to take you or call an ambulance.",
  "Do not take or change any medication on the basis of this page.",
  "If you are outside your home country, ask for the local emergency number at any pharmacy or hospital reception.",
];

export function screenForEmergency(text: string): SafetyScreenResult {
  const lower = text.toLowerCase();
  const matched: { id: string; label: string; triggeredBy: string }[] = [];

  for (const rule of SAFETY_RULES) {
    const hit = rule.patterns.map((p) => matchedText(lower, p)).find(Boolean);
    if (!hit) continue;
    if (rule.requires && !rule.requires.some((p) => p.test(lower))) continue;
    matched.push({ id: rule.id, label: rule.label, triggeredBy: hit });
  }

  const crisisReading = detectCrisisReading(lower);
  if (crisisReading) {
    matched.push({
      id: "blood-pressure-crisis-reading",
      label: `Blood pressure reading at or above ${SYSTOLIC_CRISIS}/${DIASTOLIC_CRISIS}`,
      triggeredBy: crisisReading,
    });
  }

  if (matched.length === 0) {
    return {
      isEmergency: false,
      matchedRules: [],
      message: null,
      steps: [],
      sourceIds: [],
    };
  }

  const sourceIdSet = new Set<string>();
  for (const rule of SAFETY_RULES) {
    if (matched.some((m) => m.id === rule.id)) {
      for (const id of rule.sourceIds) sourceIdSet.add(id);
    }
  }
  if (crisisReading) {
    sourceIdSet.add("who-hypertension");
    sourceIdSet.add("mlp-high-blood-pressure");
  }

  return {
    isEmergency: true,
    matchedRules: matched,
    message: EMERGENCY_MESSAGE,
    steps: EMERGENCY_STEPS,
    sourceIds: Array.from(sourceIdSet),
  };
}
