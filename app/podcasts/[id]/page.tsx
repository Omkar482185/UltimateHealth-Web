import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { SaveResourceButton } from "@/components/SaveResourceButton";
import { getCurrentUser } from "@/lib/auth/cookies";
import {
  CATALOGUE_VERIFICATION,
  formatDuration,
  formatPublishedOn,
  getPodcastEntry,
  PODCAST_ENTRIES,
  PUBLISHER_KIND_LABELS,
  relatedEpisodes,
} from "@/lib/podcasts/catalogue";
import { listSavedResources } from "@/lib/profile/saved";
import { PODCAST_TOPIC_LABELS } from "@/lib/profile/options";

type Props = { params: Promise<{ id: string }> };

export function generateStaticParams() {
  return PODCAST_ENTRIES.map((entry) => ({ id: entry.id }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const entry = getPodcastEntry(id);
  if (!entry) return { title: "Episode not found" };
  return {
    title: entry.title,
    description: entry.summary,
  };
}

/**
 * One episode.
 *
 * The player is YouTube's privacy-enhanced embed, and the direct link to the video
 * is always shown beside it rather than being hidden behind an error state. That
 * ordering is deliberate: some publishers disable embedding and some browsers
 * block it, so the reliable route to the content has to be visible before anything
 * is attempted.
 *
 * The page needs the session only to know whether this episode is already saved.
 * It is not prerendered as a private page: `instant = false` and the cookie read
 * follow the pattern used by the account and records pages.
 */
export const instant = false;

export default async function PodcastEpisodePage({ params }: Props) {
  await connection();
  const { id } = await params;
  const entry = getPodcastEntry(id);
  if (!entry) notFound();

  const user = await getCurrentUser();
  const saved = user ? listSavedResources(user.id) : [];
  const alreadySaved = saved.some(
    (item) => item.kind === "podcast" && item.refId === entry.id,
  );
  const related = relatedEpisodes(entry.id, 3);

  return (
    <section className="section section--flush">
      <div className="container stack">
        <p className="meta" style={{ marginBottom: 0 }}>
          <Link href="/podcasts">← All podcasts and videos</Link>
        </p>

        <div className="page-head" style={{ paddingTop: 0 }}>
          <p className="eyebrow">Published by {entry.publisher}</p>
          <h1>{entry.title}</h1>
          <p className="lede">{entry.summary}</p>
        </div>

        <div className="split">
          <div className="stack">
            <div className="video-frame">
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${entry.videoId}`}
                title={entry.title}
                loading="lazy"
                allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
              />
            </div>

            <div className="row">
              <a
                className="btn btn--primary"
                href={entry.videoUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Watch on YouTube
              </a>
              <SaveResourceButton
                signedIn={user !== null}
                kind="podcast"
                refId={entry.id}
                initiallySaved={alreadySaved}
                label="Keep this episode"
              />
            </div>

            {user ? null : (
              <p className="meta">
                <Link href="/account">Sign in</Link> to keep this episode in your list.
                Playing it does not need an account.
              </p>
            )}

            <div className="notice notice--info">
              <p className="notice__title">If the player does not load</p>
              <p style={{ margin: 0 }}>
                The publisher can disable embedding, and some browsers and networks block
                it. The <span className="mono">Watch on YouTube</span> link above opens the
                same video on the publisher&apos;s own page and always works.
              </p>
            </div>
          </div>

          <aside className="stack">
            <div className="panel stack-tight">
              <h2 style={{ fontSize: "1.05rem", margin: 0 }}>About this episode</h2>
              <dl className="detail-list">
                <div>
                  <dt>Publisher</dt>
                  <dd>
                    {entry.publisher}
                    <br />
                    <span className="muted">
                      {PUBLISHER_KIND_LABELS[entry.publisherKind]}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt>Published</dt>
                  <dd>{formatPublishedOn(entry.publishedOn)}</dd>
                </div>
                <div>
                  <dt>Duration</dt>
                  <dd>{formatDuration(entry.durationSeconds)}</dd>
                </div>
                <div>
                  <dt>Language</dt>
                  <dd>{entry.language === "hi" ? "Hindi" : "English"}</dd>
                </div>
                <div>
                  <dt>Topics</dt>
                  <dd>
                    <ul className="tag-row" style={{ margin: 0, padding: 0, listStyle: "none" }}>
                      {entry.topics.map((topic) => (
                        <li key={topic} className="tag">
                          {PODCAST_TOPIC_LABELS[topic]}
                        </li>
                      ))}
                    </ul>
                  </dd>
                </div>
                <div>
                  <dt>Metadata checked</dt>
                  <dd>{CATALOGUE_VERIFICATION.verifiedOn}</dd>
                </div>
              </dl>
              {entry.datedNote ? (
                <p className="notice notice--warning" style={{ margin: 0 }}>
                  {entry.datedNote}
                </p>
              ) : null}
            </div>

            <div className="panel stack-tight">
              <h2 style={{ fontSize: "1.05rem", margin: 0 }}>
                What this listing does and does not mean
              </h2>
              <ul style={{ margin: 0, paddingLeft: "var(--space-5)" }}>
                <li>
                  This is health education published by {entry.publisher}. It is not
                  medical advice for your situation, and it does not replace an
                  assessment by a qualified health professional.
                </li>
                <li>
                  This project has not clinically reviewed the episode. It checked who
                  published it and that the details on this page match the video.
                </li>
                <li>
                  If something you are experiencing worries you, use{" "}
                  <Link href="/guidance">symptom guidance</Link>, which screens for
                  emergency warning signs first, or contact your local emergency number.
                </li>
              </ul>
            </div>

            {related.length > 0 ? (
              <div className="panel stack-tight">
                <h2 style={{ fontSize: "1.05rem", margin: 0 }}>Related in this catalogue</h2>
                <ul className="stack-tight" style={{ margin: 0, paddingLeft: "var(--space-5)" }}>
                  {related.map(({ entry: candidate, sharedTopics }) => (
                    <li key={candidate.id}>
                      <Link href={`/podcasts/${candidate.id}`}>{candidate.title}</Link>
                      <div className="meta">
                        {candidate.publisher} ·{" "}
                        {sharedTopics
                          .map((topic) => PODCAST_TOPIC_LABELS[topic])
                          .join(", ")}
                      </div>
                    </li>
                  ))}
                </ul>
                <p className="meta" style={{ margin: 0 }}>
                  Shown because they share a topic with this episode, in the order of how
                  many topics they share and then by how short they are.
                </p>
              </div>
            ) : null}
          </aside>
        </div>
      </div>
    </section>
  );
}
