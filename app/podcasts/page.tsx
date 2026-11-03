import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { PodcastBrowser, type PodcastSuggestion } from "@/components/PodcastBrowser";
import { getCurrentUser } from "@/lib/auth/cookies";
import { getProfile } from "@/lib/auth/users";
import {
  CATALOGUE_VERIFICATION,
  PODCAST_ENTRIES,
  episodesForTopics,
} from "@/lib/podcasts/catalogue";
import { listSavedResources } from "@/lib/profile/saved";
import type { PodcastTopicId } from "@/lib/profile/options";
import { suggestedContentTopics } from "@/lib/recommendations";

export const metadata: Metadata = {
  title: "Podcasts and videos",
  description:
    "A curated catalogue of health videos published by public health agencies, health services and professional medical societies, with search and topic filters.",
};

/**
 * Podcasts tab.
 *
 * The catalogue is a static module, so this page needs the session only for the
 * two things that are personal: which episodes the account already saved, and the
 * interests and goals used for the suggestions at the top. Everything else is the
 * same for every reader.
 *
 * `await connection()` comes first for the same reason as the account and records
 * pages: resolving a session compares its expiry with the current time, and Next
 * rejects a current-time read during prerendering. `instant = false` opts the route
 * out of instant-navigation validation, which is the documented opt-out for a route
 * that must block on the server.
 */
export const instant = false;

const MAX_SUGGESTIONS = 3;

export default async function PodcastsPage() {
  await connection();
  const user = await getCurrentUser();
  const profile = user ? getProfile(user.id) : null;
  const saved = user ? listSavedResources(user.id) : [];
  const savedPodcastIds = saved
    .filter((item) => item.kind === "podcast")
    .map((item) => item.refId);

  const suggestions: PodcastSuggestion[] = [];
  if (profile) {
    const topicSuggestions = suggestedContentTopics(
      {
        interests: profile.interests,
        goals: profile.goals,
        selfReportedConditions: profile.selfReportedConditions,
        sleepGoalHours: profile.sleepGoalHours,
        activityGoalMinutes: profile.activityGoalMinutes,
      },
      "podcast",
    );

    for (const suggestion of topicSuggestions) {
      if (suggestions.length >= MAX_SUGGESTIONS) break;
      const [match] = episodesForTopics(
        [suggestion.topic as PodcastTopicId],
        1,
        [...savedPodcastIds, ...suggestions.map((item) => item.entry.id)],
      );
      if (!match) continue;
      suggestions.push({
        entry: match.entry,
        reason: suggestion.reason,
        basedOn: suggestion.basedOn,
      });
    }
  }

  return (
    <section className="section section--flush">
      <div className="container stack">
        <div className="page-head">
          <p className="eyebrow">Watch and listen</p>
          <h1>Health podcasts and videos</h1>
          <p className="lede" style={{ marginTop: "var(--space-3)" }}>
            Health education published by public health agencies, national health
            services and professional medical societies, on their own channels. Each
            card opens the publisher&apos;s page, so nothing is re-hosted here and the
            publisher keeps the views.
          </p>
        </div>

        <details className="panel">
          <summary style={{ cursor: "pointer", fontWeight: 500 }}>
            How this catalogue is maintained
          </summary>
          <ul style={{ margin: "var(--space-4) 0 0" }}>
            <li>
              Every entry was added from a named authority&apos;s own channel. The video
              identifier, title, publisher, publication date and duration shown on each
              card were read from that video&apos;s own page on{" "}
              {CATALOGUE_VERIFICATION.verifiedOn}, and{" "}
              <span className="mono">pnpm check:podcasts --live</span> re-reads them and
              fails if any has changed.
            </li>
            <li>
              Being listed means the publisher is a recognised health authority. It is
              not a clinical review: this project has not reviewed the medical content of
              any episode, and a listing is not an endorsement.
            </li>
            <li>
              Episodes tied to a past campaign or outbreak are labelled as dated rather
              than presented as current guidance.
            </li>
            <li>
              {PODCAST_ENTRIES.length} episodes are listed. Selecting one opens a page
              with an embedded player and a direct link to YouTube, which is the
              fallback when embedding is blocked by the publisher or the browser.
            </li>
          </ul>
        </details>

        {!user ? (
          <p className="meta">
            <Link href="/account">Sign in</Link> to keep a list of episodes, and to see
            suggestions based on the interests in your profile.
          </p>
        ) : null}

        <div className="section-head" style={{ marginTop: "var(--space-4)" }}>
          <div className="section-head__text">
            <p className="eyebrow">Catalogue</p>
            <h2>Browse episodes</h2>
          </div>
          <p className="meta">
            {PODCAST_ENTRIES.length} episodes, each opening at its publisher
          </p>
        </div>

        <PodcastBrowser
          entries={PODCAST_ENTRIES}
          suggestions={suggestions}
          signedIn={user !== null}
          savedIds={savedPodcastIds}
          defaultLanguage={
            profile?.preferredLanguage === "en" || profile?.preferredLanguage === "hi"
              ? profile.preferredLanguage
              : null
          }
        />
      </div>
    </section>
  );
}
