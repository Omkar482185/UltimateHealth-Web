/**
 * Curated corpus manifest.
 *
 * Every entry was fetched and HTTP-verified during development; the `url` values
 * are the resolved URLs after redirects. Sources that returned 4xx were removed
 * rather than shipped as broken links (see `docs/corpus.md` for the verification
 * log and for why CDC content is not included).
 *
 * Licence handling is deliberately explicit. Each document records its licence
 * so that attribution is displayed with the content and so the non-commercial
 * restriction on the WHO material cannot be lost.
 */

export type CorpusSource = {
  /** Stable identifier, also used as the article slug. */
  sourceId: string;
  topic: TopicId;
  title: string;
  publisher: string;
  url: string;
  licence: string;
  licenceUrl: string | null;
};

export type TopicId =
  | "hypertension"
  | "heart-and-circulation"
  | "kidney-health"
  | "metabolic-health"
  | "prevention-and-lifestyle"
  | "mosquito-borne-disease";

export const TOPIC_LABELS: Record<TopicId, string> = {
  hypertension: "High blood pressure",
  "heart-and-circulation": "Heart and circulation",
  "kidney-health": "Kidney health",
  "metabolic-health": "Metabolic health",
  "prevention-and-lifestyle": "Prevention and lifestyle",
  "mosquito-borne-disease": "Chikungunya and mosquito-borne disease",
};

/**
 * The topic ids as a runtime value, so callers that receive a topic from a
 * request can validate it instead of trusting it. Derived from `TOPIC_LABELS`
 * rather than written out again, so the two cannot drift apart.
 */
export const TOPIC_IDS = Object.keys(TOPIC_LABELS) as TopicId[];

export function isTopicId(value: unknown): value is TopicId {
  return typeof value === "string" && TOPIC_IDS.includes(value as TopicId);
}

export const TOPIC_DESCRIPTIONS: Record<TopicId, string> = {
  hypertension:
    "What raised blood pressure is, how it is measured, how it is treated, and the warning signs that need urgent care.",
  "heart-and-circulation":
    "Conditions that share risk factors with raised blood pressure, including stroke, heart attack, and raised cholesterol.",
  "kidney-health":
    "How blood pressure and kidney function affect each other, and when kidney problems need medical review.",
  "metabolic-health":
    "Diabetes, obesity, and related conditions that frequently occur alongside raised blood pressure.",
  "prevention-and-lifestyle":
    "Physical activity, sodium intake, and stress management, which are the lifestyle factors with the strongest evidence base.",
  "mosquito-borne-disease":
    "Chikungunya and dengue: transmission, symptoms, warning signs, diagnosis, supportive care, prevention and mosquito control, and how the two illnesses differ.",
};

const MEDLINEPLUS_LICENCE =
  "Mostly public domain (US National Library of Medicine). Some embedded content is third-party and separately licensed.";
const MEDLINEPLUS_LICENCE_URL =
  "https://medlineplus.gov/about/using/usingcontent/";
const NHS_LICENCE =
  "Open Government Licence v3.0. Requires attribution to the NHS.";
const NHS_LICENCE_URL =
  "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/";
const WHO_LICENCE =
  "CC BY-NC-SA 3.0 IGO. Non-commercial use only, with attribution and share-alike.";
const WHO_LICENCE_URL = "https://creativecommons.org/licenses/by-nc-sa/3.0/igo/";
/**
 * The Indian National Centre for Vector Borne Diseases Control publishes its own
 * copyright policy rather than an open licence. It permits reproduction with a
 * prominent acknowledgement of the source and excludes third-party material, so
 * the obligation is recorded per document exactly as that policy states it.
 */
const NCVBDC_LICENCE =
  "Government of India, NCVBDC website content. Reproduction permitted with a prominent acknowledgement of the source, provided the context is not misleading or derogatory. Third-party material is excluded.";
const NCVBDC_LICENCE_URL =
  "https://ncvbdc.mohfw.gov.in/index4.php?lang=1&lid=3827&linkid=537&level=0&theme=Blue&font=Normal&Background=Dark";
/**
 * UKHSA guidance is published on GOV.UK under the Open Government Licence, which
 * is the same instrument the NHS material uses, but attribution goes to UKHSA.
 */
const UKHSA_LICENCE =
  "Open Government Licence v3.0. Requires attribution to the UK Health Security Agency.";
const OGL_URL =
  "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/";

export const CORPUS_SOURCES: CorpusSource[] = [
  // --- MedlinePlus (US National Library of Medicine) ---
  {
    sourceId: "mlp-high-blood-pressure",
    topic: "hypertension",
    title: "High Blood Pressure",
    publisher: "MedlinePlus (US National Library of Medicine)",
    url: "https://medlineplus.gov/highbloodpressure.html",
    licence: MEDLINEPLUS_LICENCE,
    licenceUrl: MEDLINEPLUS_LICENCE_URL,
  },
  {
    sourceId: "mlp-prevent-high-blood-pressure",
    topic: "hypertension",
    title: "How to Prevent High Blood Pressure",
    publisher: "MedlinePlus (US National Library of Medicine)",
    url: "https://medlineplus.gov/howtopreventhighbloodpressure.html",
    licence: MEDLINEPLUS_LICENCE,
    licenceUrl: MEDLINEPLUS_LICENCE_URL,
  },
  {
    sourceId: "mlp-blood-pressure-medicines",
    topic: "hypertension",
    title: "Blood Pressure Medicines",
    publisher: "MedlinePlus (US National Library of Medicine)",
    url: "https://medlineplus.gov/bloodpressuremedicines.html",
    licence: MEDLINEPLUS_LICENCE,
    licenceUrl: MEDLINEPLUS_LICENCE_URL,
  },
  {
    sourceId: "mlp-sodium",
    topic: "hypertension",
    title: "Sodium",
    publisher: "MedlinePlus (US National Library of Medicine)",
    url: "https://medlineplus.gov/sodium.html",
    licence: MEDLINEPLUS_LICENCE,
    licenceUrl: MEDLINEPLUS_LICENCE_URL,
  },
  {
    sourceId: "mlp-stroke",
    topic: "heart-and-circulation",
    title: "Stroke",
    publisher: "MedlinePlus (US National Library of Medicine)",
    url: "https://medlineplus.gov/stroke.html",
    licence: MEDLINEPLUS_LICENCE,
    licenceUrl: MEDLINEPLUS_LICENCE_URL,
  },
  {
    sourceId: "mlp-heart-attack",
    topic: "heart-and-circulation",
    title: "Heart Attack",
    publisher: "MedlinePlus (US National Library of Medicine)",
    url: "https://medlineplus.gov/heartattack.html",
    licence: MEDLINEPLUS_LICENCE,
    licenceUrl: MEDLINEPLUS_LICENCE_URL,
  },
  {
    sourceId: "mlp-cholesterol",
    topic: "heart-and-circulation",
    title: "Cholesterol",
    publisher: "MedlinePlus (US National Library of Medicine)",
    url: "https://medlineplus.gov/cholesterol.html",
    licence: MEDLINEPLUS_LICENCE,
    licenceUrl: MEDLINEPLUS_LICENCE_URL,
  },
  {
    sourceId: "mlp-prevent-heart-disease",
    topic: "heart-and-circulation",
    title: "How to Prevent Heart Disease",
    publisher: "MedlinePlus (US National Library of Medicine)",
    url: "https://medlineplus.gov/howtopreventheartdisease.html",
    licence: MEDLINEPLUS_LICENCE,
    licenceUrl: MEDLINEPLUS_LICENCE_URL,
  },
  {
    sourceId: "mlp-kidney-failure",
    topic: "kidney-health",
    title: "Kidney Failure",
    publisher: "MedlinePlus (US National Library of Medicine)",
    url: "https://medlineplus.gov/kidneyfailure.html",
    licence: MEDLINEPLUS_LICENCE,
    licenceUrl: MEDLINEPLUS_LICENCE_URL,
  },
  {
    sourceId: "mlp-type-2-diabetes",
    topic: "metabolic-health",
    title: "Type 2 Diabetes",
    publisher: "MedlinePlus (US National Library of Medicine)",
    url: "https://medlineplus.gov/diabetestype2.html",
    licence: MEDLINEPLUS_LICENCE,
    licenceUrl: MEDLINEPLUS_LICENCE_URL,
  },
  {
    sourceId: "mlp-diabetes",
    topic: "metabolic-health",
    title: "Diabetes",
    publisher: "MedlinePlus (US National Library of Medicine)",
    url: "https://medlineplus.gov/diabetes.html",
    licence: MEDLINEPLUS_LICENCE,
    licenceUrl: MEDLINEPLUS_LICENCE_URL,
  },
  {
    sourceId: "mlp-obesity",
    topic: "metabolic-health",
    title: "Obesity",
    publisher: "MedlinePlus (US National Library of Medicine)",
    url: "https://medlineplus.gov/obesity.html",
    licence: MEDLINEPLUS_LICENCE,
    licenceUrl: MEDLINEPLUS_LICENCE_URL,
  },
  {
    sourceId: "mlp-exercise-fitness",
    topic: "prevention-and-lifestyle",
    title: "Exercise and Physical Fitness",
    publisher: "MedlinePlus (US National Library of Medicine)",
    url: "https://medlineplus.gov/exerciseandphysicalfitness.html",
    licence: MEDLINEPLUS_LICENCE,
    licenceUrl: MEDLINEPLUS_LICENCE_URL,
  },
  {
    sourceId: "mlp-stress",
    topic: "prevention-and-lifestyle",
    title: "Stress",
    publisher: "MedlinePlus (US National Library of Medicine)",
    url: "https://medlineplus.gov/stress.html",
    licence: MEDLINEPLUS_LICENCE,
    licenceUrl: MEDLINEPLUS_LICENCE_URL,
  },

  // --- NHS (UK) ---
  {
    sourceId: "nhs-high-blood-pressure",
    topic: "hypertension",
    title: "High blood pressure (hypertension)",
    publisher: "NHS (UK)",
    url: "https://www.nhs.uk/conditions/high-blood-pressure/",
    licence: NHS_LICENCE,
    licenceUrl: NHS_LICENCE_URL,
  },
  {
    sourceId: "nhs-low-blood-pressure",
    topic: "hypertension",
    title: "Low blood pressure (hypotension)",
    publisher: "NHS (UK)",
    url: "https://www.nhs.uk/conditions/low-blood-pressure-hypotension/",
    licence: NHS_LICENCE,
    licenceUrl: NHS_LICENCE_URL,
  },
  {
    sourceId: "nhs-stroke-symptoms",
    topic: "heart-and-circulation",
    title: "Stroke: symptoms",
    publisher: "NHS (UK)",
    url: "https://www.nhs.uk/conditions/stroke/symptoms/",
    licence: NHS_LICENCE,
    licenceUrl: NHS_LICENCE_URL,
  },
  {
    sourceId: "nhs-stroke-treatment",
    topic: "heart-and-circulation",
    title: "Stroke: treatment",
    publisher: "NHS (UK)",
    url: "https://www.nhs.uk/conditions/stroke/treatment/",
    licence: NHS_LICENCE,
    licenceUrl: NHS_LICENCE_URL,
  },
  {
    sourceId: "nhs-heart-attack",
    topic: "heart-and-circulation",
    title: "Heart attack",
    publisher: "NHS (UK)",
    url: "https://www.nhs.uk/conditions/heart-attack/",
    licence: NHS_LICENCE,
    licenceUrl: NHS_LICENCE_URL,
  },
  {
    sourceId: "nhs-high-cholesterol",
    topic: "heart-and-circulation",
    title: "High cholesterol",
    publisher: "NHS (UK)",
    url: "https://www.nhs.uk/conditions/high-cholesterol/",
    licence: NHS_LICENCE,
    licenceUrl: NHS_LICENCE_URL,
  },
  {
    sourceId: "nhs-cholesterol-medicines",
    topic: "heart-and-circulation",
    title: "Medicines for high cholesterol",
    publisher: "NHS (UK)",
    url: "https://www.nhs.uk/conditions/high-cholesterol/medicines-for-high-cholesterol/",
    licence: NHS_LICENCE,
    licenceUrl: NHS_LICENCE_URL,
  },
  {
    sourceId: "nhs-kidney-disease",
    topic: "kidney-health",
    title: "Kidney disease",
    publisher: "NHS (UK)",
    url: "https://www.nhs.uk/conditions/kidney-disease/",
    licence: NHS_LICENCE,
    licenceUrl: NHS_LICENCE_URL,
  },
  {
    sourceId: "nhs-type-2-diabetes-symptoms",
    topic: "metabolic-health",
    title: "Type 2 diabetes: symptoms",
    publisher: "NHS (UK)",
    url: "https://www.nhs.uk/conditions/type-2-diabetes/symptoms/",
    licence: NHS_LICENCE,
    licenceUrl: NHS_LICENCE_URL,
  },
  {
    sourceId: "nhs-type-2-diabetes-treatment",
    topic: "metabolic-health",
    title: "Type 2 diabetes: treatment",
    publisher: "NHS (UK)",
    url: "https://www.nhs.uk/conditions/type-2-diabetes/treatment/",
    licence: NHS_LICENCE,
    licenceUrl: NHS_LICENCE_URL,
  },
  {
    sourceId: "nhs-exercise-health-benefits",
    topic: "prevention-and-lifestyle",
    title: "Exercise: health benefits",
    publisher: "NHS (UK)",
    url: "https://www.nhs.uk/live-well/exercise/exercise-health-benefits/",
    licence: NHS_LICENCE,
    licenceUrl: NHS_LICENCE_URL,
  },

  // --- WHO ---
  {
    sourceId: "who-hypertension",
    topic: "hypertension",
    title: "Hypertension",
    publisher: "World Health Organization",
    url: "https://www.who.int/news-room/fact-sheets/detail/hypertension",
    licence: WHO_LICENCE,
    licenceUrl: WHO_LICENCE_URL,
  },
  {
    sourceId: "who-sodium-reduction",
    topic: "hypertension",
    title: "Sodium reduction",
    publisher: "World Health Organization",
    url: "https://www.who.int/news-room/fact-sheets/detail/sodium-reduction",
    licence: WHO_LICENCE,
    licenceUrl: WHO_LICENCE_URL,
  },
  {
    sourceId: "who-noncommunicable-diseases",
    topic: "heart-and-circulation",
    title: "Noncommunicable diseases",
    publisher: "World Health Organization",
    url: "https://www.who.int/news-room/fact-sheets/detail/noncommunicable-diseases",
    licence: WHO_LICENCE,
    licenceUrl: WHO_LICENCE_URL,
  },
  {
    sourceId: "who-diabetes",
    topic: "metabolic-health",
    title: "Diabetes",
    publisher: "World Health Organization",
    url: "https://www.who.int/news-room/fact-sheets/detail/diabetes",
    licence: WHO_LICENCE,
    licenceUrl: WHO_LICENCE_URL,
  },
  {
    sourceId: "who-obesity",
    topic: "metabolic-health",
    title: "Obesity and overweight",
    publisher: "World Health Organization",
    url: "https://www.who.int/news-room/fact-sheets/detail/obesity-and-overweight",
    licence: WHO_LICENCE,
    licenceUrl: WHO_LICENCE_URL,
  },
  {
    sourceId: "who-physical-activity",
    topic: "prevention-and-lifestyle",
    title: "Physical activity",
    publisher: "World Health Organization",
    url: "https://www.who.int/news-room/fact-sheets/detail/physical-activity",
    licence: WHO_LICENCE,
    licenceUrl: WHO_LICENCE_URL,
  },

  // --- Chikungunya and dengue ---
  //
  // Five documents, chosen so the topic can be answered without borrowing text
  // from a source that forbids it:
  //
  //  - WHO covers transmission, symptoms, diagnosis, treatment and prevention,
  //    and its dengue fact sheet is included because the two illnesses are the
  //    ones people most often confuse. WHO guidance itself says chikungunya is
  //    "easy to misdiagnose" for this reason, so differentiation is a corpus
  //    requirement rather than a nice-to-have.
  //  - NCVBDC is the Indian national programme responsible for vector-borne
  //    disease, which is the authority a reader in India would be pointed to.
  //  - MedlinePlus gives a plain-language summary and a US view of the same
  //    material.
  //  - UKHSA covers the epidemiology and the prevention and vaccine position.
  //
  // CDC was re-checked and is still excluded: every CDC URL returns HTTP 403 to
  // this ingester, as documented in docs/corpus.md. The access control is not
  // circumvented.
  {
    sourceId: "who-chikungunya",
    topic: "mosquito-borne-disease",
    title: "Chikungunya",
    publisher: "World Health Organization",
    url: "https://www.who.int/news-room/fact-sheets/detail/chikungunya",
    licence: WHO_LICENCE,
    licenceUrl: WHO_LICENCE_URL,
  },
  {
    sourceId: "who-dengue",
    topic: "mosquito-borne-disease",
    title: "Dengue and severe dengue",
    publisher: "World Health Organization",
    url: "https://www.who.int/news-room/fact-sheets/detail/dengue-and-severe-dengue",
    licence: WHO_LICENCE,
    licenceUrl: WHO_LICENCE_URL,
  },
  {
    sourceId: "ncvbdc-chikungunya",
    topic: "mosquito-borne-disease",
    title: "Facts about Chikungunya",
    publisher: "National Centre for Vector Borne Diseases Control, Ministry of Health and Family Welfare, India",
    url: "https://ncvbdc.mohfw.gov.in/index1.php?lang=1&level=2&sublinkid=5968&lid=3764",
    licence: NCVBDC_LICENCE,
    licenceUrl: NCVBDC_LICENCE_URL,
  },
  {
    sourceId: "mlp-chikungunya",
    topic: "mosquito-borne-disease",
    title: "Chikungunya",
    publisher: "MedlinePlus (US National Library of Medicine)",
    url: "https://medlineplus.gov/chikungunya.html",
    licence: MEDLINEPLUS_LICENCE,
    licenceUrl: MEDLINEPLUS_LICENCE_URL,
  },
  {
    sourceId: "ukhsa-chikungunya",
    topic: "mosquito-borne-disease",
    title: "Chikungunya",
    publisher: "UK Health Security Agency",
    url: "https://www.gov.uk/guidance/chikungunya",
    licence: UKHSA_LICENCE,
    licenceUrl: OGL_URL,
  },

  // --- Added for the Indian hypertension position ---
  {
    sourceId: "who-india-hypertension",
    topic: "hypertension",
    title: "Hypertension in India",
    publisher: "World Health Organization (India)",
    url: "https://www.who.int/india/health-topics/hypertension",
    licence: WHO_LICENCE,
    licenceUrl: WHO_LICENCE_URL,
  },
];
