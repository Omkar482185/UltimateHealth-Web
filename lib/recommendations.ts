/**
 * Personalised recommendations and follow-up suggestions.
 *
 * The rule this module follows is that every suggestion has to be traceable to
 * something the person themselves supplied: a selected interest, a goal they
 * typed, a measurement they recorded, or an item they saved. There is no
 * demographic inference, no age-based screening schedule, no risk score, and no
 * probability. `why` and `basedOn` are the point of the module rather than
 * decoration: if a suggestion cannot state what it is based on, it is not a
 * suggestion this platform should be making.
 *
 * It is a pure function over data that callers read from the database, so the
 * rules can be tested directly and cannot quietly start reading a table of their
 * own. The one piece of interpretation it does perform - comparing a recorded
 * blood pressure reading against a threshold - reuses `THRESHOLDS` from the
 * triage module, so the dashboard and the symptom-guidance page can never
 * disagree about what a threshold is.
 *
 * Medical safety: nothing here diagnoses, predicts, or prescribes. The strongest
 * thing it says is that a recorded reading is at a level the cited guidance
 * describes as needing attention, and that a clinician should look at it. A goal
 * the person set is compared only against their own recordings and is explicitly
 * labelled as their own goal rather than a clinical target.
 */
import { KIND_BY_ID, type HealthRecord } from "@/lib/health/kinds";
import { THRESHOLDS } from "@/lib/rag/triage";
import {
  CONDITION_IDS,
  CONDITION_OPTIONS,
  GOAL_IDS,
  GOAL_OPTIONS,
  INTEREST_IDS,
  INTEREST_OPTIONS,
  PODCAST_TOPIC_LABELS,
  isPodcastTopicId,
  conditionLabel,
  goalLabel,
  interestLabel,
} from "@/lib/profile/options";
import { TOPIC_LABELS as CORPUS_TOPIC_LABELS, type TopicId as CorpusTopicId } from "@/lib/corpus/sources";
import type { PodcastTopicId } from "@/lib/profile/options";

export type RecommendationKind =
  | "urgent"
  | "professional-review"
  | "measurement"
  | "education"
  | "general";

export const RECOMMENDATION_KIND_LABELS: Record<RecommendationKind, string> = {
  urgent: "Urgent warning",
  "professional-review": "Speak to a healthcare professional",
  measurement: "Something to record",
  education: "Suggested reading or viewing",
  general: "Where to start",
};

export type RecommendationAction = {
  label: string;
  href: string;
  /** True when the link leaves this site, which changes rel and target. */
  external: boolean;
};

export type Recommendation = {
  /** Stable key, used to dismiss or complete this item on a later visit. */
  key: string;
  kind: RecommendationKind;
  title: string;
  /** Why it is being shown, in the reader's own terms. */
  why: string;
  /** The specific inputs this was derived from, so it can be checked. */
  basedOn: string[];
  action: RecommendationAction | null;
  /** Whether "mark as done" is meaningful, which is true of educational items. */
  completable: boolean;
};

export type LibraryItem = {
  sourceId: string;
  title: string;
  topic: string;
  publisher: string;
};

export type ProfileSignals = {
  interests: string[];
  goals: string[];
  selfReportedConditions: string[];
  sleepGoalHours: number | null;
  activityGoalMinutes: number | null;
} | null;

export type RecommendationInput = {
  profile: ProfileSignals;
  records: HealthRecord[];
  library: LibraryItem[];
  /** Podcast ids already saved, so a saved item is not suggested again. */
  savedPodcastIds: string[];
  /** Recommendation keys dismissed or completed on an earlier visit. */
  suppressedKeys: string[];
  now: Date;
};

const DAY_MS = 86_400_000;

function daysAgo(iso: string, now: Date): number | null {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return null;
  return Math.floor((now.getTime() - time) / DAY_MS);
}

function mostRecent(
  records: HealthRecord[],
  kind: HealthRecord["kind"],
): HealthRecord | null {
  const matching = records
    .filter((record) => record.kind === kind)
    .sort((a, b) => Date.parse(b.measuredAt) - Date.parse(a.measuredAt));
  return matching[0] ?? null;
}

function relevantInterests(ids: string[]): string[] {
  return ids.filter((id) => INTEREST_IDS.includes(id));
}

/** Podcast topic ids implied by the person's interests, in selection order. */
function podcastTopicsFor(interests: string[]): string[] {
  const seen = new Set<string>();
  for (const id of relevantInterests(interests)) {
    const option = INTEREST_OPTIONS.find((candidate) => candidate.id === id);
    for (const topic of option?.podcastTopics ?? []) seen.add(topic);
  }
  return [...seen];
}

/** Corpus topics implied by the person's interests, in selection order. */
function corpusTopicsFor(interests: string[]): string[] {
  const seen = new Set<string>();
  for (const id of relevantInterests(interests)) {
    const option = INTEREST_OPTIONS.find((candidate) => candidate.id === id);
    if (option?.corpusTopic) seen.add(option.corpusTopic);
  }
  return [...seen];
}

/**
 * A daily rotation offset, so the same educational suggestions are not the only
 * ones a returning reader ever sees. It is derived from the date rather than from
 * randomness so that two page loads on one day agree, which keeps the list stable
 * enough to act on.
 */
function rotationOffset(now: Date): number {
  return Math.floor(now.getTime() / DAY_MS);
}

export function buildRecommendations(input: RecommendationInput): Recommendation[] {
  const { profile, records, library, now } = input;
  const suppressed = new Set(input.suppressedKeys);
  const out: Recommendation[] = [];
  const push = (recommendation: Recommendation) => {
    if (suppressed.has(recommendation.key)) return;
    if (out.some((existing) => existing.key === recommendation.key)) return;
    out.push(recommendation);
  };

  /* ------------------------------------------------------------------ *
   * 1. Recorded blood pressure. This is the only rule that speaks about
   *    the seriousness of a number, and it quotes the threshold it uses.
   * ------------------------------------------------------------------ */
  const recentBloodPressure = records
    .filter((record) => record.kind === "blood-pressure")
    .slice()
    .sort((a, b) => Date.parse(b.measuredAt) - Date.parse(a.measuredAt));

  const crisis = recentBloodPressure.find(
    (record) =>
      record.valuePrimary >= THRESHOLDS.crisisSystolic ||
      (record.valueSecondary ?? 0) >= THRESHOLDS.crisisDiastolic,
  );
  const raised = recentBloodPressure.find(
    (record) =>
      record.valuePrimary >= THRESHOLDS.hypertensionSystolic ||
      (record.valueSecondary ?? 0) >= THRESHOLDS.hypertensionDiastolic,
  );

  if (crisis) {
    const age = daysAgo(crisis.measuredAt, now);
    push({
      key: `urgent:${crisis.id}`,
      kind: "urgent",
      title: "A reading you recorded is at a level guidance describes as needing immediate attention",
      why: `You recorded ${crisis.valuePrimary}/${crisis.valueSecondary ?? "-"} mmHg. Public health guidance describes a reading at or above ${THRESHOLDS.crisisSystolic}/${THRESHOLDS.crisisDiastolic} as a hypertensive crisis that needs medical attention without waiting. This platform cannot tell you what your reading means for you, and it is not a diagnosis.`,
      basedOn: [
        `Your recorded reading: ${crisis.valuePrimary}/${crisis.valueSecondary ?? "-"} mmHg`,
        age === null ? "Recorded on an unreadable date" : `Recorded ${age} day(s) ago`,
        `Threshold from the cited sources: ${THRESHOLDS.crisisSystolic}/${THRESHOLDS.crisisDiastolic} mmHg`,
      ],
      action: {
        label: "Open symptom guidance and emergency steps",
        href: "/guidance",
        external: false,
      },
      completable: false,
    });
  } else if (raised) {
    const age = daysAgo(raised.measuredAt, now);
    push({
      key: `review:${raised.id}`,
      kind: "professional-review",
      title: "One of your recorded readings is at or above the level guidance calls raised",
      why: `You recorded ${raised.valuePrimary}/${raised.valueSecondary ?? "-"} mmHg, at or above the ${THRESHOLDS.hypertensionSystolic}/${THRESHOLDS.hypertensionDiastolic} that guidance uses for a reading taken by a healthcare professional. A single reading is not a diagnosis, and raised blood pressure is confirmed from readings taken on separate occasions. The useful next step is to show these readings to a clinician.`,
      basedOn: [
        `Your recorded reading: ${raised.valuePrimary}/${raised.valueSecondary ?? "-"} mmHg`,
        age === null ? "Recorded on an unreadable date" : `Recorded ${age} day(s) ago`,
        "Threshold as documented in the cited sources, not calculated here",
      ],
      action: { label: "Open symptom guidance", href: "/guidance", external: false },
      completable: false,
    });
  }

  /**
   * A symptom the person rated 7 or above on the 1-to-10 scale they set
   * themselves. The number is theirs, so this says exactly that and does not
   * present it as a clinical severity score.
   */
  const markedSymptom = records.find((record) => {
    const age = daysAgo(record.measuredAt, now);
    return (
      record.kind === "symptom" &&
      record.valuePrimary >= 7 &&
      age !== null &&
      age <= 14
    );
  });
  if (markedSymptom) {
    push({
      key: `symptom:${markedSymptom.id}`,
      kind: "professional-review",
      title: "You recorded a symptom at the higher end of your own scale",
      why: `${markedSymptom.valuePrimary} out of 10 is how you rated it on the scale you set yourself, so this is your own record and not a clinical severity score. Symptoms that are severe, or that are getting worse, are worth raising with a healthcare professional rather than tracking alone.`,
      basedOn: [
        `Your recorded severity: ${markedSymptom.valuePrimary}/10`,
        markedSymptom.note ? `Your note: ${markedSymptom.note}` : "No note was added",
      ],
      action: { label: "Open symptom guidance", href: "/guidance", external: false },
      completable: false,
    });
  }

  /* ------------------------------------------------------------------ *
   * 2. Measurements worth recording, only for signals the person chose to
   *    give. Each suggestion names the signal it came from.
   * ------------------------------------------------------------------ */
  const conditionIds = profile ? profile.selfReportedConditions : [];
  const interestIds = profile ? relevantInterests(profile.interests) : [];
  const goalIds = profile ? profile.goals.filter((id) => GOAL_IDS.includes(id)) : [];

  const wantsBloodPressure =
    interestIds.includes("blood-pressure") ||
    interestIds.includes("heart-health") ||
    conditionIds.includes("high-blood-pressure") ||
    conditionIds.includes("heart-condition");
  const wantsGlucose =
    interestIds.includes("metabolic-health") ||
    conditionIds.includes("diabetes");
  const wantsSleep = interestIds.includes("sleep") || goalIds.includes("sleep-better");
  const wantsActivity =
    interestIds.includes("nutrition-and-activity") ||
    interestIds.includes("prevention") ||
    goalIds.includes("move-more");

  const measurementSuggestions: {
    kind: HealthRecord["kind"];
    days: number;
    reason: string;
    label: string;
  }[] = [];

  if (wantsBloodPressure) {
    measurementSuggestions.push({
      kind: "blood-pressure",
      days: 14,
      reason: conditionIds.includes("high-blood-pressure")
        ? "You told us a clinician has told you that you have high blood pressure, and blood pressure is the reading that shows how it is doing over time."
        : "You selected blood pressure or heart health as an interest, and a home reading is the measurement that makes that concrete.",
      label: "Record a blood pressure reading",
    });
  }
  if (wantsGlucose) {
    measurementSuggestions.push({
      kind: "glucose",
      days: 30,
      reason: conditionIds.includes("diabetes")
        ? "You told us a clinician has told you that you have diabetes, so your own glucose readings are the numbers worth keeping together."
        : "You selected metabolic health or diabetes as an interest.",
      label: "Record a blood glucose reading",
    });
  }
  if (wantsSleep) {
    measurementSuggestions.push({
      kind: "sleep",
      days: 7,
      reason: "You selected sleep, so hours slept is the reading that shows the pattern.",
      label: "Record hours slept",
    });
  }
  if (wantsActivity) {
    measurementSuggestions.push({
      kind: "activity",
      days: 7,
      reason: "You selected activity or nutrition, so minutes of activity is the reading that shows it.",
      label: "Record minutes of activity",
    });
  }

  for (const suggestion of measurementSuggestions) {
    const latest = mostRecent(records, suggestion.kind);
    const age = latest ? daysAgo(latest.measuredAt, now) : null;
    if (age !== null && age <= suggestion.days) continue;
    push({
      key: `measurement:${suggestion.kind}`,
      kind: "measurement",
      title: suggestion.label,
      why: latest
        ? `${suggestion.reason} Your most recent one is ${age} day(s) old, so this suggests adding a current reading. Whether to measure, and how often, is a decision for you and your clinician.`
        : `${suggestion.reason} Nothing of this kind has been recorded on this account yet. Whether to measure, and how often, is a decision for you and your clinician.`,
      basedOn: [
        ...(interestIds.length > 0
          ? [`Your interests: ${interestIds.map(interestLabel).join(", ")}`]
          : []),
        ...(conditionIds.length > 0
          ? [
              `What you told us a clinician has told you: ${conditionIds
                .filter((id) => CONDITION_IDS.includes(id))
                .map(conditionLabel)
                .join(", ")}`,
            ]
          : []),
        ...(goalIds.length > 0 ? [`Your goals: ${goalIds.map(goalLabel).join(", ")}`] : []),
        latest ? "Most recent recording of this kind" : "No recording of this kind",
      ],
      action: { label: "Open my records", href: "/records", external: false },
      completable: false,
    });
  }

  /* ------------------------------------------------------------------ *
   * 3. A goal the person set compared against their own recordings. The
   *    comparison is against their number, and it says so.
   * ------------------------------------------------------------------ */
  if (profile?.sleepGoalHours && records.some((record) => record.kind === "sleep")) {
    const recentSleep = records
      .filter((record) => record.kind === "sleep")
      .filter((record) => {
        const age = daysAgo(record.measuredAt, now);
        return age !== null && age <= 14;
      });
    if (recentSleep.length >= 3) {
      const mean =
        recentSleep.reduce((sum, record) => sum + record.valuePrimary, 0) /
        recentSleep.length;
      if (mean < profile.sleepGoalHours) {
        push({
          key: "goal:sleep",
          kind: "education",
          title: "Your recorded sleep is below the goal you set",
          why: `You set a sleep goal of ${profile.sleepGoalHours} hours. Across your last ${recentSleep.length} sleep recordings the average is ${mean.toFixed(1)} hours. That comparison is between your own goal and your own entries; it is not a clinical target and it is not a judgement about your health.`,
          basedOn: [
            `Your sleep goal: ${profile.sleepGoalHours} hours`,
            `Your recordings used: ${recentSleep.length}`,
            `Their average: ${mean.toFixed(1)} hours`,
          ],
          action: {
            label: "Watch NHS guidance on sleep problems",
            href: "/podcasts/nhs-sleep-problems",
            external: false,
          },
          completable: true,
        });
      }
    }
  }

  if (
    profile?.activityGoalMinutes &&
    records.some((record) => record.kind === "activity")
  ) {
    const recentActivity = records.filter((record) => {
      const age = daysAgo(record.measuredAt, now);
      return record.kind === "activity" && age !== null && age <= 7;
    });
    if (recentActivity.length >= 3) {
      const mean =
        recentActivity.reduce((sum, record) => sum + record.valuePrimary, 0) /
        recentActivity.length;
      if (mean < profile.activityGoalMinutes) {
        push({
          key: "goal:activity",
          kind: "education",
          title: "Your recorded activity is below the goal you set",
          why: `You set an activity goal of ${profile.activityGoalMinutes} minutes. Across your last ${recentActivity.length} activity recordings the average is ${Math.round(mean)} minutes. This compares your own goal with your own entries, and nothing more.`,
          basedOn: [
            `Your activity goal: ${profile.activityGoalMinutes} minutes`,
            `Your recordings used: ${recentActivity.length}`,
            `Their average: ${Math.round(mean)} minutes`,
          ],
          action: {
            label: "Watch the WHO video on staying active",
            href: "/podcasts/who-be-active",
            external: false,
          },
          completable: true,
        });
      }
    }
  }

  /* ------------------------------------------------------------------ *
   * 4. Educational material. Two sources, both real: the source library
   *    for the corpus topics an interest maps to, and the podcast
   *    catalogue for the topics it maps to.
   * ------------------------------------------------------------------ */
  const corpusTopics = corpusTopicsFor(interestIds);
  const matchingLibrary = library.filter(
    (item) => corpusTopics.length === 0 || corpusTopics.includes(item.topic),
  );
  if (matchingLibrary.length > 0) {
    const offset = rotationOffset(now) % matchingLibrary.length;
    const item = matchingLibrary[offset]!;
    const topic = corpusTopics.includes(item.topic) ? item.topic : item.topic;
    push({
      key: `education:library:${item.sourceId}`,
      kind: "education",
      title: `Read: ${item.title}`,
      why: `This is the source material behind the topic you selected. It is published by ${item.publisher} and is one of the documents this platform retrieves answers from, so what you read here is the same text the assistant quotes.`,
      basedOn: [
        `Your interests: ${interestIds.map(interestLabel).join(", ")}`,
        `Source topic matched: ${topic}`,
        `Publisher: ${item.publisher}`,
      ],
      action: { label: "Open the source document", href: `/library/${item.sourceId}`, external: false },
      completable: true,
    });
  }

  return out;
}

/**
 * The goal-to-topic mapping, written out so a goal chosen without any interest
 * still produces relevant suggestions rather than an empty list. It maps a goal
 * onto content topics and nothing else: "sleep better" selects sleep material, it
 * does not assert anything about the person's sleep.
 */
const TOPICS_FOR_GOAL: Record<string, string[]> = {
  "sleep-better": ["sleep"],
  "manage-stress": ["mental-health"],
  "eat-better": ["nutrition-and-activity"],
  "move-more": ["nutrition-and-activity"],
  "know-when-to-seek-care": ["tests-and-seeking-care", "heart-and-blood-pressure"],
  "prevent-conditions": [
    "heart-and-blood-pressure",
    "diabetes",
    "general-health",
    "nutrition-and-activity",
  ],
  "lower-blood-pressure": ["heart-and-blood-pressure"],
  "understand-readings": ["tests-and-seeking-care", "heart-and-blood-pressure"],
};

export type TopicSuggestion = {
  /** Which selected interest or goal produced this, for the reason text. */
  topic: string;
  /** The reader-facing name of that topic, so the interface never shows a raw id. */
  topicLabel: string;
  reason: string;
  basedOn: string[];
};

/** Reader-facing name for a topic id in either channel. */
function topicLabelFor(topic: string, channel: "podcast" | "library"): string {
  if (channel === "podcast") return PODCAST_TOPIC_LABELS[topic as PodcastTopicId] ?? topic;
  return CORPUS_TOPIC_LABELS[topic as CorpusTopicId] ?? topic;
}

/**
 * Which content topics the profile points at, and why.
 *
 * Returned as topics rather than episodes so the caller resolves them against the
 * catalogue it already has, which keeps this module free of catalogue imports and
 * keeps one place responsible for ranking episodes.
 */
export function suggestedContentTopics(
  profile: ProfileSignals,
  channel: "podcast" | "library",
): TopicSuggestion[] {
  if (!profile) return [];
  const interestIds = relevantInterests(profile.interests);
  const goalIds = profile.goals.filter((id) => GOAL_IDS.includes(id));
  const out: TopicSuggestion[] = [];

  for (const id of interestIds) {
    const option = INTEREST_OPTIONS.find((candidate) => candidate.id === id);
    if (!option) continue;
    const topics = channel === "podcast" ? option.podcastTopics : [option.corpusTopic];
    for (const topic of topics) {
      if (!topic) continue;
      if (channel === "podcast" && !isPodcastTopicId(topic)) continue;
      out.push({
        topic,
        topicLabel: topicLabelFor(topic, channel),
        reason: `You selected ${option.label} as an interest, and this episode covers ${topicLabelFor(topic, channel).toLowerCase()}.`,
        basedOn: [
          `Your interest: ${option.label}`,
          `Matched topic: ${topicLabelFor(topic, channel)}`,
        ],
      });
    }
  }

  for (const id of goalIds) {
    const goal = GOAL_OPTIONS.find((option) => option.id === id);
    if (!goal) continue;
    for (const topic of TOPICS_FOR_GOAL[id] ?? []) {
      if (channel === "podcast" && !isPodcastTopicId(topic)) continue;
      out.push({
        topic,
        topicLabel: topicLabelFor(topic, channel),
        reason: `You said you wanted to ${goal.label.toLowerCase()}, and this episode covers ${topicLabelFor(topic, channel).toLowerCase()}.`,
        basedOn: [
          `Your goal: ${goal.label}`,
          `Matched topic: ${topicLabelFor(topic, channel)}`,
        ],
      });
    }
  }

  // Later duplicates would only repeat a reason, so the first explanation for a
  // topic is the one kept.
  const seen = new Set<string>();
  return out.filter((suggestion) => {
    if (seen.has(suggestion.topic)) return false;
    seen.add(suggestion.topic);
    return true;
  });
}

/** Named so the profile page can explain each vocabulary without importing ids. */
export const PROFILE_VOCABULARIES = {
  interests: INTEREST_OPTIONS.map((option) => ({ id: option.id, label: option.label })),
  goals: GOAL_OPTIONS.map((option) => ({ id: option.id, label: option.label })),
  conditions: CONDITION_OPTIONS.map((option) => ({
    id: option.id,
    label: option.label,
  })),
};

export { interestLabel, goalLabel, conditionLabel };
