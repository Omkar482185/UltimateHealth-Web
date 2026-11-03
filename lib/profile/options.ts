/**
 * The closed vocabularies the profile can hold, and how each one maps onto the
 * content the platform actually has.
 *
 * Why closed vocabularies rather than free text: every field added to the profile
 * has to earn its place by changing something. A checkbox list can be matched
 * against the corpus and the podcast catalogue by a rule that can be read and
 * tested; a free-text health history cannot, and it would also be the most
 * sensitive thing this project could hold. So the profile stores ids from these
 * lists and nothing else, and the mapping below is what makes an interest produce
 * a recommendation rather than a label that goes nowhere.
 *
 * This module is imported by client components, so it must stay free of any
 * database or Node import.
 */
import type { TopicId } from "@/lib/corpus/sources";

export type PodcastTopicId =
  | "general-health"
  | "nutrition-and-activity"
  | "mental-health"
  | "sleep"
  | "heart-and-blood-pressure"
  | "diabetes"
  | "respiratory-and-tb"
  | "infection-and-vaccination"
  | "tests-and-seeking-care"
  | "mosquito-borne-disease";

export const PODCAST_TOPIC_LABELS: Record<PodcastTopicId, string> = {
  "general-health": "General and preventive health",
  "nutrition-and-activity": "Nutrition and physical activity",
  "mental-health": "Mental well-being and stress",
  sleep: "Sleep and healthy habits",
  "heart-and-blood-pressure": "Heart health and blood pressure",
  diabetes: "Diabetes awareness",
  "respiratory-and-tb": "Respiratory health and tuberculosis",
  "infection-and-vaccination": "Infection prevention and vaccination",
  "tests-and-seeking-care": "Understanding tests and seeking care",
  "mosquito-borne-disease": "Mosquito-borne disease",
};

export const PODCAST_TOPIC_IDS = Object.keys(
  PODCAST_TOPIC_LABELS,
) as PodcastTopicId[];

export function isPodcastTopicId(value: unknown): value is PodcastTopicId {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(PODCAST_TOPIC_LABELS, value)
  );
}

/**
 * One selectable health interest.
 *
 * `corpusTopic` and `podcastTopics` are what turn the selection into something the
 * platform can act on: the first selects library documents by their own topic, the
 * second selects episodes. An interest with an empty `podcastTopics` is honest
 * about having no episodes yet rather than being quietly dropped.
 */
export type InterestOption = {
  id: string;
  label: string;
  /** Shown in the profile form, so the person knows what the selection affects. */
  description: string;
  corpusTopic: TopicId | null;
  podcastTopics: PodcastTopicId[];
};

export const INTEREST_OPTIONS: readonly InterestOption[] = [
  {
    id: "blood-pressure",
    label: "High blood pressure",
    description: "How blood pressure is measured, what affects it, and when it needs review.",
    corpusTopic: "hypertension",
    podcastTopics: ["heart-and-blood-pressure"],
  },
  {
    id: "heart-health",
    label: "Heart and circulation",
    description: "Heart attack and stroke warning signs, cholesterol, and circulation.",
    corpusTopic: "heart-and-circulation",
    podcastTopics: ["heart-and-blood-pressure"],
  },
  {
    id: "metabolic-health",
    label: "Diabetes and metabolic health",
    description: "Blood glucose, type 2 diabetes risk, and how it relates to blood pressure.",
    corpusTopic: "metabolic-health",
    podcastTopics: ["diabetes"],
  },
  {
    id: "kidney-health",
    label: "Kidney health",
    description: "How blood pressure and kidney function affect each other.",
    corpusTopic: "kidney-health",
    podcastTopics: [],
  },
  {
    id: "prevention",
    label: "Prevention and lifestyle",
    description: "The everyday factors with the strongest evidence base behind them.",
    corpusTopic: "prevention-and-lifestyle",
    podcastTopics: ["general-health"],
  },
  {
    id: "nutrition-and-activity",
    label: "Nutrition and physical activity",
    description: "Eating patterns and activity levels, and what general guidance says.",
    corpusTopic: "prevention-and-lifestyle",
    podcastTopics: ["nutrition-and-activity"],
  },
  {
    id: "sleep",
    label: "Sleep",
    description: "Sleep habits and common sleep problems.",
    corpusTopic: null,
    podcastTopics: ["sleep"],
  },
  {
    id: "mental-health",
    label: "Mental well-being",
    description: "Stress, low mood, and where to get help in the places this content covers.",
    corpusTopic: null,
    podcastTopics: ["mental-health"],
  },
  {
    id: "tb-and-lungs",
    label: "Tuberculosis and lung health",
    description: "How tuberculosis spreads, how it is diagnosed, and how it is treated.",
    corpusTopic: null,
    podcastTopics: ["respiratory-and-tb"],
  },
  {
    id: "infection-prevention",
    label: "Infection prevention and vaccination",
    description: "Hand hygiene, vaccination, and preventing the spread of infection.",
    corpusTopic: null,
    podcastTopics: ["infection-and-vaccination"],
  },
  {
    id: "tests-and-care",
    label: "Medical tests and seeking care",
    description: "What common measurements mean, and when to ask for professional assessment.",
    corpusTopic: null,
    podcastTopics: ["tests-and-seeking-care"],
  },
  {
    id: "mosquito-borne",
    label: "Mosquito-borne disease",
    description: "Dengue and chikungunya: prevention, warning signs, and when to seek care.",
    corpusTopic: "mosquito-borne-disease",
    podcastTopics: ["mosquito-borne-disease"],
  },
];

const INTEREST_BY_ID = new Map(INTEREST_OPTIONS.map((option) => [option.id, option]));

export const INTEREST_IDS = INTEREST_OPTIONS.map((option) => option.id);

export function isInterestId(value: unknown): value is string {
  return typeof value === "string" && INTEREST_BY_ID.has(value);
}

export function interestLabel(id: string): string {
  return INTEREST_BY_ID.get(id)?.label ?? id;
}

/** At most this many interests are stored, so the recommendation list stays useful. */
export const MAX_INTERESTS = 6;

/**
 * Educational goals. These exist to explain a recommendation, not to become a
 * plan: nothing in the platform turns a goal into a target, a deadline, or a
 * claim about what the person should achieve.
 */
export type GoalOption = { id: string; label: string };

export const GOAL_OPTIONS: readonly GoalOption[] = [
  { id: "understand-readings", label: "Understand what my own readings mean" },
  { id: "lower-blood-pressure", label: "Know what affects blood pressure" },
  { id: "prevent-conditions", label: "Reduce the risk of heart disease and diabetes" },
  { id: "eat-better", label: "Eat more healthily" },
  { id: "move-more", label: "Be more physically active" },
  { id: "sleep-better", label: "Sleep better" },
  { id: "manage-stress", label: "Manage stress" },
  { id: "know-when-to-seek-care", label: "Know when to seek medical care" },
];

const GOAL_BY_ID = new Map(GOAL_OPTIONS.map((option) => [option.id, option]));

export const GOAL_IDS = GOAL_OPTIONS.map((option) => option.id);

export function isGoalId(value: unknown): value is string {
  return typeof value === "string" && GOAL_BY_ID.has(value);
}

export function goalLabel(id: string): string {
  return GOAL_BY_ID.get(id)?.label ?? id;
}

export const MAX_GOALS = 4;

/**
 * Conditions the person says a clinician has told them about.
 *
 * This is the only sensitive field in the profile, and it is collected for one
 * reason: it changes which educational content is relevant and makes the
 * "discuss this with a clinician" suggestion specific rather than generic. It is
 * stored exactly as the person selected it, is labelled everywhere it is shown as
 * their own account rather than a verified record, and is never used to infer a
 * diagnosis or to decide a care level. The symptom guidance and the emergency
 * screen do not read it at all.
 */
export type ConditionOption = { id: string; label: string };

export const CONDITION_OPTIONS: readonly ConditionOption[] = [
  { id: "high-blood-pressure", label: "High blood pressure" },
  { id: "diabetes", label: "Diabetes" },
  { id: "heart-condition", label: "A heart or circulation condition" },
  { id: "kidney-condition", label: "A kidney condition" },
  { id: "none", label: "None of these" },
];

const CONDITION_BY_ID = new Map(
  CONDITION_OPTIONS.map((option) => [option.id, option]),
);

export const CONDITION_IDS = CONDITION_OPTIONS.map((option) => option.id);

export function isConditionId(value: unknown): value is string {
  return typeof value === "string" && CONDITION_BY_ID.has(value);
}

export function conditionLabel(id: string): string {
  return CONDITION_BY_ID.get(id)?.label ?? id;
}

export const MAX_CONDITIONS = 4;

/**
 * Languages the catalogue can currently be filtered to. Kept as a stored
 * preference only where episodes actually exist in that language, so the filter
 * cannot offer an empty result.
 */
export type LanguageOption = { id: string; label: string };

export const LANGUAGE_OPTIONS: readonly LanguageOption[] = [
  { id: "en", label: "English" },
  { id: "hi", label: "Hindi" },
];

export const LANGUAGE_IDS = LANGUAGE_OPTIONS.map((option) => option.id);

export function isLanguageId(value: unknown): value is string {
  return LANGUAGE_IDS.includes(value as string);
}

export function languageLabel(id: string): string {
  return LANGUAGE_OPTIONS.find((option) => option.id === id)?.label ?? id;
}

/**
 * Goal bounds. These are stored goals, not medical targets, and nothing compares
 * a recorded measurement against them: the dashboard reports the stored goal and
 * what the person recorded, side by side, and stops there.
 */
export const SLEEP_GOAL_HOURS = { min: 4, max: 12 } as const;
export const ACTIVITY_GOAL_MINUTES = { min: 10, max: 900 } as const;
