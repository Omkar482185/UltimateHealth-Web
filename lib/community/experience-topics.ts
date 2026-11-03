/**
 * Shared vocabulary for patient-experience discovery.
 *
 * A disease community has its own discussion topics (Chikungunya has "joints",
 * endometriosis has "pain-and-daily-life"). Those are the right labels for a
 * composer, but they are not comparable across conditions, so an experience
 * filter cannot be built from them directly. This module maps each disease topic
 * to one shared experience category, by topic id rather than by disease name, so
 * adding a disease that reuses an existing topic id is covered automatically.
 *
 * Client-safe: no database or Node imports, because the explorer is a client
 * component.
 */

export type ExperienceTopicId =
  | "living-with"
  | "symptoms-impact"
  | "diagnosis"
  | "recovery"
  | "treatment"
  | "emotional"
  | "caregiving"
  | "coping";

export type ExperienceTopic = {
  id: ExperienceTopicId;
  label: string;
  /** One line shown under the filter, describing what belongs here. */
  description: string;
  /** Disease-community topic ids that belong to this category. */
  nativeTopicIds: readonly string[];
};

export const EXPERIENCE_TOPICS: readonly ExperienceTopic[] = [
  {
    id: "living-with",
    label: "Living with the condition",
    description: "Daily routines, work, study, travel, and practical adjustments.",
    nativeTopicIds: [
      "daily-living",
      "daily-routines",
      "work-and-study",
      "work-and-activity",
      "staying-connected",
    ],
  },
  {
    id: "symptoms-impact",
    label: "Symptoms and daily impact",
    description: "What symptoms feel like and what they interfere with.",
    nativeTopicIds: ["joints", "fatigue", "pain-and-daily-life"],
  },
  {
    id: "diagnosis",
    label: "Diagnosis and appointments",
    description: "Getting diagnosed, tests, referrals, and preparing for visits.",
    nativeTopicIds: [
      "diagnosis",
      "newly-diagnosed",
      "appointments",
      "care-navigation",
      "doctor-questions",
      "questions-for-care-team",
    ],
  },
  {
    id: "recovery",
    label: "Recovery and the long term",
    description: "Recovering, lingering symptoms, and what changed afterwards.",
    nativeTopicIds: ["recovery"],
  },
  {
    id: "treatment",
    label: "Treatment experiences",
    description: "What someone tried and how it went for them, not a recommendation.",
    nativeTopicIds: ["treatment-experiences", "medication-routines"],
  },
  {
    id: "emotional",
    label: "Emotional and practical challenges",
    description: "Worry, low mood, uncertainty, and what support looked like.",
    nativeTopicIds: ["emotional"],
  },
  {
    id: "caregiving",
    label: "Caregiving and family",
    description: "Supporting someone else, and looking after yourself too.",
    nativeTopicIds: ["carers", "caregivers"],
  },
  {
    id: "coping",
    label: "Coping strategies",
    description: "Everyday habits, monitoring, and what has been realistic.",
    nativeTopicIds: [
      "lifestyle",
      "food-and-activity",
      "monitoring",
      "prevention",
      "medication-routines",
    ],
  },
];

const BY_ID = new Map(EXPERIENCE_TOPICS.map((topic) => [topic.id, topic]));

export function isExperienceTopicId(value: unknown): value is ExperienceTopicId {
  return typeof value === "string" && BY_ID.has(value as ExperienceTopicId);
}

export function experienceTopic(id: ExperienceTopicId): ExperienceTopic {
  const topic = BY_ID.get(id);
  if (!topic) throw new Error(`Unknown experience topic: ${id}`);
  return topic;
}

/**
 * The category a stored post belongs to, or null when its topic has no category
 * yet. Null means the post is still listed under "all", so adding a disease with
 * a new topic id cannot hide its posts from the experience view.
 */
export function experienceTopicForNativeTopic(
  nativeTopicId: string,
): ExperienceTopicId | null {
  for (const topic of EXPERIENCE_TOPICS) {
    if (topic.nativeTopicIds.includes(nativeTopicId)) return topic.id;
  }
  return null;
}

export function nativeTopicIdsForExperienceTopic(
  id: ExperienceTopicId,
): readonly string[] {
  return experienceTopic(id).nativeTopicIds;
}

/** Human label for a stored topic id, including ids not yet categorised. */
export function experienceTopicLabel(id: string | null): string | null {
  if (!id) return null;
  return isExperienceTopicId(id) ? experienceTopic(id).label : null;
}
