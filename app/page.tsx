import Link from "next/link";
import { connection } from "next/server";

import { getCorpusSummary } from "@/lib/corpus-summary";
import { RETRIEVAL } from "@/lib/config";

export const instant = false;

export default async function HomePage() {
  // better-sqlite3 is synchronous, so its queries complete during prerendering
  // unless rendering is explicitly deferred to request time.
  await connection();
  const corpus = getCorpusSummary();

  const publisherSummary =
    corpus.publishers.length <= 3
      ? corpus.publishers.join(", ")
      : `${corpus.publishers.slice(0, 3).join(", ")} and ${corpus.publishers.length - 3} more`;

  return (
    <>
      <section className="hero">
        <div className="container hero__grid">
          <div className="hero__copy">
            <p className="eyebrow">Source-grounded health information</p>
            <h1 className="hero__title">
              Health information you can <em>trace back</em> to its source.
            </h1>
            <p className="hero__lede">
              Every answer is assembled from a fixed, published corpus of public health
              guidance. Each claim carries a citation to the passage it came from, and a
              question the corpus does not cover is declined rather than guessed at.
            </p>
            <div className="hero__actions">
              <Link className="btn btn--primary btn--link" href="/assistant">
                Ask a health question
              </Link>
              <Link className="btn" href="/guidance">
                Check symptoms and warning signs
              </Link>
            </div>
            <ul className="hero__assurances">
              <li>Every claim cited</li>
              <li>Declines when the evidence is thin</li>
              <li>No diagnosis, no doses</li>
            </ul>
          </div>

          {/*
            A specimen, not a live answer: it shows the shape of the output - a
            claim with a marker that resolves to a passage - before the reader has
            asked anything. It is labelled as illustrative so it cannot be mistaken
            for a response to their question.
          */}
          <aside className="specimen" aria-label="How an answer is assembled">
            <div className="specimen__head">
              <span className="specimen__label">How one answer is assembled</span>
              <span className="tag tag--accent">
                {corpus.isEmpty ? "Corpus not ingested" : `${corpus.chunkCount} passages`}
              </span>
            </div>

            <p className="specimen__query">
              <span>Q</span>
              Does high blood pressure usually cause symptoms?
            </p>

            <ol className="specimen__steps">
              <li>
                <span className="step-index">01</span>
                <strong>Emergency screen</strong>
                <span className="mono">fixed rules</span>
              </li>
              <li>
                <span className="step-index">02</span>
                <strong>Vector and keyword retrieval</strong>
                <span className="mono">hybrid</span>
              </li>
              <li>
                <span className="step-index">03</span>
                <strong>Rank fusion and relevance gate</strong>
                <span className="mono">cosine ≥ {RETRIEVAL.minCosine}</span>
              </li>
              <li>
                <span className="step-index">04</span>
                <strong>Answer written from cited passages</strong>
                <span className="mono">validated</span>
              </li>
            </ol>

            <div className="specimen__answer">
              <p>
                Each sentence of the answer is written only from the retrieved
                passages, and every claim carries a marker that resolves to one of
                them.<span className="cite">[S1]</span>
              </p>
            </div>

            <div className="specimen__foot">
              <span className="specimen__sources" aria-hidden="true">
                <span>S1</span>
                <span>S2</span>
                <span>+3</span>
              </span>
              <span>Illustrative shape of an answer</span>
            </div>
            <p className="specimen__note">
              Markers resolve to the retrieved passage, its publisher and its licence.
              The assistant shows the same evidence list with every live answer.
            </p>
          </aside>
        </div>
      </section>

      <section className="stats-band" aria-labelledby="corpus-heading">
        <div className="container">
          <div className="stats-band__head">
            <div>
              <p className="eyebrow">The corpus, read from the index</p>
              <h2 id="corpus-heading">What can be searched right now</h2>
            </div>
            <p>
              These figures come from the retrieval database rather than from copy on
              this page, so they describe the corpus the assistant can actually reach.
            </p>
          </div>

          <div className="stat-row">
            <div className="stat">
              <span className="stat__value">{corpus.documentCount}</span>
              <span className="stat__label">source documents</span>
            </div>
            <div className="stat">
              <span className="stat__value">{corpus.chunkCount}</span>
              <span className="stat__label">indexed passages</span>
            </div>
            <div className="stat">
              <span className="stat__value">{corpus.publisherCount}</span>
              <span className="stat__label">publishers</span>
            </div>
            <div className="stat">
              <span className="stat__value">{corpus.licenceCount}</span>
              <span className="stat__label">distinct licences</span>
            </div>
          </div>

          <div className="stats-band__foot">
            {corpus.isEmpty ? (
              <span>
                The corpus has not been ingested yet. Run <code>pnpm ingest</code> in the
                website directory. Until then the assistant declines every question.
              </span>
            ) : (
              <span>
                Published by {publisherSummary}. Retrieval backend:{" "}
                <span className="mono">{corpus.backend}</span> — SQLite storage with
                an FTS5 keyword index and stored embeddings; ranking combines an
                exact vector scan with BM25 keyword search, fused by reciprocal rank
                fusion. The full inventory is downloadable from the{" "}
                <Link href="/library">source library</Link>.
              </span>
            )}
            <Link href="/method">Read the method and its limits →</Link>
          </div>
        </div>
      </section>

      <section className="section section--tight section--flush" aria-labelledby="entry-heading">
        <div className="container">
          <div className="section-head">
            <div className="section-head__text">
              <p className="eyebrow">Three ways in</p>
              <h2 id="entry-heading">Start where you are</h2>
            </div>
            <p>
              Every one of these works without an account. An account exists only to
              keep measurements you record yourself.
            </p>
          </div>

          <div className="entry-grid">
            <Link className="entry" href="/assistant">
              <span className="entry__index">01 / Ask</span>
              <h3>Ask a question</h3>
              <p>
                Put a health question in plain language. The assistant retrieves
                passages, answers only from them, and shows the evidence beside the
                answer.
              </p>
              <span className="entry__more">Open the assistant →</span>
            </Link>
            <Link className="entry" href="/guidance">
              <span className="entry__index">02 / Check</span>
              <h3>Check symptoms</h3>
              <p>
                A short structured check for raised blood pressure that screens for
                emergency warning signs before it asks anything else, with the sources
                behind each statement.
              </p>
              <span className="entry__more">Open symptom guidance →</span>
            </Link>
            <Link className="entry" href="/library">
              <span className="entry__index">03 / Read</span>
              <h3>Browse the sources</h3>
              <p>
                Read the documents the assistant is allowed to use, with publisher,
                licence, retrieval date and review status for every entry.
              </p>
              <span className="entry__more">Open the source library →</span>
            </Link>
          </div>
        </div>
      </section>

      {corpus.topics.length > 0 ? (
        <section className="section" aria-labelledby="topics-heading">
          <div className="container">
            <div className="section-head">
              <div className="section-head__text">
                <p className="eyebrow">Coverage</p>
                <h2 id="topics-heading">What the corpus covers</h2>
                <p>
                  Topics are counted from the indexed documents. A topic with few
                  documents supports fewer claims; the assistant has no other source to
                  fall back on.
                </p>
              </div>
              <Link className="btn btn--small" href="/library">
                All {corpus.documentCount} documents
              </Link>
            </div>

            <ul className="topic-grid">
              {corpus.topics.map((topic) => (
                <li key={topic.topic}>
                  <Link className="topic-tile" href={`/library?topic=${topic.topic}`}>
                    <span>{topic.label}</span>
                    <span className="topic-tile__count">
                      {topic.documentCount} {topic.documentCount === 1 ? "doc" : "docs"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      <section className="section" aria-labelledby="method-heading">
        <div className="container editorial">
          <div>
            <p className="eyebrow">Design position</p>
            <h2 id="method-heading">Built to decline, not to improvise</h2>
            <p className="lede" style={{ marginTop: "var(--space-4)" }}>
              A system that always produces an answer is not grounding itself in
              anything. Three deliberate constraints make abstention the honest outcome
              rather than a failure.
            </p>
            <p>
              Retrieval runs two independent rankers over the same passages, one
              comparing meaning and one matching exact clinical terms, then fuses their
              rankings. Only passages that clear a relevance threshold are passed to the
              model, and the model may cite only what it was given. After generation the
              answer is checked against the evidence list: any marker that does not
              resolve to a retrieved passage is stripped before you see it.
            </p>
            <div className="row" style={{ marginTop: "var(--space-5)" }}>
              <Link className="btn btn--small" href="/method">
                How it works, and what it cannot do
              </Link>
            </div>
          </div>

          <ul className="principles">
            <li>
              <span className="principles__mark">01</span>
              <div>
                <h3>A relevance floor</h3>
                <p>
                  A passage below{" "}
                  <span className="mono">{RETRIEVAL.minCosine}</span> cosine similarity is
                  not treated as evidence. The threshold was calibrated against the
                  evaluation set rather than chosen in advance.
                </p>
              </div>
            </li>
            <li>
              <span className="principles__mark">02</span>
              <div>
                <h3>Citations validated after writing</h3>
                <p>
                  Every marker is checked against the passages the model received.
                  Unsupported markers are removed and the number removed is recorded, so
                  a confident-looking citation cannot survive on its own.
                </p>
              </div>
            </li>
            <li>
              <span className="principles__mark">03</span>
              <div>
                <h3>Safety before generation</h3>
                <p>
                  Emergency warning signs are screened by a fixed rule set that runs
                  before retrieval and produces urgent instructions without a model call.
                </p>
              </div>
            </li>
          </ul>
        </div>
      </section>

      <section className="section section--inverse" aria-labelledby="emergency-heading">
        <div className="container emergency-band">
          <div>
            <p className="eyebrow">Emergency care</p>
            <h2 id="emergency-heading">
              If something is happening now, do not wait for a software answer.
            </h2>
            <p style={{ marginTop: "var(--space-4)" }}>
              The symptom guidance page screens for emergency warning signs first, using
              fixed rules rather than a language model, so it works even when the
              assistant does not.
            </p>
            <div className="row" style={{ marginTop: "var(--space-5)" }}>
              <Link className="btn btn--primary" href="/guidance">
                Open symptom guidance
              </Link>
            </div>
          </div>

          <div className="notice">
            <p className="notice__title">For chest pain, breathlessness or stroke signs</p>
            <p>
              Contact your local emergency number or go to the nearest emergency
              department. Do not complete a form or wait for an answer here first.
            </p>
            <p className="meta" style={{ marginBottom: 0 }}>
              This platform is not a medical device and has not been clinically
              validated.
            </p>
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="limits-heading">
        <div className="container">
          <div className="section-head">
            <div className="section-head__text">
              <p className="eyebrow">Scope</p>
              <h2 id="limits-heading">What this platform does not do</h2>
              <p>
                Stating the limits plainly is part of the design, not a disclaimer
                buried at the bottom of a page.
              </p>
            </div>
          </div>

          <ul className="limits">
            <li>
              It does not diagnose any condition and does not tell you that you do or do
              not have one.
            </li>
            <li>
              It does not estimate the probability that a symptom indicates a condition.
            </li>
            <li>
              It does not give medication doses or advise starting, stopping, or changing
              a prescribed medicine.
            </li>
            <li>
              It does not provide appointment booking, test ordering, or clinician access.
            </li>
            <li>
              It does not integrate with wearables, medical devices, or personal health
              records. Nothing here is device-validated data.
            </li>
            <li>
              It has not been clinically validated, and it is not a medical device.
            </li>
          </ul>
        </div>
      </section>

      <section className="section" aria-labelledby="closing-heading">
        <div className="container">
          <div className="cta-band">
            <div>
              <p className="eyebrow">Begin</p>
              <h2 id="closing-heading">Ask something you would otherwise search for.</h2>
              <p>
                You will get an answer with its passages, a confidence band from
                retrieval similarity, and an explicit decline when the corpus has nothing
                relevant to say.
              </p>
            </div>
            <div className="cta-band__actions">
              <Link className="btn btn--primary btn--link" href="/assistant">
                Ask the assistant
              </Link>
              <Link className="btn" href="/library">
                Read the corpus
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
