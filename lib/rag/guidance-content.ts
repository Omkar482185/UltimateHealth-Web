/**
 * Guidance content that the browser needs.
 *
 * This module deliberately imports nothing server-side (no database, no model
 * client) so that the guidance form can import it without pulling retrieval code
 * into the client bundle. The wording lives here rather than in the orchestration
 * module for that reason.
 */

export const SYMPTOM_OPTIONS = [
  { id: "chest-pain", label: "Chest pain, pressure, or tightness" },
  {
    id: "stroke-signs",
    label: "Sudden face drooping, arm weakness, or slurred speech",
  },
  { id: "breathing", label: "Difficulty breathing or shortness of breath" },
  { id: "fainting", label: "Fainting or loss of consciousness" },
  { id: "seizure", label: "Seizure or convulsions" },
  { id: "bleeding", label: "Severe or uncontrolled bleeding" },
  { id: "swelling-face", label: "Swelling of the face or throat" },
  { id: "sudden-headache", label: "Sudden severe headache" },
  { id: "vision", label: "Blurred vision or changes in vision" },
  { id: "dizziness", label: "Dizziness or light-headedness" },
  { id: "headache", label: "Headache" },
  { id: "nosebleeds", label: "Nosebleeds" },
  { id: "palpitations", label: "Palpitations or a pounding heartbeat" },
  { id: "exertion-breath", label: "Shortness of breath on exertion" },
  { id: "ankle-swelling", label: "Swelling in the ankles or legs" },
  { id: "fatigue", label: "Tiredness or fatigue" },
  { id: "urine", label: "Blood in the urine or passing much less urine" },
  { id: "none", label: "No symptoms at all" },
] as const;

export type SymptomOptionId = (typeof SYMPTOM_OPTIONS)[number]["id"];

/**
 * Warning signs shown to every reader, each linked to the corpus documents that
 * document it. Authored from those documents, not generated.
 */
export const WARNING_SIGNS: { text: string; sourceIds: string[] }[] = [
  {
    text: "A blood pressure reading of 180/120 or higher, even without symptoms.",
    sourceIds: ["who-hypertension", "mlp-high-blood-pressure"],
  },
  {
    text: "Chest pain, pressure, or tightness, especially with breathlessness, sweating, or pain spreading to the arm, neck, or jaw.",
    sourceIds: ["mlp-heart-attack", "nhs-heart-attack"],
  },
  {
    text: "Sudden face drooping, weakness in an arm, or difficulty speaking.",
    sourceIds: ["nhs-stroke-symptoms", "mlp-stroke"],
  },
  {
    text: "A sudden severe headache, sudden confusion, or sudden loss of vision.",
    sourceIds: ["nhs-stroke-symptoms", "mlp-stroke"],
  },
  {
    text: "Difficulty breathing or severe shortness of breath.",
    sourceIds: ["mlp-heart-attack", "nhs-heart-attack"],
  },
  {
    text: "Fainting or loss of consciousness.",
    sourceIds: ["nhs-low-blood-pressure"],
  },
  {
    text: "New swelling in the ankles or legs, or a marked change in how much urine you pass.",
    sourceIds: ["mlp-kidney-failure", "nhs-kidney-disease"],
  },
];

/**
 * The first step of the guidance workflow: one yes/no question per emergency rule.
 *
 * `id` is a `SAFETY_RULES` id, not a symptom id, so a question cannot exist without
 * a rule behind it. The wording is deliberately close to the rule's own label,
 * because the labels are what the deterministic screen matches on: answering yes
 * to a question and having the screen fire are the same event, and a unit check
 * asserts that for every entry rather than trusting the wording to stay aligned.
 *
 * No question here is asked after a warning sign has been reported. Escalation
 * comes first and does not depend on the network or a language model.
 */
export const EMERGENCY_QUESTIONS: { id: string; label: string; detail: string }[] = [
  {
    id: "possible-heart-attack",
    label: "Chest pain or pressure",
    detail: "Chest pain, pressure, tightness, or heaviness, especially with sweating or pain spreading to the arm, neck, or jaw.",
  },
  {
    id: "possible-stroke",
    label: "Possible stroke signs",
    detail: "Sudden face drooping, weakness in an arm or leg, slurred speech, sudden confusion, or sudden loss of vision.",
  },
  {
    id: "breathing-difficulty",
    label: "Difficulty breathing",
    detail: "Severe difficulty breathing, or breathlessness that has come on suddenly.",
  },
  {
    id: "loss-of-consciousness",
    label: "Fainting or loss of consciousness",
    detail: "Fainting, passing out, or briefly losing consciousness.",
  },
  {
    id: "seizure",
    label: "Seizure",
    detail: "A seizure, fit, or convulsion.",
  },
  {
    id: "severe-bleeding",
    label: "Severe or uncontrolled bleeding",
    detail: "Heavy bleeding that will not stop, or vomiting or coughing up blood.",
  },
  {
    id: "possible-severe-arboviral-bleeding",
    label: "Bleeding that guidance associates with severe dengue",
    detail: "Bleeding gums or nose, or blood in vomit or stool. This can appear after a fever seems to be settling.",
  },
  {
    id: "possible-severe-dengue",
    label: "Possible severe dengue",
    detail: "Persistent vomiting, severe stomach pain, or nosebleeds, along with a fever or a recent fever.",
  },
  {
    id: "possible-anaphylaxis",
    label: "Swelling of the face, lips, or throat",
    detail: "Swelling of the face, lips, or throat, or a throat that feels like it is closing.",
  },
  {
    id: "mentioned-hypertensive-crisis",
    label: "Hypertensive crisis mentioned",
    detail: "A clinician or a monitor has described your reading as a hypertensive crisis or emergency.",
  },
  {
    id: "possible-self-harm",
    label: "Thoughts of self-harm",
    // The wording carries the phrases the rule matches on, so that answering yes
    // and firing the rule are the same event. A unit check asserts that.
    detail: "Thoughts of suicide or of self-harm. Support is available, and this question is not routine.",
  },
  {
    id: "pregnancy-warning-sign",
    label: "Warning signs during pregnancy",
    detail: "Pregnant, with a severe headache, blurred vision, sudden swelling, severe stomach pain, or bleeding.",
  },
];

/**
 * The clarifying step, in two rounds.
 *
 * Round 1 is chosen from the symptoms that were selected. Round 2 is chosen from an
 * *answer*, which is the whole point of it: a question in round 2 names the earlier
 * questions it depends on and the answers that make it relevant, so the same
 * symptom can lead to different second questions depending on what was said first.
 * Round 2 also carries `why`, a sentence naming the earlier answer that brought it
 * up, so the reason a question is being asked is shown rather than guessed at.
 *
 * Only the symptoms whose own wording does *not* already fire a rule appear in round
 * 1, and that is a reachability constraint rather than curation. A symptom label
 * that already escalates (chest pain, a sudden severe headache, shortness of breath)
 * makes the first submission an emergency, and nothing is asked once a warning sign
 * has been reported. A question attached to one of those symptoms could never be
 * shown. A unit check derives that set by screening each symptom label, so the table
 * cannot quietly collect dead entries as the symptom list changes.
 *
 * `escalatesTo` is required and is a `SAFETY_RULES` id, so a yes-answer enters the
 * emergency screen through the same validated path as a first-step answer. There is
 * deliberately no field that lowers anything: a no and an unknown are both absent
 * from what the screen is given, which makes "answers can only escalate" a property
 * of the shape of the data rather than a rule to remember.
 */
export type FollowUpAnswer = "yes" | "no" | "unknown";

export type FollowUpQuestion = {
  id: string;
  /** 1: chosen from the selected symptoms. 2: chosen from an earlier answer. */
  round: 1 | 2;
  label: string;
  detail: string;
  /** Round 1 only: asked when any of these symptom ids was selected. */
  forSymptoms: string[];
  /** Round 2 only: every one of these must already have been answered. */
  afterQuestions: string[];
  /**
   * Round 2 only: offered when at least one of `afterQuestions` was answered one
   * of these. `unknown` is listed explicitly rather than treated as a no, because a
   * question the person could not answer has not thereby become a negative finding.
   */
  afterAnswers: FollowUpAnswer[];
  /** Round 2 only: the earlier answer that brought this question up, in reader terms. */
  why: string | null;
  /** The `SAFETY_RULES` id a yes-answer declares. */
  escalatesTo: string;
  sourceIds: string[];
};

/**
 * Documented ceilings on how much is asked. They are asserted by a unit check that
 * runs the widest possible trigger and fails if the matched set exceeds them, so a
 * question is never dropped silently to fit: the check breaks and the ceiling has to
 * be raised deliberately instead.
 */
export const FOLLOW_UP_LIMITS = {
  rounds: 2,
  firstRound: 8,
  secondRound: 3,
} as const;

export const FOLLOW_UP_QUESTIONS: FollowUpQuestion[] = [
  {
    id: "headache-sudden-severe",
    round: 1,
    label:
      "Is this the worst headache you have ever had, or did it come on suddenly?",
    detail:
      "A sudden or severe headache is listed among the warning signs of a stroke, and is treated differently from an ordinary headache.",
    forSymptoms: ["headache"],
    afterQuestions: [],
    afterAnswers: [],
    why: null,
    escalatesTo: "possible-stroke",
    sourceIds: ["nhs-stroke-symptoms", "mlp-stroke"],
  },
  {
    id: "headache-pregnancy",
    round: 1,
    label:
      "Are you pregnant, or could you be, with a severe headache, blurred vision, or sudden swelling?",
    detail:
      "Guidance treats a severe headache, blurred vision, or sudden swelling during pregnancy as a reason to seek care urgently rather than to wait.",
    forSymptoms: ["headache", "vision", "ankle-swelling"],
    afterQuestions: [],
    afterAnswers: [],
    why: null,
    escalatesTo: "pregnancy-warning-sign",
    sourceIds: ["who-hypertension"],
  },
  {
    id: "vision-sudden",
    round: 1,
    label:
      "Did the change in vision come on suddenly, or with weakness or numbness?",
    detail:
      "A sudden change or loss of vision is listed among the warning signs of a stroke.",
    forSymptoms: ["vision"],
    afterQuestions: [],
    afterAnswers: [],
    why: null,
    escalatesTo: "possible-stroke",
    sourceIds: ["nhs-stroke-symptoms", "mlp-stroke"],
  },
  {
    id: "dizziness-sudden-one-sided",
    round: 1,
    label:
      "Did the dizziness come on suddenly, or is there weakness or numbness on one side of your body?",
    detail:
      "Sudden dizziness, or weakness or numbness on one side, is listed among the warning signs of a stroke.",
    forSymptoms: ["dizziness"],
    afterQuestions: [],
    afterAnswers: [],
    why: null,
    escalatesTo: "possible-stroke",
    sourceIds: ["nhs-stroke-symptoms", "mlp-stroke"],
  },
  {
    id: "palpitations-chest-pain",
    round: 1,
    label:
      "With the palpitations, do you also have chest pain or pressure, or difficulty breathing?",
    detail:
      "Chest pain or pressure together with breathlessness is one of the combinations guidance treats as an emergency.",
    forSymptoms: ["palpitations"],
    afterQuestions: [],
    afterAnswers: [],
    why: null,
    escalatesTo: "possible-heart-attack",
    sourceIds: ["mlp-heart-attack", "nhs-heart-attack"],
  },
  {
    id: "nosebleed-with-fever",
    round: 1,
    label:
      "Have you also had a fever, or are you in or recently returned from an area where dengue occurs?",
    detail:
      "A nosebleed alongside a fever or a recent fever is treated as a warning sign of severe dengue, and often appears as the fever seems to be settling.",
    forSymptoms: ["nosebleeds"],
    afterQuestions: [],
    afterAnswers: [],
    why: null,
    escalatesTo: "possible-severe-dengue",
    sourceIds: ["who-dengue"],
  },

  // ---- Round 2. Each one depends on the answer above it, not on the symptoms. ----

  {
    id: "palpitations-fainting",
    // Only asked when chest pain and breathlessness were said not to apply, or the
    // person could not say. If they did apply, the screen has already escalated and
    // there is nothing further to ask, so this question is genuinely downstream of
    // the previous answer rather than asked alongside it.
    round: 2,
    label: "Have you fainted, or nearly passed out, with the palpitations?",
    detail:
      "Fainting is a reason to seek care urgently rather than to keep monitoring at home.",
    forSymptoms: [],
    afterQuestions: ["palpitations-chest-pain"],
    afterAnswers: ["no", "unknown"],
    why: "You said chest pain and breathlessness do not apply. The next sign guidance looks for alongside palpitations is whether you lost consciousness.",
    escalatesTo: "loss-of-consciousness",
    sourceIds: ["nhs-low-blood-pressure"],
  },
  {
    id: "nosebleed-arboviral-bleeding",
    // The fever half of the dengue warning sign has been answered no or unknown, so
    // this asks the other half. Bleeding is a dengue warning sign in its own right and
    // carries no fever requirement, which is what makes this a different question
    // rather than a repeat of the one above it.
    round: 2,
    label:
      "Are your gums bleeding as well, or is there blood in your vomit or stool?",
    detail:
      "Bleeding gums or nose, or blood in vomit or stool, is listed as a reason to seek care immediately, and often appears after a fever seems to be settling.",
    forSymptoms: [],
    afterQuestions: ["nosebleed-with-fever"],
    afterAnswers: ["no", "unknown"],
    why: "You said there is no fever now and no recent exposure. Guidance also lists bleeding itself as a dengue warning sign, without a fever, so that is what this asks about.",
    escalatesTo: "possible-severe-arboviral-bleeding",
    sourceIds: ["who-dengue", "who-chikungunya"],
  },
];

/**
 * The clarifying questions a submission still owes, given what has been answered.
 *
 * Deterministic and content-keyed: the same symptoms and answers always produce the
 * same questions in the same order, which is the bank's order, with round 1 before
 * round 2. Nothing here reads the reading, the notes, or model output, and nothing is
 * truncated, so no escalation path can be dropped for space.
 *
 * A question that has already been answered is not returned. That filter lives here
 * rather than in the caller so that the only thing that decides what a person is
 * owed is this function: the endpoint, the interface and the checks all read the
 * same answer instead of each applying their own rule.
 */
export function selectFollowUpQuestions(
  symptomIds: string[],
  answers: { id: string; answer: FollowUpAnswer }[] = [],
): FollowUpQuestion[] {
  const chosen = new Set(symptomIds);
  const answered = new Map(answers.map((a) => [a.id, a.answer]));

  return FOLLOW_UP_QUESTIONS.filter((question) => {
    if (answered.has(question.id)) return false;
    if (question.round === 1) {
      return question.forSymptoms.some((id) => chosen.has(id));
    }
    // Round 2. Every dependency must have been answered, and at least one of those
    // answers must be one this question follows from. An answer of `unknown` counts
    // only where it is listed, and is never inferred to be a no.
    if (!question.afterQuestions.every((id) => answered.has(id))) return false;
    return question.afterQuestions.some((id) => {
      const answer = answered.get(id);
      return answer !== undefined && question.afterAnswers.includes(answer);
    });
  });
}

/**
 * The rules declared by the questions answered yes.
 *
 * Only a yes contributes. A no and an unknown are not merely ignored: they are absent
 * from this list, so they cannot reach the screen at all. That is what makes "an
 * answer can only escalate" a property of the shape of the data rather than a rule to
 * remember, and it is why the documented care-level rules never lower a level on the
 * basis of an answer: the level reflects what was reported, not what was ruled out.
 */
export function declaredRuleIdsFromFollowUps(
  responses: { id: string; answer: FollowUpAnswer }[],
): string[] {
  const answeredYes = new Set(
    responses.filter((r) => r.answer === "yes").map((r) => r.id),
  );
  return FOLLOW_UP_QUESTIONS.filter((q) => answeredYes.has(q.id)).map(
    (q) => q.escalatesTo,
  );
}

/**
 * Signs that need same-day advice rather than emergency care. These come from
 * the NHS page's "urgent advice" block, which is distinct from its 999 advice.
 * Keeping the two tiers apart matters: sending every recurring headache to an
 * emergency department is its own kind of failure.
 */
export const URGENT_REVIEW_SIGNS: { text: string; sourceIds: string[] }[] = [
  {
    text: "Headaches or blurred vision that keep recurring.",
    sourceIds: ["nhs-high-blood-pressure"],
  },
  {
    text: "Chest pain that comes and goes.",
    sourceIds: ["nhs-high-blood-pressure"],
  },
  {
    text: "Any other symptom you are worried could be related to your blood pressure.",
    sourceIds: ["nhs-high-blood-pressure"],
  },
];

/**
 * What happens when blood pressure is actually checked and confirmed. This is
 * the part that answers "is one reading enough?", which is the most common
 * misunderstanding a home monitor creates.
 */
export const MEASUREMENT_NOTES: { text: string; sourceIds: string[] }[] = [
  {
    text: "A blood pressure test involves inflating a band (a cuff) around your upper arm and measuring the pressure in your blood vessels.",
    sourceIds: ["nhs-high-blood-pressure"],
  },
  {
    text: "If a single check suggests raised blood pressure, you may be asked to take readings at home over the next few days, to return to the surgery a few days or weeks later, or to wear a portable monitor that takes readings over 24 hours. That is what confirms it.",
    sourceIds: ["nhs-high-blood-pressure"],
  },
  {
    text: "WHO India states that hypertension is diagnosed when a reading is at or above 140/90 measured twice on different days.",
    sourceIds: ["who-india-hypertension"],
  },
  {
    text: "The threshold depends on where the reading was taken: 140/90 or higher in a clinic, and 135/85 or higher at home.",
    sourceIds: ["nhs-high-blood-pressure"],
  },
  {
    text: "Most people with raised blood pressure have no symptoms at all, so a check is the only way to know. Free checks are widely offered at pharmacies in the United Kingdom for people aged 40 or over.",
    sourceIds: ["nhs-high-blood-pressure"],
  },
];

/**
 * Things associated with a higher chance of raised blood pressure, as the NHS
 * lists them. Stated as associations, not causes, and without any personalised
 * risk score, which this platform does not compute.
 */
export const RISK_FACTORS: { text: string; sourceIds: string[] }[] = [
  {
    text: "Getting older.",
    sourceIds: ["nhs-high-blood-pressure", "who-hypertension"],
  },
  {
    text: "Having close relatives with raised blood pressure.",
    sourceIds: ["nhs-high-blood-pressure"],
  },
  {
    text: "Having a Black African, Black Caribbean or South Asian ethnic background.",
    sourceIds: ["nhs-high-blood-pressure"],
  },
  {
    text: "A diet high in salt, being overweight, smoking, drinking too much alcohol, or long-term stress.",
    sourceIds: ["nhs-high-blood-pressure", "who-sodium-reduction"],
  },
];

/**
 * General measures the sources describe, which is what the "what you can do now"
 * section is built from.
 *
 * Every line here is a restatement of something a named document in the corpus
 * actually says, and each one carries the documents it came from so the reader can
 * check it. Nothing is included from general knowledge, and nothing is a target, a
 * dose, or a schedule: the sources describe habits that are associated with lower
 * blood pressure across populations, not what any one person should do.
 *
 * This section is never shown when a warning sign has been reported. Escalation
 * comes first, and ordinary self-care advice next to an emergency instruction is
 * exactly the confusion the emergency screen exists to prevent.
 */
export const SELF_CARE: { text: string; sourceIds: string[] }[] = [
  {
    text: "Eating patterns. The sources describe limiting sodium (salt) and eating enough potassium, with plenty of fruit, vegetables and whole grains, and name the DASH eating plan as one example of an eating plan that helps.",
    sourceIds: ["mlp-prevent-high-blood-pressure", "who-sodium-reduction", "mlp-sodium"],
  },
  {
    text: "Regular physical activity. The sources describe it as helping to maintain a healthy weight and to lower blood pressure.",
    sourceIds: ["mlp-prevent-high-blood-pressure", "who-physical-activity"],
  },
  {
    text: "Being at a healthy weight. The sources describe being overweight as raising the chance of raised blood pressure, and maintaining a healthy weight as helping to control it.",
    sourceIds: ["mlp-prevent-high-blood-pressure", "mlp-obesity"],
  },
  {
    text: "Alcohol and smoking. Both appear in the sources' lists of habits that raise blood pressure, and limiting them appears in the lists of changes that help.",
    sourceIds: ["nhs-high-blood-pressure", "mlp-prevent-high-blood-pressure"],
  },
  {
    text: "Reading your own monitor. The sources describe repeated readings on separate days, and a return visit or a monitor worn for 24 hours, as how raised blood pressure is confirmed rather than a single reading.",
    sourceIds: ["who-india-hypertension", "nhs-high-blood-pressure"],
  },
  {
    text: "Medicine is not covered here at all. Doses, starting, stopping or changing any medicine are decisions for a clinician or pharmacist who knows your situation, and this page does not advise on them either way.",
    sourceIds: [],
  },
];

/**
 * Why symptoms cannot settle the question, kept next to the form because it is
 * the single most likely thing a reader will get wrong.
 */
export const SYMPTOM_ASSESSMENT_LIMITS = [
  "Raised blood pressure usually causes no symptoms, so how you feel does not tell you what your blood pressure is.",
  "The symptoms people most often attribute to blood pressure, such as headache and tiredness, are common for many other reasons.",
  "A symptom list cannot tell chikungunya, dengue and other febrile illnesses apart either, which is why testing is the answer there.",
  "This form asks about symptoms to find warning signs that need care, not to work out whether you have raised blood pressure.",
];

export const FOLLOW_UP_NOTES = [
  "If you use a home monitor, a pair of readings taken a minute apart while seated and rested is more informative than a single reading.",
  "Note where each reading was taken, because the threshold differs between a clinic and home, and note the time of day.",
  "Note how long the symptoms have been present and whether anything makes them better or worse.",
  "Take a list of any medicines you currently take, including ones bought without a prescription.",
];

export const GUIDANCE_LIMITATIONS = [
  "The threshold applied depends on whether you say the reading was taken in a clinic or at home. A reading taken somewhere else is compared against the clinic threshold, which is the stricter of the two.",
  "This is general health education. It is not a diagnosis, and it cannot tell you whether you have raised blood pressure or any other condition.",
  "Raised blood pressure usually causes no symptoms at all, so the presence or absence of symptoms here does not indicate your blood pressure.",
  "The care level is produced by fixed rules over the information you entered, not by a language model, and it does not account for your medical history or other conditions.",
  "No medication advice is provided. Decisions about starting, stopping, or changing any medicine belong to a clinician or pharmacist who knows your situation.",
  "Emergency guidance is deliberately triggered by a broad list of warning signs. It may alert you in situations that turn out not to be an emergency.",
  "This page has not been clinically validated and is not a medical device.",
];
