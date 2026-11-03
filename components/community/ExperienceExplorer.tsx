"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

import { formatDate, formatDateTime } from "@/lib/community/format";
import {
  EXPERIENCE_TOPICS,
  type ExperienceTopicId,
} from "@/lib/community/experience-topics";

export type ExplorerDisease = {
  id: string;
  name: string;
  shortName: string;
  starterQuestion: string;
};

export type FallbackResource = {
  name: string;
  platform: string;
  url: string;
  kind: string;
  accessNote: string | null;
  checkedOn: string;
};

type NativeItem = {
  id: number;
  title: string;
  excerpt: string;
  url: string;
  topicLabel: string;
  authorName: string;
  createdAt: string;
  commentCount: number;
};

type ExternalAnswer = {
  id: number;
  excerpt: string | null;
  author: string | null;
  score: number;
  accepted: boolean;
  createdAt: string | null;
};

type ExternalItem = {
  id: string;
  title: string;
  excerpt: string | null;
  url: string;
  publishedAt: string | null;
  retrievedAt: string;
  tags: string[];
  answerCount: number;
  score: number;
  author: string | null;
  provider: string;
  licence: string;
  licenceUrl: string;
  answer: ExternalAnswer | null;
};

type ExternalResult = {
  status: "ok" | "empty" | "unavailable" | "skipped";
  provider: { id: string; name: string; homepage: string; licence: string; licenceUrl: string };
  items: ExternalItem[];
  retrievedAt: string;
  reason: string | null;
  cached: boolean;
  answerLookup: "ok" | "failed" | "skipped";
};

type DiscoverPayload = {
  disease: { id: string; name: string; shortName: string };
  question: string;
  topic: string | null;
  native: NativeItem[];
  external: ExternalResult;
  fallbacks: FallbackResource[];
  retrievedAt: string;
};

type DiscoveryRequest = {
  diseaseId: string;
  q: string;
  topic: "all" | ExperienceTopicId;
  includeExternal: boolean;
};

type ProviderFinding = {
  id: string;
  name: string;
  method: string;
  capability: "search" | "credentials-required" | "destination-only" | "unverified";
  finding: string;
  url: string;
};

const CAPABILITY_LABEL: Record<ProviderFinding["capability"], string> = {
  search: "Searched here",
  "credentials-required": "Needs credentials, not searched",
  "destination-only": "Linked only",
  unverified: "Not verified, not listed",
};

const QUESTION_MAX = 200;

/**
 * Patient-experience discovery inside an existing community.
 *
 * Two deliberately separate paths, because they answer different needs:
 *  - "Ask people and connect" prepares a question and offers the native composer
 *    plus verified external destinations. Nothing is posted anywhere on the
 *    reader's behalf, and the copy says so.
 *  - "Read experiences" searches discussions actually stored by UltimateHealth and
 *    questions retrieved from the one external provider with an authorised search
 *    interface. The two result sets are labelled and never merged, so a personal
 *    account cannot be mistaken for a verified story or for medical advice.
 *
 * The interface never invents a result. An external failure is rendered as a
 * failure with the verified link directory still usable.
 */
export function ExperienceExplorer({
  diseases,
  initialDiseaseId,
  signedIn,
  showDiseaseSelect,
  fallbacks,
  providerFindings,
}: {
  diseases: readonly ExplorerDisease[];
  initialDiseaseId: string;
  signedIn: boolean;
  showDiseaseSelect: boolean;
  /** Verified destinations per disease, so the fallback needs no request. */
  fallbacks: Record<string, readonly FallbackResource[]>;
  providerFindings: readonly ProviderFinding[];
}) {
  const ids = useId();
  const [mode, setMode] = useState<"read" | "ask">("read");
  const [diseaseId, setDiseaseId] = useState(initialDiseaseId);
  const [question, setQuestion] = useState("");
  const [topic, setTopic] = useState<"all" | ExperienceTopicId>("all");
  const [busy, setBusy] = useState(false);
  const [externalBusy, setExternalBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DiscoverPayload | null>(null);
  const [draft, setDraft] = useState("");
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const requestId = useRef(0);
  const lastRequest = useRef<DiscoveryRequest | null>(null);
  /* A ref, not state: React may run this effect twice before a state update is
   * committed, and the point of the guard is to make exactly one request. */
  const autoLoadedFor = useRef<string | null>(null);

  const disease =
    diseases.find((item) => item.id === diseaseId) ?? diseases[0]!;
  const destinations = data?.fallbacks ?? fallbacks[disease.id] ?? [];
  const peerDestinations = destinations.filter(
    (resource) => resource.kind === "peer-community",
  );
  const otherDestinations = destinations.filter(
    (resource) => resource.kind !== "peer-community",
  );

  useEffect(() => {
    if (mode !== "ask") return;
    setDraft((current) =>
      current.trim()
        ? current
        : question.trim() || disease.starterQuestion,
    );
  }, [mode, question, disease.starterQuestion]);

  async function load(
    request: DiscoveryRequest,
    mode: "search" | "default" | "external",
  ) {
    const current = ++requestId.current;
    lastRequest.current = request;
    if (mode === "external") setExternalBusy(true);
    else setBusy(true);
    if (mode !== "external") {
      setError(null);
      setCopied(false);
      setCopyError(null);
    }

    try {
      const response = await fetch("/api/community/discover", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          disease: request.diseaseId,
          topic: request.topic,
          q: request.q.slice(0, QUESTION_MAX),
          includeExternal: request.includeExternal,
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | (Partial<DiscoverPayload> & { error?: string })
        | null;

      if (current !== requestId.current) return;

      if (!response.ok || !payload || !payload.native || !payload.external) {
        if (mode !== "external") setData(null);
        setError(
          payload?.error ??
            "The search could not be completed. The community feed and the verified links are still available.",
        );
        return;
      }

      setData(payload as DiscoverPayload);
      setError(null);
    } catch {
      if (current !== requestId.current) return;
      if (mode !== "external") setData(null);
      setError(
        "The request did not reach the server. Check your connection, then retry; the verified links below still work.",
      );
    } finally {
      if (current === requestId.current) {
        setBusy(false);
        setExternalBusy(false);
      }
    }
  }

  /*
   * Opening a community loads both halves of the page: discussions stored here and
   * public questions from the one provider that permits an authorised search. The
   * reader never has to type a question first, which was the whole point.
   *
   * The external call is cheap to repeat: the server keeps a ten-minute per-disease
   * cache and a failure backoff, so re-opening a community inside that window is
   * served from the cache. The ref guard stops a double mount from issuing two
   * requests in the first place.
   */
  useEffect(() => {
    if (autoLoadedFor.current === disease.id) return;
    autoLoadedFor.current = disease.id;
    void load(
      { diseaseId: disease.id, q: "", topic: "all", includeExternal: true },
      "default",
    );
  }, [disease.id]);

  function search(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void load(
      {
        diseaseId: disease.id,
        q: question.trim(),
        topic,
        includeExternal: true,
      },
      "search",
    );
  }

  function loadExternalQuestions() {
    void load(
      {
        diseaseId: disease.id,
        q: question.trim(),
        topic,
        includeExternal: true,
      },
      "external",
    );
  }

  function retry() {
    const request = lastRequest.current ?? {
      diseaseId: disease.id,
      q: question.trim(),
      topic,
      includeExternal: false,
    };
    void load(request, "search");
  }

  async function copyDraft() {
    const text = draft.trim();
    if (!text) {
      setCopyError("Write a question first, then copy it.");
      return;
    }
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const area = document.createElement("textarea");
        area.value = text;
        area.setAttribute("readonly", "");
        area.style.position = "fixed";
        area.style.opacity = "0";
        document.body.appendChild(area);
        area.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(area);
        if (!ok) throw new Error("copy refused");
      }
      setCopied(true);
      setCopyError(null);
      window.setTimeout(() => setCopied(false), 5000);
    } catch {
      setCopyError(
        "Your browser did not allow copying. Select the text and copy it manually.",
      );
    }
  }

  return (
    <section
      id="experiences"
      className="stack"
      aria-labelledby={`${ids}-heading`}
    >
      <div className="section-head">
        <div className="section-head__text">
          <p className="kicker">Patient experiences</p>
          <h2 id={`${ids}-heading`}>Find people who understand</h2>
          <p className="lede">
            Ask a question and read what other people have already shared, in this
            community and on other public sites. The two are kept separate and
            labelled, because a personal account is not medical evidence.
          </p>
        </div>
      </div>

      <div className="notice notice--warning">
        <p className="notice__title">
          Experiences are personal, not medical advice
        </p>
        <p style={{ marginBottom: "var(--space-2)" }}>
          Nobody here is diagnosing you or prescribing treatment, and a story about
          what helped one person is not proof that a treatment works. For a decision
          about your care, speak to a clinician who knows your situation.
        </p>
        <p className="meta" style={{ margin: 0 }}>
          A reply from another member, or from someone on another site, is never
          guaranteed. If symptoms are urgent,{" "}
          <Link href="/guidance">read the warning signs</Link> and contact local
          emergency services rather than waiting for an answer.
        </p>
      </div>

      <div
        className="experience-paths"
        role="group"
        aria-label="Choose how to use patient experiences"
      >
        <button
          type="button"
          className={
            mode === "ask"
              ? "experience-path experience-path--active"
              : "experience-path"
          }
          aria-pressed={mode === "ask"}
          onClick={() => setMode("ask")}
        >
          <span className="experience-path__title">Ask people and connect</span>
          <span className="experience-path__body">
            Write a question, post it in this community, or copy it to a verified
            external group. Replies are not guaranteed.
          </span>
        </button>
        <button
          type="button"
          className={
            mode === "read"
              ? "experience-path experience-path--active"
              : "experience-path"
          }
          aria-pressed={mode === "read"}
          onClick={() => setMode("read")}
        >
          <span className="experience-path__title">Read patient experiences</span>
          <span className="experience-path__body">
            Search what members have already shared here, then read public questions
            from an external Q&amp;A site where reuse is permitted.
          </span>
        </button>
      </div>

      <form className="panel stack" onSubmit={search}>
        <div className="grid-2">
          {showDiseaseSelect ? (
            <div className="field">
              <label className="field__label" htmlFor={`${ids}-disease`}>
                Condition
              </label>
              <select
                className="select"
                id={`${ids}-disease`}
                value={disease.id}
                onChange={(event) => {
                  setDiseaseId(event.target.value);
                  setData(null);
                  setError(null);
                }}
              >
                {diseases.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              <p className="field__hint">
                Searching uses this community&apos;s own disease identifier.
              </p>
            </div>
          ) : null}

          <div className="field">
            <label className="field__label" htmlFor={`${ids}-topic`}>
              Experience topic
            </label>
            <select
              className="select"
              id={`${ids}-topic`}
              value={topic}
              onChange={(event) =>
                setTopic(event.target.value as "all" | ExperienceTopicId)
              }
            >
              <option value="all">Any topic</option>
              {EXPERIENCE_TOPICS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
            <p className="field__hint">
              Filters the UltimateHealth results. The external search uses your
              words, not the category.
            </p>
          </div>
        </div>

        <div className="field">
          <label className="field__label" htmlFor={`${ids}-question`}>
            {mode === "ask"
              ? "What do you want to ask?"
              : "What would you like to read about?"}
          </label>
          <textarea
            className="textarea"
            id={`${ids}-question`}
            rows={3}
            value={question}
            maxLength={QUESTION_MAX}
            onChange={(event) => {
              setQuestion(event.target.value);
              setCopied(false);
              setCopyError(null);
            }}
            placeholder={`For example: ${disease.starterQuestion}`}
          />
          <p className="field__hint">
            {question.length} of {QUESTION_MAX} characters. Keep it general:
            names, contact details, and anyone else&apos;s health information do
            not belong here.
          </p>
        </div>

        <p className="meta" style={{ margin: 0 }}>
          Searching sends the words above and the selected condition to Medical
          Sciences Stack Exchange so it can return public questions. Nothing else is
          sent: no account, profile, or health record. Do not type names, contact
          details, or anyone else&apos;s health information.
        </p>

        <div className="community-actions">
          <button className="btn btn--primary" type="submit" disabled={busy}>
            {busy ? "Searching…" : "Search discussions and external questions"}
          </button>
          <Link className="btn" href={`/community/${disease.id}#start`}>
            {signedIn ? "Post in this community" : "Sign in to post"}
          </Link>
        </div>

        {error ? (
          <div className="notice notice--danger" role="alert">
            <p className="notice__title">The search did not complete</p>
            <p style={{ marginBottom: "var(--space-2)" }}>{error}</p>
            <button className="btn btn--small" type="button" onClick={retry}>
              Retry
            </button>
          </div>
        ) : null}
      </form>

      <div aria-live="polite">
        {!data && busy ? (
          <div className="notice notice--info" role="status">
            <p className="notice__title">Loading discussions and external questions…</p>
            <p style={{ margin: 0 }}>
              Reading the discussions stored for {disease.name} and asking Medical
              Sciences Stack Exchange for public questions about it. One provider
              call is made, then cached for ten minutes; if it fails, everything
              stored here still loads.
            </p>
          </div>
        ) : null}

        {data ? (
          <div className="stack">
            <p className="meta" style={{ margin: 0 }}>
              {data.question ? (
                <>
                  Search for <strong>{data.disease.name}</strong> matching “
                  {data.question}”
                </>
              ) : (
                <>
                  Recent <strong>{data.disease.name}</strong> discussions stored here
                </>
              )}{" "}
              · retrieved {formatDateTime(data.retrievedAt)}
              {data.external.cached ? " (cached copy)" : ""}
            </p>

            <p className="meta" style={{ margin: 0 }}>
              Two different kinds of content appear below, and they are labelled so
              they cannot be mistaken for each other. UltimateHealth discussions are
              first-person accounts written by members here, not verified. External
              questions are general medical Q&amp;A published on another site, not
              lived experience. Neither is medical evidence.
            </p>

            <div className="grid-2">
              <section
                className="panel stack-tight"
                aria-labelledby={`${ids}-native`}
              >
                <h3 id={`${ids}-native`} style={{ fontSize: "1.3rem" }}>
                  UltimateHealth discussions
                </h3>
                <p className="meta" style={{ margin: 0 }}>
                  {data.native.length === 0
                    ? "No stored discussion matched. That is the real count, not a hidden result."
                    : `${data.native.length} stored ${data.native.length === 1 ? "discussion" : "discussions"} matched. Each one was written by a member here and is one person's account.`}
                </p>

                {data.native.length === 0 ? (
                  <div className="empty-state">
                    <h4>Nobody has described this yet</h4>
                    <p className="meta" style={{ margin: 0 }}>
                      Try shorter words, another topic, or another community. You can
                      also start the first discussion; a short question is enough.
                    </p>
                    <Link
                      className="btn btn--small btn--primary"
                      href={`/community/${data.disease.id}#start`}
                    >
                      Start a discussion
                    </Link>
                  </div>
                ) : (
                  <ul className="list-plain experience-results">
                    {data.native.map((item) => (
                      <li key={item.id} className="experience-result">
                        <h4 className="experience-result__title">
                          <Link href={item.url}>{item.title}</Link>
                        </h4>
                        <p className="meta" style={{ margin: 0 }}>
                          {item.topicLabel} · {item.authorName} ·{" "}
                          {formatDate(item.createdAt)} ·{" "}
                          {item.commentCount}{" "}
                          {item.commentCount === 1 ? "reply" : "replies"}
                        </p>
                        <p className="experience-result__excerpt">{item.excerpt}</p>
                        <p className="meta" style={{ margin: 0 }}>
                          UltimateHealth member · one person&apos;s account, not
                          medical advice
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section
                className="panel stack-tight"
                aria-labelledby={`${ids}-external`}
              >
                <h3 id={`${ids}-external`} style={{ fontSize: "1.3rem" }}>
                  General medical questions and answers elsewhere
                </h3>
                <p className="meta" style={{ margin: 0 }}>
                  These are public question-and-answer threads, not first-person
                  patient or caregiver experiences. They are shown because no
                  authorised feed of individual patient stories exists for this
                  condition; the verified communities further down are where people
                  write in their own words.
                </p>

                {data.external.status === "ok" ? (
                  <>
                    <p className="meta" style={{ margin: 0 }}>
                      {data.external.items.length} public{" "}
                      {data.external.items.length === 1 ? "question" : "questions"}{" "}
                      from {data.external.provider.name}, retrieved{" "}
                      {formatDateTime(data.external.retrievedAt)}. Each card shows the
                      question and, when the provider returned one, the accepted or
                      top-voted answer. The link opens the full original thread.
                    </p>
                    <ul className="list-plain experience-results">
                      {data.external.items.map((item) => (
                        <li key={item.id} className="experience-result">
                          <h4 className="experience-result__title">
                            <a
                              href={item.url}
                              target="_blank"
                              rel="noopener noreferrer external"
                            >
                              {item.title}
                              <span className="visually-hidden">
                                {" "}
                                (opens the original question in a new tab)
                              </span>
                            </a>
                          </h4>
                          <p className="meta" style={{ margin: 0 }}>
                            Public question{item.author ? ` · ${item.author}` : ""}
                            {item.publishedAt
                              ? ` · Asked ${formatDate(item.publishedAt)}`
                              : ""}
                            {" · "}
                            {item.answerCount}{" "}
                            {item.answerCount === 1 ? "answer" : "answers"} · Source:{" "}
                            {item.provider}
                          </p>
                          {item.excerpt ? (
                            <p className="experience-result__excerpt">
                              {item.excerpt}
                            </p>
                          ) : null}

                          {item.answer ? (
                            <div className="experience-answer">
                              <p className="meta" style={{ margin: 0 }}>
                                <strong>
                                  {item.answer.accepted
                                    ? "Accepted answer"
                                    : "Top-voted answer"}
                                </strong>
                                {item.answer.author
                                  ? ` · ${item.answer.author}`
                                  : ""}
                                {item.answer.createdAt
                                  ? ` · ${formatDate(item.answer.createdAt)}`
                                  : ""}
                                {` · score ${item.answer.score}`}
                              </p>
                              {item.answer.excerpt ? (
                                <p
                                  className="experience-result__excerpt"
                                  style={{ marginTop: "var(--space-1)" }}
                                >
                                  {item.answer.excerpt}
                                </p>
                              ) : null}
                              <p className="meta" style={{ margin: 0 }}>
                                One person&apos;s answer quoted from{" "}
                                {item.provider} under {item.licence}. It is not
                                medical advice from a clinician who knows you.
                              </p>
                            </div>
                          ) : (
                            <p className="meta" style={{ margin: 0 }}>
                              {item.answerCount === 0
                                ? "No answer available yet."
                                : data.external.answerLookup === "failed"
                                  ? "Answer text could not be retrieved. Open the original question to read the answers."
                                  : "This question has answers on the original site; open the thread to read them."}
                            </p>
                          )}
                          {item.tags.length > 0 ? (
                            <p className="meta" style={{ margin: 0 }}>
                              Tags: {item.tags.join(", ")}
                            </p>
                          ) : null}
                          <p className="meta" style={{ margin: 0 }}>
                            Quoted under{" "}
                            <a
                              href={item.licenceUrl}
                              target="_blank"
                              rel="noopener noreferrer external"
                            >
                              {item.licence}
                            </a>{" "}
                            · retrieved {formatDateTime(item.retrievedAt)}
                          </p>
                        </li>
                      ))}
                    </ul>
                    <p className="meta" style={{ margin: 0 }}>
                      These are general medical questions and answers posted on that
                      site. They are not verified patient stories, not a record of
                      anyone&apos;s lived experience, and not checked by
                      UltimateHealth. To report a problem with an external thread,
                      use that site&apos;s own report or flag control;
                      UltimateHealth does not moderate it and cannot remove it.
                    </p>
                  </>
                ) : null}

                {data.external.status === "skipped" ? (
                  <div className="notice notice--info">
                    <p className="notice__title">External questions were not requested</p>
                    <p style={{ marginBottom: "var(--space-2)" }}>
                      This view deliberately did not ask the external provider, so no
                      quota was spent. That is not a finding about whether such
                      questions exist. Load them to see what the provider returns.
                    </p>
                    <button
                      className="btn btn--small"
                      type="button"
                      onClick={loadExternalQuestions}
                      disabled={externalBusy}
                    >
                      {externalBusy
                        ? "Loading external questions…"
                        : "Load recent external questions"}
                    </button>
                  </div>
                ) : null}

                {data.external.status === "empty" ? (
                  <div className="notice notice--info">
                    <p className="notice__title">No external match</p>
                    <p style={{ margin: 0 }}>
                      {data.external.reason ??
                        "The external service returned no matching public question."}
                    </p>
                  </div>
                ) : null}

                {externalBusy ? (
                  <p className="meta" role="status" style={{ margin: 0 }}>
                    Asking the external provider…
                  </p>
                ) : null}

                {data.external.status === "unavailable" ? (
                  <div className="notice notice--warning">
                    <p className="notice__title">External search unavailable</p>
                    <p style={{ marginBottom: "var(--space-2)" }}>
                      {data.external.reason ??
                        "The external question service could not be reached."}
                    </p>
                    <p className="meta" style={{ marginBottom: "var(--space-2)" }}>
                      Nothing is shown in its place, because inventing a result would
                      be worse than an empty one. An unavailable provider is not
                      evidence that nobody has written about this. The verified
                      destinations below are real, checked links.
                    </p>
                    <button
                      className="btn btn--small"
                      type="button"
                      onClick={loadExternalQuestions}
                      disabled={externalBusy}
                    >
                      {externalBusy ? "Retrying…" : "Retry external search"}
                    </button>
                  </div>
                ) : null}
              </section>
            </div>
          </div>
        ) : null}
      </div>

      {mode === "ask" ? (
        <section
          className="panel stack"
          aria-labelledby={`${ids}-draft`}
        >
          <div className="section-head" style={{ margin: 0 }}>
            <div className="section-head__text">
              <p className="kicker">Prepare once, then choose where</p>
              <h3 id={`${ids}-draft`} style={{ fontSize: "1.3rem" }}>
                Your question for {disease.name}
              </h3>
              <p className="meta" style={{ marginBottom: 0 }}>
                Edit it here, then copy it into this community or into a verified
                external group. Nothing is sent until you do that yourself.
              </p>
            </div>
          </div>

          <div className="field">
            <label className="field__label" htmlFor={`${ids}-draft-text`}>
              Draft question
            </label>
            <textarea
              className="textarea"
              id={`${ids}-draft-text`}
              rows={4}
              maxLength={QUESTION_MAX}
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
                setCopied(false);
                setCopyError(null);
              }}
            />
            <p className="field__hint">
              {draft.length} of {QUESTION_MAX} characters. Avoid names and contact
              details, and do not include anyone else&apos;s health information.
            </p>
          </div>

          <div className="community-actions">
            <button
              className="btn btn--primary"
              type="button"
              onClick={copyDraft}
            >
              {copied ? "Copied to the clipboard" : "Copy this question"}
            </button>
            <Link className="btn" href={`/community/${disease.id}#start`}>
              {signedIn ? "Post it in this community" : "Sign in to post here"}
            </Link>
          </div>

          {copied ? (
            <p className="meta" role="status" style={{ margin: 0 }}>
              Copied. Open a destination below, paste it into that site&apos;s own
              form, and post it there yourself.
            </p>
          ) : null}
          {copyError ? (
            <p className="meta" role="alert" style={{ margin: 0 }}>
              {copyError}
            </p>
          ) : null}

          <h4 style={{ margin: 0 }}>Verified external destinations</h4>
          {peerDestinations.length + otherDestinations.length === 0 ? (
            <div className="notice notice--info">
              <p className="notice__title">
                No verified external community for {disease.name} yet
              </p>
              <p style={{ margin: 0 }}>
                No disease-specific external community could be confirmed for this
                condition, so none is invented. The UltimateHealth community above
                still works, and posting there is the available option.
              </p>
            </div>
          ) : (
            <ul className="list-plain experience-destinations">
              {[...peerDestinations, ...otherDestinations].map((resource) => (
                <li key={resource.url} className="experience-destination">
                  <div className="community-post__tags">
                    <span className="tag tag--accent">{resource.platform}</span>
                    <span className="tag">
                      {resource.kind === "peer-community"
                        ? "Peer community"
                        : resource.kind === "patient-organisation"
                          ? "Patient organisation"
                          : resource.kind === "support-service"
                            ? "Support service"
                            : "Medical information"}
                    </span>
                  </div>
                  <h5 className="experience-result__title">
                    <a
                      href={resource.url}
                      target="_blank"
                      rel="noopener noreferrer external"
                    >
                      {resource.name}
                      <span className="visually-hidden">
                        {" "}
                        (opens in a new tab)
                      </span>
                    </a>
                  </h5>
                  {resource.accessNote ? (
                    <p className="meta" style={{ margin: 0 }}>
                      Access: {resource.accessNote}
                    </p>
                  ) : null}
                  <p className="meta" style={{ margin: 0 }}>
                    Checked {formatDate(resource.checkedOn)} · another site&apos;s
                    rules and privacy policy apply
                  </p>
                </li>
              ))}
            </ul>
          )}

          <p className="meta" style={{ margin: 0 }}>
            UltimateHealth cannot post to another site for you, cannot sign you in
            there, and cannot confirm that a question was posted or answered. If a
            destination asks you to register, that is that platform&apos;s
            requirement, not something UltimateHealth can bypass.
          </p>
        </section>
      ) : null}

      <details className="experience-providers">
        <summary>
          Which external sources are searched, and which are only linked?
        </summary>
        <ul className="list-plain stack-tight" style={{ marginTop: "var(--space-3)" }}>
          {providerFindings.map((provider) => (
            <li key={provider.id} className="experience-provider">
              <p style={{ margin: 0 }}>
                <strong>{provider.name}</strong> · {CAPABILITY_LABEL[provider.capability]}
              </p>
              <p className="meta" style={{ margin: 0 }}>
                {provider.method}. {provider.finding}
              </p>
              <a
                className="meta"
                href={provider.url}
                target="_blank"
                rel="noopener noreferrer external"
              >
                Open {provider.name}
                <span className="visually-hidden"> (opens in a new tab)</span>
              </a>
            </li>
          ))}
        </ul>
        <p className="meta" style={{ marginBottom: 0 }}>
          Only Medical Sciences Stack Exchange currently supports an authorised
          search from here. Reddit needs API credentials that are not configured, and
          HealthUnlocked, PatientsLikeMe and HealthCircle are linked as destinations
          only. No provider is scraped, and no external content is copied into the
          UltimateHealth database.
        </p>
      </details>
    </section>
  );
}
