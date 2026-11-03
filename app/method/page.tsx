import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { RETRIEVAL, CHUNK } from "@/lib/config";
import { getCorpusSummary } from "@/lib/corpus-summary";
import { formatPercent, readEvaluationReport } from "@/lib/evaluation";
import { PODCAST_ENTRIES } from "@/lib/podcasts/catalogue";


export const metadata: Metadata = {
  title: "How it works and limitations",
  description:
    "The retrieval pipeline, the citation validation step, the safety screen, and the measured evaluation results behind the assistant.",
};

export const instant = false;

export default async function MethodPage() {
  await connection();
  const corpus = getCorpusSummary();
  const report = readEvaluationReport();

  // Sections the generating run did not measure. Rendering a zero where nothing
  // was measured is worse than rendering nothing: it reads as a result, and a
  // perfectly correct system would score zero on every metric in a run that made
  // no calls.
  const unmeasured = new Set(report?.notMeasured ?? []);
  const metric = (section: string, value: string | number) =>
    unmeasured.has(section) ? (
      <span className="meta">not measured in this run</span>
    ) : (
      value
    );

  return (
    <section className="section section--flush">
      <div className="container">
        <div className="page-head">
          <p className="eyebrow">Method</p>
          <h1>How it works, and what it cannot do</h1>
          <p className="lede" style={{ marginTop: "var(--space-3)" }}>
            This page describes the implemented system and reports measured
            results. Nothing here is claimed without a number behind it, and the
            evaluation methodology is stated so the numbers can be judged.
          </p>
        </div>

        <div className="page-grid">
          <div className="stack">
            <section className="stack">
              <h2 id="pipeline">The retrieval pipeline</h2>
          <table className="table">
            <caption className="visually-hidden">
              Pipeline stages and their implementation
            </caption>
            <thead>
              <tr>
                <th scope="col">Stage</th>
                <th scope="col">Implementation</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Ingestion</td>
                <td>
                  {corpus.documentCount} documents fetched from {corpus.publisherCount}{" "}
                  publishers, cleaned, chunked along heading boundaries, embedded, and
                  stored. Re-ingestion is skipped when the document content hash is
                  unchanged.
                </td>
              </tr>
              <tr>
                <td>Chunking</td>
                <td>
                  Heading-aware packing targeting {CHUNK.targetChars} characters per
                  chunk, capped at {CHUNK.maxChars}, with {CHUNK.overlapChars}{" "}
                  characters of trailing context repeated so a sentence split across a
                  boundary keeps its meaning. The overlap is removed again when the
                  document is displayed as an article.
                </td>
              </tr>
              <tr>
                <td>Dense retrieval</td>
                <td>
                  Embeddings over {corpus.chunkCount} passages, compared by cosine
                  similarity. Vectors are stored unit-normalised, so similarity is a
                  dot product computed in process.
                </td>
              </tr>
              <tr>
                <td>Keyword retrieval</td>
                <td>
                  BM25 over the same passages using SQLite FTS5. This catches exact
                  clinical terms that embeddings blur.
                </td>
              </tr>
              <tr>
                <td>Fusion</td>
                <td>
                  Reciprocal rank fusion with k = {RETRIEVAL.rrfK}. Both rankers
                  contribute independently, so neither can dominate and a missing
                  ranker degrades gracefully.
                </td>
              </tr>
              <tr>
                <td>Relevance gate</td>
                <td>
                  The best cosine similarity must reach{" "}
                  <code className="mono">{RETRIEVAL.minCosine}</code> before any
                  generation happens. Below that, the system abstains.
                </td>
              </tr>
              <tr>
                <td>Generation</td>
                <td>
                  Up to {RETRIEVAL.finalTopK} passages are numbered and passed to the
                  language model with a system instruction that permits citing only
                  those labels.
                </td>
              </tr>
              <tr>
                <td>Citation validation</td>
                <td>
                  Every citation marker in the output is checked against the evidence
                  list. Markers that do not resolve are removed before display and
                  counted as unsupported citations.
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className="stack">
          <h2 id="hybrid">Why hybrid retrieval instead of vectors alone</h2>
          <p>
            Dense retrieval matches paraphrases, which matters because members of the
            public rarely use clinical wording. It is weaker at exact terms such as
            drug names, abbreviations, and the numbers in a threshold. BM25 handles
            those precisely. Running both and fusing the rankings removes the need to
            choose, and the fused ordering is stable when one ranker returns nothing.
          </p>
          <p>
            Search over the corpus is exact rather than approximate. For a corpus of
            this size an exact scan is fast, deterministic, and straightforward to
            reason about, which makes evaluation results reproducible. The storage
            layer exposes a single interface so a vector index can be substituted
            without changing the retrieval code.
          </p>
        </section>

        <section className="stack">
          <h2 id="safety">Safety design</h2>
          <ul style={{ paddingLeft: "var(--space-5)" }}>
            <li>
              A deterministic rule set screens every question and every guidance
              submission for emergency warning signs before retrieval runs. It uses
              no model, so it cannot be talked out of firing.
            </li>
            <li>
              When it fires, the request ends there. No clarifying question is asked
              and no generation latency is incurred, because delaying emergency
              guidance is the worst failure available to this system.
            </li>
            <li>
              Care levels in symptom guidance are computed from fixed thresholds over
              the values entered. The language model explains retrieved material and
              never decides the care level.
            </li>
            <li>
              Retrieved passages are presented to the model as reference material
              inside a delimited block, with an explicit instruction that content
              inside it is data rather than instruction.
            </li>
            <li>
              The system never estimates a probability and never produces a
              medication dose.
            </li>
            <li>
              Personalisation is subject to the same rule. The profile selects published
              material by topic; it cannot change a care level, and neither the symptom
              guidance nor the emergency screen reads it at all.
            </li>
          </ul>
        </section>

        <section className="stack">
          <h2 id="personalisation">Personalisation, and what it is allowed to read</h2>
          <p>
            The profile, the dashboard and the podcast catalogue rest on one rule: a
            suggestion has to be traceable to something the person supplied, and the page
            has to say what that was. Every recommendation on the dashboard therefore
            prints the inputs it used — the reading you recorded, the goal you set, the
            interest you selected, the material you saved — and the page is rendered on the
            server from the same rows shown above it, so a suggestion and the evidence
            behind it cannot disagree.
          </p>
          <p>
            Those rules are a pure function over your own profile, your own records, the
            source library and the catalogue, which is what makes them testable and what
            stops them reading a table of their own. Nothing in them diagnoses, predicts or
            prescribes. The strongest statement available is that a recorded reading is at a
            level the cited guidance describes as needing attention; a goal you set is
            compared only against your own recordings and is labelled as your goal rather
            than a clinical target; and a symptom you rated 7 or above is described as your
            own rating on your own scale. The threshold applied to a recorded blood pressure
            reading is imported from the same module the symptom guidance uses, so the two
            surfaces cannot end up disagreeing about what a threshold is. Only the
            identifier of a dismissed or completed suggestion is stored: the wording is
            recomputed from your current data on every visit, so a suggestion that has
            stopped being true cannot be replayed back to you.
          </p>
          <p>
            The catalogue makes a different kind of claim, so it is checked differently.
            Each of the{" "}
            <code className="mono">{PODCAST_ENTRIES.length}</code> entries was added from
            the publisher&apos;s own channel, reading the video id, title, channel name,
            upload date and duration from that video&apos;s own page, and{" "}
            <code className="mono">pnpm check:podcasts --live</code> re-reads all of them
            and fails on any drift, so a renamed or withdrawn video becomes a failing check
            rather than a card that opens the wrong thing. What a listing means is narrow:
            the publisher is a recognised health authority. It does not mean this project
            has clinically reviewed the episode, and the tab and every episode page say so.
          </p>
        </section>

        <section className="stack">
          <h2 id="evaluation">Measured evaluation results</h2>
          {report ? (
            <>
              <p className="meta">
                Generated {new Date(report.generatedAt).toISOString().replace("T", " ").slice(0, 16)}{" "}
                UTC · embeddings {report.embeddingProvider} · generation{" "}
                {report.generationModel} · corpus {report.corpus.documents} documents,{" "}
                {report.corpus.chunks} passages.
              </p>

              {unmeasured.size > 0 ? (
                <div className="notice notice--warning">
                  <p className="notice__title">
                    Some sections were not measured in the run that produced these
                    figures
                  </p>
                  <p style={{ marginBottom: "var(--space-2)" }}>
                    This report comes from a run that could not measure{" "}
                    {[...unmeasured].join(", ")}. Those values are shown below as
                    unmeasured rather than as zero, because a zero would read as a
                    result.
                  </p>
                  <p className="meta" style={{ margin: 0 }}>
                    Use of an embedding provider is metered, so a run that would test
                    retrieval is not always possible. The emergency screen needs no
                    provider and is measured with{" "}
                    <code className="mono">pnpm eval --safety-only</code>.
                  </p>
                </div>
              ) : null}

              <h3>Retrieval</h3>
              <table className="table table--numeric">
                <thead>
                  <tr>
                    <th scope="col">Metric</th>
                    <th scope="col">Value</th>
                    <th scope="col">Definition</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Precision@{report.retrieval.k}</td>
                    <td>{metric("retrieval", formatPercent(report.retrieval.precisionAtK))}</td>
                    <td>
                      Fraction of the top {report.retrieval.k} retrieved passages that
                      come from a document marked relevant for the question
                    </td>
                  </tr>
                  <tr>
                    <td>Recall@{report.retrieval.k}</td>
                    <td>{metric("retrieval", formatPercent(report.retrieval.recallAtK))}</td>
                    <td>Fraction of relevant documents represented in the top {report.retrieval.k}</td>
                  </tr>
                  <tr>
                    <td>Mean reciprocal rank</td>
                    <td>{metric("retrieval", report.retrieval.mrr.toFixed(3))}</td>
                    <td>Mean of 1 divided by the rank of the first relevant passage</td>
                  </tr>
                  <tr>
                    <td>Questions</td>
                    <td>{report.retrieval.questionCount}</td>
                    <td>In-corpus questions with documented relevant source documents</td>
                  </tr>
                </tbody>
              </table>

              <h3>Answer behaviour</h3>
              <table className="table table--numeric">
                <thead>
                  <tr>
                    <th scope="col">Metric</th>
                    <th scope="col">Value</th>
                    <th scope="col">Definition</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Citation correctness</td>
                    <td>{metric("assistant", formatPercent(report.assistant.citationCorrectness))}</td>
                    <td>
                      Share of answered questions where every citation resolved to a
                      retrieved passage
                    </td>
                  </tr>
                  <tr>
                    <td>Unsupported citation rate</td>
                    <td>{metric("assistant", formatPercent(report.assistant.unsupportedCitationRate))}</td>
                    <td>
                      Citations stripped per answer because they did not resolve to a
                      retrieved passage
                    </td>
                  </tr>
                  <tr>
                    <td>Uncited answers</td>
                    <td>{metric("assistant", report.assistant.uncitedAnswerCount)}</td>
                    <td>Answers produced with no verifiable citation at all</td>
                  </tr>
                  <tr>
                    <td>Answered / abstained</td>
                    <td>
                      {metric(
                        "assistant",
                        `${report.assistant.answeredCount} / ${report.assistant.abstainedCount}`,
                      )}
                    </td>
                    <td>Outcome split across the in-corpus question set</td>
                  </tr>
                  <tr>
                    <td>Abstention on out-of-scope questions</td>
                    <td>{metric("outOfScope", formatPercent(report.outOfScope.abstentionRate))}</td>
                    <td>
                      Share of{" "}
                      {report.outOfScope.questionCount -
                        (report.outOfScope.erroredCount ?? 0)}{" "}
                      questions outside the corpus that were correctly declined
                    </td>
                  </tr>
                  {(report.assistant.erroredCount ?? 0) +
                    (report.outOfScope.erroredCount ?? 0) >
                  0 ? (
                    <tr>
                      <td>Excluded as provider failures</td>
                      <td>
                        {(report.assistant.erroredCount ?? 0) +
                          (report.outOfScope.erroredCount ?? 0)}
                      </td>
                      <td>
                        Calls that failed at the provider. These are excluded from every
                        rate above rather than counted as abstentions, because a provider
                        outage is a missing measurement and not a behaviour of this system
                      </td>
                    </tr>
                  ) : null}
                  <tr>
                    <td>Warning-sign detection</td>
                    <td>
                      {formatPercent(report.safety.detectionRate)} ({report.safety.detected}
                      /{report.safety.cases})
                    </td>
                    <td>
                      Emergencies correctly intercepted, with a median response of{" "}
                      {report.safety.medianLatencyMs} ms
                    </td>
                  </tr>
                  <tr>
                    <td>End-to-end latency</td>
                    <td>
                      {metric(
                        "latency",
                        `p50 ${report.latencyMs.p50} ms, p95 ${report.latencyMs.p95} ms`,
                      )}
                    </td>
                    <td>Question received to validated answer returned</td>
                  </tr>
                </tbody>
              </table>

              <h3>Limitations of these results</h3>
              <ul style={{ paddingLeft: "var(--space-5)" }}>
                {report.limitations.map((limitation) => (
                  <li key={limitation}>{limitation}</li>
                ))}
              </ul>
            </>
          ) : (
            <div className="notice notice--warning">
              <p className="notice__title">The evaluation has not been run yet</p>
              <p style={{ marginBottom: "var(--space-3)" }}>
                Run <code className="mono">pnpm eval</code> in the website
                directory to produce <code className="mono">data/evaluation-report.json</code>.
                This page renders whatever that report contains and shows no
                numbers until it exists.
              </p>
              <p style={{ margin: 0 }}>
                Retrieval metrics require a real embedding provider. The evaluation
                script refuses to report numbers produced by the non-semantic test
                double.
              </p>
            </div>
          )}
        </section>

        <section className="stack">
          <h2 id="implemented">What is implemented, and what is not</h2>
          <div className="grid-2">
            <div className="card">
              <h3>Implemented</h3>
              <ul style={{ paddingLeft: "var(--space-5)", marginBottom: 0 }}>
                <li>Curated corpus ingestion with provenance and licence records</li>
                <li>Hybrid retrieval with reciprocal rank fusion</li>
                <li>Citation validation with unsupported citations stripped</li>
                <li>Explicit abstention when evidence is insufficient</li>
                <li>Deterministic emergency screen with an early exit</li>
                <li>Rule-based symptom guidance with corpus-linked warning signs</li>
                <li>Source library with per-document provenance records</li>
                <li>Evaluation harness producing measured metrics</li>
                <li>Accounts with server-side sessions and per-account data isolation</li>
                <li>Self-recorded health measurements with validation and trend charts</li>
                <li>
                  An emergency screen that runs before any other guidance question and
                  escalates without waiting for the network or a language model
                </li>
                <li>
                  Two rounds of clarifying questions in symptom guidance: the first
                  chosen from the symptoms selected and the second from the answer you
                  gave, where a yes-answer can raise the care level, a no and an
                  &ldquo;I do not know&rdquo; can lower nothing, and the pathway is recorded
                </li>
                <li>
                  A governance record for source reviews: a named reviewer, their stated
                  credential, the date, and the content revision the decision covers
                </li>
                <li>
                  A podcast and video catalogue from named health authorities, with every
                  entry verified against the publisher&apos;s own video page
                </li>
                <li>
                  A profile of closed vocabularies, where an interest or a goal selects
                  real library documents and real episodes rather than producing a label
                  that goes nowhere
                </li>
                <li>
                  Next steps derived from your own data, each stating the inputs it used,
                  each of which can be dismissed or marked done
                </li>
                <li>
                  A personal dashboard over your own recorded numbers, with the goals you
                  set shown beside them and no interpretation added
                </li>
                <li>
                  Personal data export as a PDF for reading, with the JSON document kept
                  beside it for processing
                </li>
              </ul>
            </div>
            <div className="card">
              <h3>Not implemented</h3>
              <ul style={{ paddingLeft: "var(--space-5)", marginBottom: 0 }}>
                <li>Medication reminders</li>
                <li>Healthcare facility discovery</li>
                <li>Treatment cost information</li>
                <li>
                  Audio-only content, and any player other than the publisher&apos;s own
                  embed: episodes are streamed from YouTube, so watching one is subject to
                  YouTube&apos;s terms rather than this platform&apos;s
                </li>
                <li>
                  Any clinical review of a catalogue episode, and any episode for a topic
                  no authority has published one on: the catalogue records the publisher and
                  leaves the gap visible
                </li>
                <li>
                  A third round of clarifying questions, where a second answer would
                  choose the next question, and first-round questions for the symptoms
                  that currently have none
                </li>
                <li>
                  Any source that has actually been reviewed: the corpus holds 37
                  documents and not one has a review recorded
                </li>
                <li>Any form of clinical validation, of any document or of this platform</li>
              </ul>
            </div>
          </div>
          <p className="meta" style={{ marginBottom: 0 }}>
            The items under &ldquo;implemented&rdquo; have been exercised end to end, not
            merely written: the account and record endpoints are covered by integration
            checks against a running server, and the offline checks cover the parts that
            must not depend on a model. The items under &ldquo;not implemented&rdquo; are
            genuinely absent, and `docs/architecture.md` describes them as future work.
          </p>
        </section>

        <section className="stack">
          <h2 id="context">Academic context</h2>
          <p>
            This platform began from the open-source UltimateHealth repository. The
            architecture report documents what that project already provides and what
            was built here: it already ships community-authored articles, podcasts,
            moderation workflows, and a persona-based chat over a language model, and
            it contains no retrieval, no embeddings, and no citation mechanism
            anywhere in its code. The contribution of this project is the evaluated,
            source-grounded layer described on this page.
          </p>
        </section>
          </div>

          <aside className="aside-stack">
            <nav className="panel" aria-label="On this page">
              <p className="kicker">On this page</p>
              <ul className="list-plain stack-tight" style={{ marginTop: "var(--space-3)" }}>
                <li>
                  <a href="#pipeline">The retrieval pipeline</a>
                </li>
                <li>
                  <a href="#hybrid">Why hybrid retrieval</a>
                </li>
                <li>
                  <a href="#safety">Safety design</a>
                </li>
                <li>
                  <a href="#personalisation">Personalisation</a>
                </li>
                <li>
                  <a href="#evaluation">Measured evaluation results</a>
                </li>
                <li>
                  <a href="#implemented">Implemented and not implemented</a>
                </li>
                <li>
                  <a href="#context">Academic context</a>
                </li>
              </ul>
            </nav>

            <div className="card card--flat">
              <p className="kicker">Related</p>
              <ul className="list-plain stack-tight" style={{ marginTop: "var(--space-3)" }}>
                <li>
                  <a href="/library">Browse the cited corpus</a>
                </li>
                <li>
                  <a href="/assistant">Ask a cited question</a>
                </li>
                <li>
                  <a href="/guidance">Symptom guidance</a>
                </li>
              </ul>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
