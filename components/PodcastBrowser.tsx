"use client";

import Link from "next/link";
import { useId, useMemo, useState } from "react";

import { SaveResourceButton } from "@/components/SaveResourceButton";
import {
  catalogueTopics,
  filterCatalogue,
  formatDuration,
  formatPublishedOn,
  PUBLISHER_KIND_LABELS,
  type EpisodeLanguage,
  type PodcastEntry,
} from "@/lib/podcasts/catalogue";
import { PODCAST_TOPIC_LABELS, type PodcastTopicId } from "@/lib/profile/options";

export type PodcastSuggestion = {
  entry: PodcastEntry;
  /** Why this episode is being suggested, in terms of the profile signals used. */
  reason: string;
  basedOn: string[];
};

type Props = {
  entries: readonly PodcastEntry[];
  suggestions: PodcastSuggestion[];
  signedIn: boolean;
  savedIds: string[];
  /** From the profile, so the filter opens on the language the person chose. */
  defaultLanguage: EpisodeLanguage | null;
};

/**
 * Podcasts tab.
 *
 * The catalogue is a static module, so the list is complete before this component
 * runs and there is no loading state to show: what a "loading" spinner would hide
 * here is nothing. The two states that do exist are handled - an empty result set
 * offers to clear the filters, and the one asynchronous action on the page (saving
 * an item) reports its own busy and failure states.
 *
 * Filtering is deliberately a plain substring match with no ranking, so the
 * result count is explicable and an empty result is genuinely empty rather than
 * the tail of a relevance score.
 */
export function PodcastBrowser({
  entries,
  suggestions,
  signedIn,
  savedIds,
  defaultLanguage,
}: Props) {
  const [query, setQuery] = useState("");
  const [topics, setTopics] = useState<PodcastTopicId[]>([]);
  const [language, setLanguage] = useState<EpisodeLanguage | "all">(
    defaultLanguage ?? "all",
  );
  const searchId = useId();
  const languageId = useId();

  const results = useMemo(
    () =>
      filterCatalogue({
        query,
        topics,
        language: language === "all" ? null : language,
      }),
    [query, topics, language],
  );

  const availableTopics = useMemo(() => catalogueTopics(), []);
  const filtersActive = query.trim().length > 0 || topics.length > 0 || language !== "all";

  function toggleTopic(id: PodcastTopicId) {
    setTopics((current) =>
      current.includes(id)
        ? current.filter((topic) => topic !== id)
        : [...current, id],
    );
  }

  function clearFilters() {
    setQuery("");
    setTopics([]);
    setLanguage("all");
  }

  return (
    <div className="stack">
      {suggestions.length > 0 ? (
        <section className="panel stack" aria-labelledby="suggested-heading">
          <div>
            <h2 id="suggested-heading" style={{ fontSize: "1.05rem", margin: 0 }}>
              Related to what you told us
            </h2>
            <p className="meta" style={{ marginBottom: 0 }}>
              Based on the interests and goals in your profile. These are matched by
              topic, not by any judgement about what is suitable for you.
            </p>
          </div>
          <ul className="podcast-list" style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {suggestions.map((suggestion) => (
              <li key={suggestion.entry.id} className="card podcast-card">
                <PodcastThumbnail entry={suggestion.entry} />
                <div className="stack-tight podcast-card__body">
                  <h3 className="podcast-card__title">
                    <Link href={`/podcasts/${suggestion.entry.id}`}>
                      {suggestion.entry.title}
                    </Link>
                  </h3>
                  <p className="meta">
                    {suggestion.entry.publisher} ·{" "}
                    {PUBLISHER_KIND_LABELS[suggestion.entry.publisherKind]}
                  </p>
                  <p className="meta" style={{ marginBottom: 0 }}>
                    <strong>Why this is here:</strong> {suggestion.reason}
                  </p>
                  <ul className="based-on">
                    {suggestion.basedOn.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <form
        className="panel stack"
        role="search"
        onSubmit={(event) => event.preventDefault()}
      >
        <div className="filter-bar">
          <div className="field" style={{ flex: "1 1 18rem" }}>
            <label className="field__label" htmlFor={searchId}>
              Search episodes
            </label>
            <input
              id={searchId}
              className="input"
              type="search"
              value={query}
              placeholder="Title, publisher or topic"
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>

          <div className="field" style={{ flex: "0 1 12rem" }}>
            <label className="field__label" htmlFor={languageId}>
              Language
            </label>
            <select
              id={languageId}
              className="select"
              value={language}
              onChange={(event) =>
                setLanguage(event.target.value as EpisodeLanguage | "all")
              }
            >
              <option value="all">Any language</option>
              <option value="en">English</option>
              <option value="hi">Hindi</option>
            </select>
          </div>
        </div>

        {/*
          A button list rather than a set of links: each one toggles a filter on the
          page, and `aria-pressed` is what tells a screen reader which filters are
          currently on.
        */}
        <fieldset className="filter-topics">
          <legend className="field__label">Topics</legend>
          <div className="tag-row">
            {availableTopics.map((topic) => {
              const active = topics.includes(topic.id);
              return (
                <button
                  key={topic.id}
                  type="button"
                  className={active ? "chip chip--active" : "chip"}
                  aria-pressed={active}
                  onClick={() => toggleTopic(topic.id)}
                >
                  {topic.label}
                  <span className="chip__count"> {topic.count}</span>
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="row row--between">
          <p className="meta" role="status" style={{ margin: 0 }}>
            {results.length} of {entries.length} episodes
            {filtersActive ? " match the filters" : ""}
          </p>
          {filtersActive ? (
            <button type="button" className="btn btn--small" onClick={clearFilters}>
              Clear filters
            </button>
          ) : null}
        </div>
      </form>

      {results.length === 0 ? (
        <div className="notice notice--info">
          <p className="notice__title">No episodes match that</p>
          <p style={{ marginBottom: "var(--space-3)" }}>
            Every episode in the catalogue is published by a health authority that was
            checked when it was added, so a narrow filter can genuinely return nothing.
            Trying fewer words or fewer topics will widen it.
          </p>
          <button type="button" className="btn" onClick={clearFilters}>
            Clear filters
          </button>
        </div>
      ) : (
        <ul className="podcast-list" style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {results.map((entry) => (
            <li key={entry.id} className="card podcast-card">
              <PodcastThumbnail entry={entry} />
              <div className="stack-tight podcast-card__body">
                <h2 className="podcast-card__title">
                  <Link href={`/podcasts/${entry.id}`}>{entry.title}</Link>
                </h2>
                <p className="meta">
                  {entry.publisher} · {PUBLISHER_KIND_LABELS[entry.publisherKind]} ·{" "}
                  {formatPublishedOn(entry.publishedOn)} · {formatDuration(entry.durationSeconds)}
                </p>
                <p style={{ marginBottom: 0 }}>{entry.summary}</p>
                <ul className="tag-row" aria-label="Topics">
                  {entry.topics.map((topic) => (
                    <li key={topic} className="tag">
                      {PODCAST_TOPIC_LABELS[topic]}
                    </li>
                  ))}
                  {entry.language !== "en" ? (
                    <li className="tag tag--accent">
                      {entry.language === "hi" ? "Hindi" : entry.language}
                    </li>
                  ) : null}
                </ul>
                {entry.datedNote ? (
                  <p className="notice notice--warning" style={{ margin: 0 }}>
                    {entry.datedNote}
                  </p>
                ) : null}
                <div className="row">
                  <a
                    className="btn btn--small btn--primary"
                    href={entry.videoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Watch on YouTube
                  </a>
                  <Link className="btn btn--small" href={`/podcasts/${entry.id}`}>
                    Details and player
                  </Link>
                  <SaveResourceButton
                    signedIn={signedIn}
                    kind="podcast"
                    refId={entry.id}
                    initiallySaved={savedIds.includes(entry.id)}
                  />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * The thumbnail is decorative here: the title is the link immediately beside it,
 * so an empty alt would be correct, but the thumbnail carries the only visual of
 * the video, so the caption used is the entry title and it is marked `aria-hidden`
 * to avoid announcing it twice.
 */
function PodcastThumbnail({ entry }: { entry: PodcastEntry }) {
  return (
    <span className="podcast-card__thumb" aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element -- YouTube thumbnail, not a local asset. */}
      <img
        src={entry.thumbnailUrl}
        alt=""
        width={480}
        height={360}
        loading="lazy"
        decoding="async"
      />
    </span>
  );
}
