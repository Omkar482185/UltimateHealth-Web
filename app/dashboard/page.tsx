import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import {
  RecommendationActions,
  RemoveSavedButton,
  RestoreRecommendationButton,
} from "@/components/DashboardActions";
import { getCurrentUser } from "@/lib/auth/cookies";
import { getProfile } from "@/lib/auth/users";
import { getStore } from "@/lib/db";
import { formatReading, type HealthRecord } from "@/lib/health/kinds";
import { buildTrends, LIST_LIMIT_DEFAULT, listRecords } from "@/lib/health/records";
import {
  CATALOGUE_VERIFICATION,
  episodesForTopics,
  formatDuration,
} from "@/lib/podcasts/catalogue";
import {
  conditionLabel,
  goalLabel,
  interestLabel,
  PODCAST_TOPIC_LABELS,
  type PodcastTopicId,
} from "@/lib/profile/options";
import { listSavedResources } from "@/lib/profile/saved";
import {
  listRecommendationStates,
  suppressedRecommendationKeys,
} from "@/lib/profile/recommendation-state";
import {
  buildRecommendations,
  RECOMMENDATION_KIND_LABELS,
  suggestedContentTopics,
  type Recommendation,
} from "@/lib/recommendations";

export const metadata: Metadata = {
  title: "Dashboard",
  description:
    "Your recorded measurements, the goals you set, the learning material you saved, and the next steps your own data suggests.",
};

export const instant = false;

const DAY_MS = 86_400_000;

/**
 * Personal dashboard.
 *
 * Every number on this page is something the person recorded or chose. There are
 * no estimated values, no filled-in gaps, no comparison with anyone else and no
 * risk score. Where there is nothing to show, the page says which action would
 * create it rather than drawing an empty chart.
 *
 * The recommendations are computed on the server from the same data shown above
 * them, so a suggestion and the evidence behind it cannot disagree, and each one
 * carries the inputs it used in its own words. Dismissing or completing one records
 * only its key: the text itself is recomputed on every visit.
 */
export default async function DashboardPage() {
  await connection();
  const user = await getCurrentUser();

  if (!user) {
    return (
      <section className="section section--flush">
        <div className="container">
          <div className="page-head">
            <p className="eyebrow">Your dashboard</p>
            <h1>Sign in to see your dashboard</h1>
            <p className="lede">
              The dashboard is built from your own recorded measurements, the goals you
              set, and the material you saved, so there is nothing to show until there is
              an account to show it for.
            </p>
          </div>

          <div className="split" style={{ marginTop: "var(--space-6)" }}>
            <div className="notice notice--info">
              <p className="notice__title">What it will show</p>
              <ul style={{ marginBottom: "var(--space-4)" }}>
                <li>Your recent measurements, drawn only from values you typed in.</li>
                <li>
                  The sleep and activity goals you set, next to what you recorded, side
                  by side and with no interpretation added.
                </li>
                <li>
                  Next steps derived from your own data, each one stating what it is
                  based on.
                </li>
                <li>The episodes and source documents you chose to keep.</li>
              </ul>
              <div className="row">
                <Link className="btn btn--primary" href="/account">
                  Sign in or create an account
                </Link>
                <Link className="btn" href="/records">
                  About health records
                </Link>
              </div>
            </div>

            <aside className="panel">
              <p className="kicker">No account needed</p>
              <h2 style={{ fontSize: "1.35rem", marginTop: "var(--space-2)" }}>
                Everything clinical works signed out
              </h2>
              <p className="meta">
                The assistant, symptom guidance, the source library and the podcasts tab
                all work without signing in. An account exists only for measurements you
                choose to record.
              </p>
              <ul className="list-plain stack-tight" style={{ marginTop: "var(--space-4)" }}>
                <li>
                  <Link href="/assistant">Ask the health assistant</Link>
                </li>
                <li>
                  <Link href="/guidance">Check symptoms and warning signs</Link>
                </li>
                <li>
                  <Link href="/library">Browse the source library</Link>
                </li>
                <li>
                  <Link href="/podcasts">Watch and listen</Link>
                </li>
              </ul>
            </aside>
          </div>
        </div>
      </section>
    );
  }

  const profile = getProfile(user.id);
  const records: HealthRecord[] = listRecords(user.id, { limit: LIST_LIMIT_DEFAULT });
  const saved = listSavedResources(user.id);
  const suppressed = suppressedRecommendationKeys(user.id);
  const suppressedWithState = listRecommendationStates(user.id);

  const library = getStore()
    .listDocuments()
    .map((document) => ({
      sourceId: document.sourceId,
      title: document.title,
      topic: document.topic,
      publisher: document.publisher,
    }));

  const recommendations: Recommendation[] = buildRecommendations({
    profile: profile
      ? {
          interests: profile.interests,
          goals: profile.goals,
          selfReportedConditions: profile.selfReportedConditions,
          sleepGoalHours: profile.sleepGoalHours,
          activityGoalMinutes: profile.activityGoalMinutes,
        }
      : null,
    records,
    library,
    savedPodcastIds: saved
      .filter((item) => item.kind === "podcast")
      .map((item) => item.refId),
    suppressedKeys: suppressed,
    now: new Date(),
  });

  const trends = buildTrends(records);
  const now = Date.now();

  /**
   * Suggested viewing, matched on the topics the profile points at. The reason is
   * carried through from the profile rule that produced the topic, so the panel
   * never asserts that an episode is right for a condition.
   */
  const podcastSuggestions = profile
    ? suggestedContentTopics(
        {
          interests: profile.interests,
          goals: profile.goals,
          selfReportedConditions: profile.selfReportedConditions,
          sleepGoalHours: profile.sleepGoalHours,
          activityGoalMinutes: profile.activityGoalMinutes,
        },
        "podcast",
      )
        .flatMap((suggestion) => {
          const [match] = episodesForTopics(
            [suggestion.topic as PodcastTopicId],
            1,
            saved.filter((item) => item.kind === "podcast").map((item) => item.refId),
          );
          return match ? [{ entry: match.entry, reason: suggestion.reason }] : [];
        })
        .slice(0, 3)
    : [];

  function averageFor(kind: HealthRecord["kind"], days: number): number | null {
    const recent = records.filter(
      (record) =>
        record.kind === kind &&
        now - Date.parse(record.measuredAt) <= days * DAY_MS,
    );
    if (recent.length === 0) return null;
    return recent.reduce((sum, record) => sum + record.valuePrimary, 0) / recent.length;
  }

  const sleepAverage = averageFor("sleep", 14);
  const activityAverage = averageFor("activity", 7);
  const savedCount = saved.length;
  const goalCount =
    (profile?.sleepGoalHours ? 1 : 0) + (profile?.activityGoalMinutes ? 1 : 0);
  const latestRecord = [...records].sort(
    (a, b) => Date.parse(b.measuredAt) - Date.parse(a.measuredAt),
  )[0];

  return (
    <section className="section section--flush">
      <div className="container">
        <div className="page-head">
          <p className="eyebrow">Your dashboard</p>
          <h1>
            {profile?.displayName
              ? `${profile.displayName}, this is your dashboard`
              : "Your dashboard"}
          </h1>
          <p className="lede">
            Built from {records.length} recorded{" "}
            {records.length === 1 ? "measurement" : "measurements"}, the goals you set and
            the material you saved. Nothing here is estimated, and nothing is compared
            with anyone else&apos;s data.
          </p>
        </div>

        <div className="overview" style={{ marginTop: "var(--space-5)" }}>
          <div className="overview__item">
            <span className="overview__label">Measurements</span>
            <span className="overview__value">{records.length}</span>
            <span className="overview__note">recorded by you</span>
          </div>
          <div className="overview__item">
            <span className="overview__label">Goals set</span>
            <span className="overview__value">{goalCount}</span>
            <span className="overview__note">sleep and activity</span>
          </div>
          <div className="overview__item">
            <span className="overview__label">Saved</span>
            <span className="overview__value">{savedCount}</span>
            <span className="overview__note">documents and episodes</span>
          </div>
          <div className="overview__item">
            <span className="overview__label">Latest reading</span>
            <span className="overview__value">
              {latestRecord
                ? new Date(latestRecord.measuredAt).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                  })
                : "—"}
            </span>
            <span className="overview__note">
              {latestRecord ? "most recent entry" : "nothing recorded yet"}
            </span>
          </div>
        </div>

        {records.length === 0 ? (
          <div className="empty-state" style={{ marginTop: "var(--space-7)" }}>
            <p className="eyebrow" style={{ marginBottom: 0 }}>
              Nothing recorded yet
            </p>
            <h2>Your numbers begin with one reading</h2>
            <p>
              The dashboard fills in as you record measurements. A single reading is
              enough to start: it shows as your latest value, and a trend line appears
              only once there are at least two. Nothing is invented to fill the gap in the
              meantime.
            </p>
            <div className="row">
              <Link className="btn btn--primary" href="/records">
                Record a measurement
              </Link>
              <Link className="btn" href="/account">
                Add profile details
              </Link>
            </div>
          </div>
        ) : (
          <section aria-labelledby="numbers-heading" style={{ marginTop: "var(--space-8)" }}>
            <div className="section-head">
              <div className="section-head__text">
                <p className="eyebrow">Measured, not estimated</p>
                <h2 id="numbers-heading">Your numbers</h2>
              </div>
              <Link className="btn btn--small" href="/records">
                Open all records
              </Link>
            </div>

            <div className="metric-grid">
              {trends.map((trend) => {
                const latest = trend.points[trend.points.length - 1]!;
                const latestRecordForKind = records
                  .filter((record) => record.kind === trend.kind)
                  .sort((a, b) => Date.parse(b.measuredAt) - Date.parse(a.measuredAt))[0]!;
                return (
                  <article key={trend.kind} className="card metric-card">
                    <p className="kicker">{trend.label}</p>
                    <p className="metric-card__value" style={{ margin: 0 }}>
                      {formatReading(latestRecordForKind)}
                    </p>
                    <p className="meta" style={{ margin: 0 }}>
                      Latest on{" "}
                      {new Date(latest.measuredAt).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}{" "}
                      · {trend.points.length}{" "}
                      {trend.points.length === 1 ? "record" : "records"}
                    </p>
                    {trend.primary && trend.points.length >= 2 ? (
                      <p className="meta" style={{ margin: 0 }}>
                        Lowest {trend.primary.min}, highest {trend.primary.max}, and a
                        change of {trend.primary.difference > 0 ? "+" : ""}
                        {trend.primary.difference} {trend.unit} from your first record to
                        your latest. That is arithmetic on your own entries, not an
                        interpretation of them.
                      </p>
                    ) : null}
                    <p style={{ margin: 0 }}>
                      <Link href="/records">Open, edit or chart this</Link>
                    </p>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        <section aria-labelledby="goals-heading" style={{ marginTop: "var(--space-8)" }}>
          <div className="section-head">
            <div className="section-head__text">
              <p className="eyebrow">Chosen by you</p>
              <h2 id="goals-heading">The goals you set</h2>
            </div>
            <Link className="btn btn--small" href="/account">
              Edit profile
            </Link>
          </div>

          {!profile?.sleepGoalHours && !profile?.activityGoalMinutes ? (
            <div className="empty-state">
              <h3>No goals set</h3>
              <p>
                A sleep or activity goal is a number you choose for yourself. This page
                compares it with what you recorded and says nothing else about it: it is
                not a clinical target and no source sets it for you.
              </p>
              <Link className="btn" href="/account">
                Set a goal in your profile
              </Link>
            </div>
          ) : (
            <div className="grid-2">
              {profile?.sleepGoalHours ? (
                <article className="card metric-card">
                  <p className="kicker">Sleep goal</p>
                  <p style={{ margin: 0 }}>
                    <span className="metric-card__value">{profile.sleepGoalHours}</span>{" "}
                    hours a night, your own goal.
                  </p>
                  {sleepAverage === null ? (
                    <p className="meta" style={{ margin: 0 }}>
                      No sleep recordings in the last 14 days, so there is nothing to show
                      beside it yet. <Link href="/records">Record hours slept</Link>
                    </p>
                  ) : (
                    <>
                      <div
                        className="progress"
                        role="img"
                        aria-label={`Your recorded average of ${sleepAverage.toFixed(1)} hours against a goal of ${profile.sleepGoalHours} hours`}
                      >
                        <div
                          className="progress__fill"
                          style={{
                            width: `${Math.min(100, (sleepAverage / profile.sleepGoalHours) * 100).toFixed(1)}%`,
                          }}
                        />
                      </div>
                      <p className="meta" style={{ margin: 0 }}>
                        Your recordings over the last 14 days average{" "}
                        {sleepAverage.toFixed(1)} hours.
                      </p>
                    </>
                  )}
                </article>
              ) : null}

              {profile?.activityGoalMinutes ? (
                <article className="card metric-card">
                  <p className="kicker">Activity goal</p>
                  <p style={{ margin: 0 }}>
                    <span className="metric-card__value">
                      {profile.activityGoalMinutes}
                    </span>{" "}
                    minutes a day, your own goal.
                  </p>
                  {activityAverage === null ? (
                    <p className="meta" style={{ margin: 0 }}>
                      No activity recordings in the last 7 days, so there is nothing to
                      show beside it yet. <Link href="/records">Record activity</Link>
                    </p>
                  ) : (
                    <>
                      <div
                        className="progress"
                        role="img"
                        aria-label={`Your recorded average of ${Math.round(activityAverage)} minutes against a goal of ${profile.activityGoalMinutes} minutes`}
                      >
                        <div
                          className="progress__fill"
                          style={{
                            width: `${Math.min(100, (activityAverage / profile.activityGoalMinutes) * 100).toFixed(1)}%`,
                          }}
                        />
                      </div>
                      <p className="meta" style={{ margin: 0 }}>
                        Your recordings over the last 7 days average{" "}
                        {Math.round(activityAverage)} minutes a day.
                      </p>
                    </>
                  )}
                </article>
              ) : null}
            </div>
          )}
        </section>

        <section aria-labelledby="next-steps-heading" style={{ marginTop: "var(--space-8)" }}>
          <div className="section-head">
            <div className="section-head__text">
              <p className="eyebrow">From your own data</p>
              <h2 id="next-steps-heading">Suggested next steps</h2>
            </div>
          </div>

          {recommendations.length === 0 ? (
            <div className="empty-state">
              <h3>Nothing to suggest right now</h3>
              <p>
                Suggestions come from what you have chosen to tell the platform: selected
                interests, goals you set, and measurements you recorded. With those in
                place, or with a reading that changes the picture, this section fills in.{" "}
                <Link href="/account">Add interests or goals</Link> to get started, or{" "}
                <Link href="/podcasts">browse the podcasts tab</Link>, which needs no
                profile at all.
              </p>
            </div>
          ) : (
            <ul className="list-plain">
              {recommendations.map((recommendation) => (
                <li key={recommendation.key}>
                  <article
                    className={
                      recommendation.kind === "urgent"
                        ? "card notice--urgent"
                        : "card notice--recommendation"
                    }
                  >
                    <p className="eyebrow" style={{ marginBottom: "var(--space-2)" }}>
                      {RECOMMENDATION_KIND_LABELS[recommendation.kind]}
                    </p>
                    <h3 style={{ marginTop: 0 }}>{recommendation.title}</h3>
                    <p>{recommendation.why}</p>

                    <details>
                      <summary>What this is based on</summary>
                      <ul className="based-on" style={{ marginTop: "var(--space-2)" }}>
                        {recommendation.basedOn.map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                    </details>

                    {recommendation.action ? (
                      <p style={{ margin: "var(--space-3) 0" }}>
                        <Link
                          className="btn btn--small btn--primary"
                          href={recommendation.action.href}
                        >
                          {recommendation.action.label}
                        </Link>
                      </p>
                    ) : null}

                    <RecommendationActions
                      recKey={recommendation.key}
                      completable={recommendation.completable}
                    />
                  </article>
                </li>
              ))}
            </ul>
          )}
        </section>

        {podcastSuggestions.length > 0 ? (
          <section aria-labelledby="viewing-heading" style={{ marginTop: "var(--space-8)" }}>
            <div className="section-head">
              <div className="section-head__text">
                <p className="eyebrow">Matched by topic</p>
                <h2 id="viewing-heading">Suggested viewing</h2>
              </div>
              <Link className="btn btn--small" href="/podcasts">
                Browse everything
              </Link>
            </div>

            <ul className="list-plain">
              {podcastSuggestions.map((suggestion) => (
                <li key={suggestion.entry.id} className="card">
                  <h3 style={{ marginTop: 0 }}>
                    <Link href={`/podcasts/${suggestion.entry.id}`}>
                      {suggestion.entry.title}
                    </Link>
                  </h3>
                  <p className="meta">
                    {suggestion.entry.publisher} ·{" "}
                    {formatDuration(suggestion.entry.durationSeconds)} ·{" "}
                    {suggestion.entry.topics
                      .map((topic) => PODCAST_TOPIC_LABELS[topic])
                      .join(", ")}
                  </p>
                  <p style={{ marginBottom: 0 }}>
                    <strong>Why this is here:</strong> {suggestion.reason}
                  </p>
                </li>
              ))}
            </ul>
            <p className="meta" style={{ marginTop: "var(--space-3)" }}>
              Matched by topic from your profile. Catalogue metadata last checked{" "}
              {CATALOGUE_VERIFICATION.verifiedOn}.
            </p>
          </section>
        ) : null}

        <section aria-labelledby="saved-heading" style={{ marginTop: "var(--space-8)" }}>
          <div className="section-head">
            <div className="section-head__text">
              <p className="eyebrow">Kept deliberately</p>
              <h2 id="saved-heading">Saved for later</h2>
            </div>
          </div>

          {savedCount === 0 ? (
            <p className="meta" style={{ margin: 0 }}>
              Nothing saved yet. The <Link href="/podcasts">podcasts tab</Link> and every
              page in the <Link href="/library">source library</Link> have a button that
              keeps the item here.
            </p>
          ) : (
            <ul className="saved-list">
              {saved.map((item) => (
                <li key={`${item.kind}:${item.refId}`}>
                  {item.available && item.localPath ? (
                    <Link href={item.localPath}>{item.title}</Link>
                  ) : (
                    <span>
                      {item.title ?? item.refId}{" "}
                      <span className="muted">
                        (no longer in the catalogue, kept so the entry is not lost
                        silently)
                      </span>
                    </span>
                  )}
                  <div className="meta">
                    {item.kind === "podcast" ? "Podcast or video" : "Source document"} ·
                    saved {new Date(item.savedAt).toLocaleDateString("en-GB")}
                    {item.url ? (
                      <>
                        {" "}
                        ·{" "}
                        <a href={item.url} rel="noreferrer noopener" target="_blank">
                          Open at the publisher
                        </a>
                      </>
                    ) : null}
                  </div>
                  <RemoveSavedButton
                    kind={item.kind}
                    refId={item.refId}
                    label="Remove from saved"
                  />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section
          aria-labelledby="profile-summary-heading"
          style={{ marginTop: "var(--space-8)" }}
        >
          <div className="section-head">
            <div className="section-head__text">
              <p className="eyebrow">As you entered it</p>
              <h2 id="profile-summary-heading">What your profile currently says</h2>
            </div>
            <Link className="btn btn--small" href="/account">
              Edit your profile
            </Link>
          </div>

          <div className="card profile-facts">
            <div>
              <span className="profile-facts__label">Preferred name</span>
              <p>{profile?.displayName ?? "not given"}</p>
            </div>
            <div>
              <span className="profile-facts__label">Interests</span>
              <p>
                {profile && profile.interests.length > 0
                  ? profile.interests.map(interestLabel).join(", ")
                  : "none selected"}
              </p>
            </div>
            <div>
              <span className="profile-facts__label">Goals</span>
              <p>
                {profile && profile.goals.length > 0
                  ? profile.goals.map(goalLabel).join(", ")
                  : "none selected"}
              </p>
            </div>
            <div>
              <span className="profile-facts__label">Told to you by a clinician</span>
              <p>
                {profile && profile.selfReportedConditions.length > 0
                  ? profile.selfReportedConditions.map(conditionLabel).join(", ")
                  : "nothing recorded"}
              </p>
            </div>
          </div>
          <p className="meta" style={{ marginTop: "var(--space-3)" }}>
            That last entry is your own account, as you entered it. It is not a verified
            record, it is not used to decide any care level, and the symptom guidance and
            emergency screen do not read it.
          </p>
        </section>

        {suppressedWithState.length > 0 ? (
          <details className="panel" style={{ marginTop: "var(--space-6)" }}>
            <summary>
              Suggestions you dismissed or completed ({suppressedWithState.length})
            </summary>
            <p className="meta">
              Only the identifier of each suggestion is kept, never the text. The text is
              recomputed from your current data each time, so a suggestion that is no
              longer true does not come back.
            </p>
            <ul className="saved-list">
              {suppressedWithState.map((entry) => (
                <li key={entry.key}>
                  <span className="mono">{entry.key}</span> ·{" "}
                  {entry.state === "done" ? "marked done" : "dismissed"} on{" "}
                  {new Date(entry.updatedAt).toLocaleDateString("en-GB")}
                  <div>
                    <RestoreRecommendationButton recKey={entry.key} />
                  </div>
                </li>
              ))}
            </ul>
          </details>
        ) : null}

        <div className="notice notice--info" style={{ marginTop: "var(--space-8)" }}>
          <p className="notice__title">What this dashboard is not</p>
          <ul style={{ marginBottom: 0 }}>
            <li>
              It is not a medical record and does not replace one. It holds self-reported
              measurements, not clinical results.
            </li>
            <li>
              It does not diagnose, estimate a risk, or predict anything. Comparisons on
              this page are between your own entries and goals you set yourself.
            </li>
            <li>
              If something you are feeling worries you now, do not wait for a trend.{" "}
              <Link href="/guidance">Symptom guidance</Link> screens for emergency warning
              signs first and works without the assistant.
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}
