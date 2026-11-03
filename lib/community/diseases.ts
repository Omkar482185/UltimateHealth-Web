/**
 * Disease community metadata.
 *
 * The community is one implementation with a per-disease configuration, not one
 * page per condition. Everything that changes between Chikungunya and, say, high
 * blood pressure lives here: the introduction, the purpose, the discussion
 * topics, which corpus topic the related reading comes from, and which verified
 * external resources are shown.
 *
 * This module is imported by client components (the composer's topic list), so it
 * must stay free of database and Node imports.
 */
import type { TopicId } from "@/lib/corpus/sources";

export type CommunityTopic = {
  id: string;
  label: string;
  /** Shown under the label in the composer, to steer without prescribing. */
  hint: string;
};

export type DiseaseCommunity = {
  id: string;
  name: string;
  /** Short label for chips and breadcrumbs. */
  shortName: string;
  intro: string;
  purpose: string;
  /** Discussion categories for this disease, not a generic shared list. */
  topics: readonly CommunityTopic[];
  /** Corpus topic used for related reading and the assistant link, when covered. */
  corpusTopic?: TopicId;
  /** Existing disease information page, when one exists. */
  infoPath?: string;
  /** Verified external resources, by id in lib/community/external.ts. */
  externalIds: readonly string[];
  /** One prompt offered as a starting point in the composer. */
  starterQuestion: string;
};

export const DISEASES: readonly DiseaseCommunity[] = [
  {
    id: "chikungunya",
    name: "Chikungunya",
    shortName: "Chikungunya",
    intro:
      "Chikungunya is a mosquito-borne viral illness. Fever and joint pain are the symptoms most often described, and for some people the joint pain and tiredness last well beyond the first week.",
    purpose:
      "This community is for people who have had chikungunya, are recovering now, or are caring for someone who is. Share what recovery has actually been like, ask practical questions, and hear how other people have managed the everyday parts that a fact sheet cannot answer.",
    topics: [
      {
        id: "recovery",
        label: "Recovery experiences",
        hint: "What the first weeks and months were like for you.",
      },
      {
        id: "joints",
        label: "Joint pain and mobility",
        hint: "Everyday movement, stiffness, and what helped you keep going.",
      },
      {
        id: "fatigue",
        label: "Fatigue and daily energy",
        hint: "Tiredness, pacing, and returning to work or study.",
      },
      {
        id: "emotional",
        label: "Coping emotionally",
        hint: "Worry, frustration, low mood, and what support looked like.",
      },
      {
        id: "carers",
        label: "Supporting a family member",
        hint: "Practical caregiving and looking after yourself too.",
      },
      {
        id: "doctor-questions",
        label: "Questions for a doctor",
        hint: "What to ask at appointments, and how you prepared.",
      },
      {
        id: "care-navigation",
        label: "Healthcare and follow-up",
        hint: "Tests, referrals, follow-up visits, and getting listened to.",
      },
    ],
    corpusTopic: "mosquito-borne-disease",
    infoPath: "/chikungunya",
    externalIds: [
      "healthcircle-chikungunya",
      "patientslikeme-chikungunya",
      "who-chikungunya",
    ],
    starterQuestion:
      "What has recovery from chikungunya been like for you, and what helped with the joint pain?",
  },
  {
    id: "dengue",
    name: "Dengue",
    shortName: "Dengue",
    intro:
      "Dengue is a mosquito-borne viral infection. Many people recover within a week or two, but tiredness can linger, and the warning signs during the illness need urgent medical attention.",
    purpose:
      "A space to talk about what dengue was like day to day, how recovery went, and how to prepare for appointments, without presenting any one person's experience as medical advice.",
    topics: [
      {
        id: "recovery",
        label: "Recovery experiences",
        hint: "The illness itself and the weeks afterwards.",
      },
      {
        id: "fatigue",
        label: "Fatigue and returning to activity",
        hint: "Getting energy back, and how long it took for you.",
      },
      {
        id: "carers",
        label: "Supporting someone with dengue",
        hint: "Caring for a family member and watching for warning signs.",
      },
      {
        id: "doctor-questions",
        label: "Questions for a doctor",
        hint: "What you asked, and what helped you understand the answer.",
      },
      {
        id: "prevention",
        label: "Prevention and mosquito control",
        hint: "What you do at home and in your neighbourhood.",
      },
      {
        id: "care-navigation",
        label: "Healthcare and follow-up",
        hint: "Tests, monitoring, and follow-up after recovery.",
      },
    ],
    corpusTopic: "mosquito-borne-disease",
    externalIds: ["who-dengue"],
    starterQuestion:
      "How long did it take before you felt like yourself again after dengue?",
  },
  {
    id: "high-blood-pressure",
    name: "High blood pressure",
    shortName: "Blood pressure",
    intro:
      "High blood pressure usually has no symptoms. It is found by measurement, and managing it is usually a long-term mix of monitoring, everyday habits, and medicines when a clinician prescribes them.",
    purpose:
      "For people living with raised blood pressure and the people who support them. Compare what monitoring and appointments are actually like, and ask the practical questions that come up between visits.",
    topics: [
      {
        id: "diagnosis",
        label: "Getting diagnosed",
        hint: "What the first readings and conversations were like.",
      },
      {
        id: "monitoring",
        label: "Home monitoring routines",
        hint: "How you remember to measure, and what you record.",
      },
      {
        id: "medication-routines",
        label: "Living with a medicine routine",
        hint: "Practical routines and side effects to raise with a clinician.",
      },
      {
        id: "lifestyle",
        label: "Everyday habits",
        hint: "Food, movement, salt, and what has been realistic for you.",
      },
      {
        id: "appointments",
        label: "Appointments and results",
        hint: "Understanding readings, tests, and follow-up.",
      },
      {
        id: "emotional",
        label: "Coping and encouragement",
        hint: "Worry about the long term, and what helps.",
      },
      {
        id: "carers",
        label: "Supporting a family member",
        hint: "Helping someone else without taking over.",
      },
    ],
    corpusTopic: "hypertension",
    externalIds: ["who-hypertension"],
    starterQuestion:
      "What helped you build a home blood pressure routine you could actually keep up?",
  },
  {
    id: "type-2-diabetes",
    name: "Type 2 diabetes",
    shortName: "Type 2 diabetes",
    intro:
      "Type 2 diabetes affects how the body uses glucose. Day-to-day management usually involves monitoring, food and activity, and medicines when prescribed, alongside regular review with a clinician.",
    purpose:
      "Share the ordinary parts of living with type 2 diabetes: what monitoring is like, how appointments go, and how you fit the rest of life around it. Experiences here are personal, not treatment instructions.",
    topics: [
      {
        id: "diagnosis",
        label: "Diagnosis and first steps",
        hint: "What the first weeks were like, and what you wish you had known.",
      },
      {
        id: "monitoring",
        label: "Monitoring routines",
        hint: "Testing, recording, and remembering to do it.",
      },
      {
        id: "food-and-activity",
        label: "Food, movement and daily life",
        hint: "What has been realistic, affordable, and sustainable for you.",
      },
      {
        id: "appointments",
        label: "Appointments and results",
        hint: "Preparing for reviews and understanding what the numbers mean.",
      },
      {
        id: "emotional",
        label: "Coping and encouragement",
        hint: "Diabetes distress, fatigue, and what support helped.",
      },
      {
        id: "carers",
        label: "Supporting a family member",
        hint: "Helping someone else while respecting their choices.",
      },
      {
        id: "care-navigation",
        label: "Healthcare and follow-up",
        hint: "Referrals, prescriptions, and getting questions answered.",
      },
    ],
    corpusTopic: "metabolic-health",
    externalIds: ["who-diabetes"],
    starterQuestion:
      "What does a normal week of managing type 2 diabetes look like for you?",
  },
  {
    id: "endometriosis",
    name: "Endometriosis",
    shortName: "Endometriosis",
    intro:
      "Endometriosis is a condition in which tissue similar to the lining of the uterus grows outside it. Pain, bleeding and other symptoms vary widely between people, and getting a diagnosis can take time.",
    purpose:
      "A space to describe what living with endometriosis is actually like: pain and daily life, appointments and diagnosis, treatment experiences, work and study, and the emotional load. Experiences are personal and are not treatment advice.",
    topics: [
      {
        id: "diagnosis",
        label: "Getting diagnosed",
        hint: "Appointments, tests, delays, and what helped you keep going.",
      },
      {
        id: "pain-and-daily-life",
        label: "Pain and daily life",
        hint: "What symptoms interfere with, and how you manage ordinary days.",
      },
      {
        id: "treatment-experiences",
        label: "Treatment experiences",
        hint: "What you tried and how it went for you, not a recommendation.",
      },
      {
        id: "work-and-study",
        label: "Work, study and energy",
        hint: "Disclosure, pacing, time off, and practical arrangements.",
      },
      {
        id: "emotional",
        label: "Emotional support",
        hint: "Pain, fatigue, frustration, relationships, and what helps.",
      },
      {
        id: "appointments",
        label: "Appointments and care",
        hint: "Preparing for visits and getting your questions heard.",
      },
      {
        id: "carers",
        label: "Partners, family and carers",
        hint: "Supporting someone while respecting their choices.",
      },
    ],
    externalIds: ["endometriosis-uk-support"],
    starterQuestion:
      "What do you wish someone had told you when you were first seeking a diagnosis?",
  },
  {
    id: "parkinsons-disease",
    name: "Parkinson's disease",
    shortName: "Parkinson's",
    intro:
      "Parkinson's disease is a progressive neurological condition that affects movement. Symptoms, progression and the amount of help needed vary greatly from one person to another.",
    purpose:
      "For people living with Parkinson's, care partners, and family members. Share practical experiences of daily living and caring, and ask questions that a general information page cannot answer. Nothing here is a treatment recommendation.",
    topics: [
      {
        id: "newly-diagnosed",
        label: "Newly diagnosed",
        hint: "The first months, what felt overwhelming, and what helped.",
      },
      {
        id: "daily-living",
        label: "Daily living and routines",
        hint: "Movement, meals, travel, sleep, and practical adjustments.",
      },
      {
        id: "caregivers",
        label: "Care partners and family",
        hint: "Supporting someone day to day while looking after yourself.",
      },
      {
        id: "appointments",
        label: "Appointments and care",
        hint: "Preparing for reviews and keeping track of changes.",
      },
      {
        id: "emotional",
        label: "Emotional wellbeing",
        hint: "Uncertainty, mood, identity, and what support looked like.",
      },
      {
        id: "work-and-activity",
        label: "Work and staying active",
        hint: "Workplace adjustments, hobbies, and changing abilities.",
      },
      {
        id: "staying-connected",
        label: "Staying connected",
        hint: "Groups, friendships, and avoiding isolation.",
      },
    ],
    externalIds: ["pdmds-india"],
    starterQuestion:
      "What small change made daily life easier for you after diagnosis?",
  },
  {
    id: "chronic-kidney-disease",
    name: "Chronic kidney disease",
    shortName: "CKD",
    intro:
      "Chronic kidney disease (CKD) means kidney function has gradually declined over time. Early stages often have no symptoms, and management depends on the person's stage and other conditions.",
    purpose:
      "For people living with CKD and the people supporting them. Share how you manage routines, appointments, tiredness and emotional strain. Do not change medicines, diet or fluid intake based on another member's post; those decisions belong with your care team.",
    topics: [
      {
        id: "newly-diagnosed",
        label: "Newly diagnosed",
        hint: "What the first results and conversations were like.",
      },
      {
        id: "daily-routines",
        label: "Daily routines",
        hint: "Work, rest, travel, and fitting monitoring into ordinary life.",
      },
      {
        id: "appointments",
        label: "Appointments and tests",
        hint: "Understanding results and preparing for follow-up.",
      },
      {
        id: "questions-for-care-team",
        label: "Questions for your care team",
        hint: "Diet, fluids or medicines questions to raise with your clinician.",
      },
      {
        id: "fatigue",
        label: "Fatigue and energy",
        hint: "Tiredness, pacing, and what has been realistic for you.",
      },
      {
        id: "emotional",
        label: "Emotional support",
        hint: "Worry, low mood, uncertainty, and what helps.",
      },
      {
        id: "carers",
        label: "Family and carers",
        hint: "Supporting someone while respecting their decisions.",
      },
    ],
    corpusTopic: "kidney-health",
    externalIds: ["kidneycareuk-support"],
    starterQuestion:
      "What has helped you fit appointments and tiredness around the rest of your life?",
  },
];

const BY_ID = new Map(DISEASES.map((disease) => [disease.id, disease]));

export const DISEASE_IDS = DISEASES.map((disease) => disease.id);

export function isDiseaseId(value: unknown): value is string {
  return typeof value === "string" && BY_ID.has(value);
}

export function getDisease(id: string): DiseaseCommunity | null {
  return BY_ID.get(id) ?? null;
}

/** Validates a topic against one disease, so a topic cannot be borrowed from another community. */
export function isCommunityTopic(diseaseId: string, topicId: unknown): topicId is string {
  if (typeof topicId !== "string") return false;
  const disease = BY_ID.get(diseaseId);
  if (!disease) return false;
  return disease.topics.some((topic) => topic.id === topicId);
}

export function topicLabel(diseaseId: string, topicId: string): string {
  const disease = BY_ID.get(diseaseId);
  return disease?.topics.find((topic) => topic.id === topicId)?.label ?? topicId;
}
