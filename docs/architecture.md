# Architecture and existing-system analysis

This document records what the upstream project already provides, what was built here, and
the reasoning behind the design decisions. Everything asserted about the upstream code was
read from a local clone; nothing is inferred from the README alone unless it is labelled as
unverified.

## 1. Existing system audit

### 1.1 Repositories examined

| Repository | What it is | Licence |
| --- | --- | --- |
| `SB2318/UltimateHealth` | Upstream. React Native (Expo) mobile application, plus documentation and GitHub automation. | MIT |
| `SB2318/ultimatehealth-backend` | Node.js, Express and MongoDB REST API | — |
| `Omkar482185/UltimateHealth` | The project fork, which is the base for this work | MIT |

Upstream was at commit `main` with the last push on 2026-10-09, 67 stars, 464 forks and 175
open issues at the time of the audit. The fork's last push was 2026-10-06.

The upstream README describes a Next.js web frontend on a `web` branch, and separate
repositories for an admin panel and a Python content-intelligence service. The branch list
was truncated during retrieval, so **the existence and state of that `web` branch is
unverified**. The only git submodule configured in the fork is
`ieee-submodules/IEEE-s-Mindful-Devs-Bootcamp`, which is unrelated to the product.

### 1.2 What the upstream backend actually implements

Read from `SB2318/ultimatehealth-backend`:

**AI chat is real, and it has no retrieval.** `controllers/aiChatController.js` persists
conversations and messages, then calls `generateWithKeyRotation` in
`services/geminiService.js`, which uses `gemini-2.5-flash` and rotates across
`GEMINI_API_KEY_1` to `GEMINI_API_KEY_4` behind a circuit breaker. Four persona system
prompts are defined (general, fitness coach, nutritionist, mental wellness). There is a
separate Perplexity path using `sonar-pro`. A quota of five model messages per persona per
day is enforced per user. Nothing in this path retrieves a document, and no response
carries a citation.

**The wellness module is more capable than the README suggests.** `controllers/wellnessController.js`
has `WellnessLog` and `WellnessPlan` models and generates a strict-JSON seven-day plan from
logged steps, water intake, sleep, active minutes, calories and breathing minutes. The
prompt encodes WHO, CDC and ACSM thresholds and a rule that no goal may rise more than 15%
above the user's seven-day average.

**There is no retrieval, embedding or vector search anywhere.** A search across the whole
backend for `embedding|vector|semantic|retriev|pinecone|pgvector|similarity|cosine`
returned 47 matches, every one of which was the English word "retrieved" inside Swagger
documentation comments. There is no embedding model, no chunking, no index, and no citation
mechanism.

**The rest is a publishing platform.** Articles, podcasts and episodes, comments, reviews,
moderation and edit requests, role-based access control for reviewers and admins,
multilingual translation endpoints, glossary terms, notifications, analytics, and a
plagiarism and grammar checking service. Guest read access is deliberately enabled: routes
for `/api/articles` and `/api/articles/:id` carry comments saying authentication was removed
so unauthenticated visitors can read.

**Dependencies indicate accumulated complexity:** Express, Mongoose, Redis, Kafka, Firebase
Admin, AWS S3, Socket.IO, Prisma *and* Mongoose simultaneously, Puppeteer, and a Firebase
client library in the server package. Two ORMs in one backend is the clearest single
indicator of technical debt.

A live probe confirmed `GET https://ultimatehealth.blog/api/articles` returns 200 with JSON,
while `/api/article/all` returns 404.

### 1.3 What the upstream mobile client implements

From `frontend/package.json` and the screen tree: Expo SDK 57, Tamagui, Redux Toolkit,
TanStack Query, Firebase messaging, Sentry, `react-native-chart-kit`, `expo-audio`,
`expo-location`, `expo-secure-store`. Screens include `ai/ChatbotScreen.tsx`,
`ai/PersonaLobbyScreen.tsx`, and a wellness area with `ManualLogCard.tsx`,
`WearableSyncCard.tsx` and `WeeklyChart.tsx`.

**Unverified:** whether the wearable sync path performs a real device integration or
presents prepared data. This was not traced, and no claim is made either way.

### 1.4 What was not verified

- The upstream test suite was not executed, so its "456 tests across 130 suites" claim is
  reported as a claim, not a result.
- Neither the mobile application nor the upstream backend was run locally. The backend
  requires MongoDB, Redis, Kafka and Firebase credentials.
- The upstream `web` branch was not inspected.

## 2. Feature gap analysis

| Area | Upstream (verified) | This project |
| --- | --- | --- |
| Content model | Community-authored articles, moderated and translated | Curated third-party sources with provenance, licence and content hash |
| Question answering | Persona prompt over a language model, no evidence | Hybrid retrieval over a fixed corpus, citations validated after generation |
| Evidence | None | Passages displayed with publisher, section, similarity and licence |
| Refusal behaviour | None implemented | Explicit abstention on empty retrieval, low similarity, or model-reported insufficiency |
| Emergency handling | None | Deterministic screen that short-circuits before retrieval |
| Health tracking | Habit metrics with a generated plan | Self-recorded measurements across seven kinds, validated and charted on the user's own values, with no generated plan |
| Symptom guidance | Absent | Rule-based care levels with corpus-linked warning signs |
| Learning material | Community-authored articles, podcasts and episodes, moderated and translated | Curated catalogue of episodes published by named health authorities, each entry verified against the publisher's own video page, with no claim of clinical review |
| Personalisation | Persona prompt plus habit metrics with a generated plan | A profile of closed vocabularies that selects real documents and episodes, where every suggestion states the inputs it used and no plan is generated |
| Personal data export | Not implemented | A formatted PDF and the JSON document, both generated from the session's own account and never written to disk |
| Evaluation | No retrieval or answer-quality measurement | Measured retrieval, citation, abstention, safety and latency metrics |
| Multi-tenancy | Accounts, roles, moderation | Per-account sessions and records with no roles and no administrative view; every query filters on the account from the session cookie |

The consequence for the project's claim of originality is direct: retrieval, citation
verification and evaluation are absent upstream, so the contribution of this work is the
grounded layer rather than a re-skin of existing functionality.

## 3. System architecture

```
Browser
  Next.js App Router pages, one design system, server components for data
        |
        v
Next.js server (single process, modular monolith)
  |
  +-- Request guards: same-origin check, in-process rate limit, Zod validation
  |
  +-- Feature modules
  |     library      browse, filter, document detail, provenance records
  |     assistant    question to cited answer
  |     guidance     structured intake to care level plus explanation
  |     podcasts     catalogue, filters, profile-driven suggestions
  |     dashboard    own numbers, goals, saved material, next steps
  |     account      profile, records, saved material, export
  |     method       renders the generated evaluation report
  |
  +-- Shared retrieval layer
  |     ingest      fetch, extract, chunk, embed, store
  |     retrieve    vector search + BM25 + reciprocal rank fusion
  |     safety      deterministic emergency rules
  |     triage      deterministic care-level thresholds
  |     generate    prompt assembly, generation, citation validation
  |
  +-- KnowledgeStore interface
        SQLite implementation, exact search over normalised Float32 vectors
        (a pgvector implementation can be substituted without touching callers)
        |
        v
      data/health.db   documents, chunks, FTS5 index, retrieval log
        |
        +-- external: Google Generative Language API (embeddings and generation)
```

### 3.1 Why a modular monolith

One process, one schema, one deployment. The retrieval and safety layers sit outside every
feature module so that the assistant and the symptom guidance share a single retrieval path
and a single emergency screen. That shared path is what makes the evaluation meaningful:
the measured retrieval quality applies to both surfaces, not to one demonstration.

### 3.2 Why these replacement decisions were made

The upstream stack was assessed and deliberately not extended for this work: MongoDB with
Atlas Vector Search is cloud-only, which would prevent offline evaluation, and the backend
requires Redis, Kafka and Firebase to start. A separate, self-contained service keeps the
upstream project untouched and keeps the whole system reproducible on a laptop with no
container runtime.

Search is exact rather than approximate. For a corpus of a few hundred to a few thousand
passages, an exact scan is fast, deterministic and simple to reason about, and it removes
an entire class of recall questions from the evaluation. The `KnowledgeStore` interface in
`lib/db/store.ts` isolates the choice so it can be revisited.

### 3.3 Framework constraints encountered

Next.js 16 with Cache Components enabled forbids the `dynamic` and `runtime` route segment
configurations. Two consequences are visible in the code:

- Routes that read the database use `export const instant = false` and call `connection()`
  before querying, because `better-sqlite3` is synchronous and would otherwise complete
  during prerendering and freeze the corpus statistics into the build output.
- Pages with no database access are prerendered statically, which is correct for the
  policies and the guidance form.

### 3.4 Interface consistency

Every page renders through the one layout, so the header, the skip link, the single `main`
landmark and the footer are shared rather than re-declared per page. `NavLink` is the only
place that decides whether a link points at the page being viewed, and both the header and
the footer use it, so the rule cannot drift between them. Two consequences are deliberate:
the wordmark carries the current-page marker on `/`, because the navigation has no separate
Home entry; and the policy pages carry it on their footer link, which is the only place they
appear. Matching the home route exactly matters, since every path begins with `/` and a
prefix match would mark Home as current everywhere.

`pnpm check:ui` asserts these properties against the served documents rather than against the
components: one `h1` per page, no heading level skipped, the navigation identical and in the
same order on every page, one current-page marker that points at the page being viewed,
an accessible name on every link and button, colours drawn from tokens rather than written as
literals, and no internal link that 404s. Because the HTML is parsed as served, anything the
framework injects is covered too.

## 4. Database design

Single SQLite database at `data/health.db`, created on first connection. Schema in
`lib/db/schema.ts`.

| Table | Purpose | Key columns |
| --- | --- | --- |
| `documents` | One row per curated source | `source_id` (unique), `topic`, `title`, `publisher`, `source_url`, `licence`, `licence_url`, `retrieved_at`, `content_sha256`, `word_count` |
| `chunks` | One row per indexed passage | `document_id` (FK, cascade delete), `ordinal`, `heading`, `text`, `char_count`, `embedding` (BLOB), `embedding_model`, `embedding_dim`; unique on `(document_id, ordinal)` |
| `chunks_fts` | FTS5 virtual table over `chunks.text` | `tokenize='porter unicode61'`; kept in sync by insert, update and delete triggers |
| `retrieval_log` | Interaction audit trail for evaluation | `question`, `answer_mode`, `chunk_ids`, `top_cosine`, `latency_ms`, `citation_count`, `stripped_citations` |
| `meta` | Reserved for schema bookkeeping | `key`, `value` |
| `users` | One row per account | `email` (unique), `password_hash`, `password_algo` |
| `sessions` | Server-side sessions | `token_hash` (primary key), `user_id` (FK, cascade delete), `expires_at` |
| `profiles` | One row per account | `user_id` (primary key, FK, cascade delete), `display_name`, `birth_year`, `sex_at_birth`, `height_cm`, `consent_version`, `consent_at`, plus the profile extension: `interests`, `goals`, `self_reported_conditions` (JSON arrays of ids from closed vocabularies), `sleep_goal_hours`, `activity_goal_minutes`, `preferred_language` |
| `health_records` | Measurements a person entered | `user_id` (FK, cascade delete), `kind`, `value_primary`, `value_secondary`, `unit`, `measured_at`, `note`, `source` (always `self-reported`) |
| `saved_resources` | Learning material a person kept | `user_id` (FK, cascade delete), `kind` (`podcast` or `library-document`), `ref_id`, `saved_at`; unique on `(user_id, kind, ref_id)` |
| `recommendation_state` | Suggestions dismissed or completed | `user_id` (FK, cascade delete), `rec_key`, `state` (`dismissed` or `done`), `updated_at`; unique on `(user_id, rec_key)` |

The last two tables store a reference and a key rather than a copy of the content. A saved
item's title and URL are resolved from this platform's own catalogues on read, so a caller
cannot store a link of their choosing and a catalogue correction reaches the saved list; a
recommendation's text is recomputed from current data on every visit, so a suggestion that has
stopped being true cannot be revived by restoring a stored string. The profile extension is
applied to an existing database by `applySchemaMigrations`, which adds each column only when
it is genuinely absent and never rewrites or drops a row.

The tables below `meta` are the account and health tables. They are deliberately
kept apart from the corpus: nothing in them is ever read by the retrieval or generation
path, so a measurement cannot be pulled into a model prompt. Every statement that touches
them filters on `user_id`, and the update and delete statements match `id AND user_id`
together, so another account's row is *not found* rather than *forbidden* — the response
cannot be used to confirm that a row exists.

Design notes:

- Embeddings are stored **unit-normalised** as little-endian Float32, so cosine similarity
  reduces to a dot product and no per-query normalisation is needed.
- `content_sha256` over the extracted text is what makes ingestion idempotent, and it is
  displayed on every document page so a reader can confirm which revision is indexed.
- `retrieval_log` deliberately stores **no identifier of any kind**: no IP address, no
  session, no user agent, and no account id, even though accounts now exist. A question
  asked while signed in is therefore not attributable to the account, and it does not appear
  in a data export. This is stated on the privacy page and matches the code.
- Chunk text overlaps by design (`CHUNK.overlapChars`), and the overlap is removed at
  display time by `lib/rag/stitch.ts` rather than being stored twice.

## 5. API

The endpoints fall into two groups. The public ones (`/api/assistant`, `/api/guidance`) need
no account, because they serve general health information and hold nothing personal. The
account ones resolve the caller from the session cookie and never accept a user identifier
as input.

Every state-changing endpoint is same-origin only and validates its input with Zod, on top
of which the records endpoints apply domain validation before anything is written. Reads of
personal data are served `Cache-Control: no-store`, because a cached response to a
authenticated request is how one account's data reaches another browser.

### `POST /api/assistant`

Request: `{ "question": string (4-500 chars), "topic"?: string }`

Response `200`: an `AnswerResult` with `mode` of `answered`, `abstained`, `uncited` or
`emergency`, plus `citations`, `strippedCitations`, `confidence`, `notice`, `emergency`,
`emergencySources` and a `retrieval` summary.

| Status | Condition |
| --- | --- |
| 400 | Body is not JSON, or validation fails |
| 403 | Cross-origin request |
| 429 | More than 12 questions per minute from one client, or the provider reported quota or rate limits |
| 500 | Unhandled error |
| 502 | The provider rejected the key, or the configured model is not available to it |
| 503 | The key is not configured, or the stored corpus was built with a different embedding model |

Provider failures carry a `kind` (`missing-key`, `invalid-key`, `model-unavailable`,
`quota-exhausted`, `rate-limited`, `network`, `corpus-mismatch`) alongside the message. The
assistant uses it to show a specific heading instead of a generic "request failed", and it
appears in the server log for diagnosis. Key material is never included in either.

### `POST /api/guidance`

Request: `{ "symptomIds": string[], "readingText"?: string, "duration"?: string, "notes"?: string }`

`symptomIds` must come from the fixed list in `lib/rag/guidance-content.ts`. At least one
symptom or a reading is required.

Response `200`: a `GuidanceResult` with a rule-derived `careLevel` (`emergency`,
`medical-review` or `monitor`), the `reasons` that produced it, linked `warningSigns`, an
optional grounded `explanation`, `followUpNotes`, `limitations` and a `retrieval` summary.

Status codes as above, with 15 submissions per minute per client.

### `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`

Register requires `{ email, password, acceptConsent: true }` and records which version of
the storage notice was accepted. Login answers the same 401 with the same message for an
unknown address and a wrong password, and always performs one scrypt verification either way
so that timing does not distinguish the two. Logout revokes the session row before clearing
the cookie. Passwords must be at least 12 characters and are rejected if they appear in a
short list of common ones.

### `GET`/`PUT /api/account/profile`, `GET`/`DELETE /api/account`

The profile endpoint reads and updates the signed-in account's profile. `PUT` treats an
absent field as "leave it alone", so a form that edits one field cannot clear the others.
`GET /api/account` returns everything held about the account as a downloaded JSON file, and
`DELETE` removes the account. Deletion requires the password again as well as a session, and
it revokes every session first, so a borrowed session cannot destroy an account on its own.

### `GET`/`POST`/`DELETE /api/account/saved`

Request (POST and DELETE): `{ kind: "podcast" | "library-document", refId: string }`. The
title and the URL are never accepted from the caller; they are resolved from the platform's own
catalogues on the server. A reference that is not in a catalogue is a `404` rather than a
stored row that can never be resolved, and saving the same item twice is idempotent because
the unique constraint makes the insert a no-op. `DELETE` filters on `user_id` in SQL, so
removing another account's row is not a permission that could be forgotten at a call site.

### `GET`/`POST`/`DELETE /api/account/recommendations`

Request (POST and DELETE): `{ key: string, state?: "dismissed" | "done" }`. The key is
validated for shape before it is stored, so a caller cannot grow the table with arbitrary text,
and no part of the recommendation itself is accepted from the client. `DELETE` clears the
state, which brings the recomputed suggestion back.

### `GET /api/account/export.pdf`

The primary personal-data download, and the one the account page offers first. The account is
resolved from the session cookie and the report is built in memory with `pdf-lib`; the response
is `application/pdf` with an attachment disposition naming a `.pdf` file, `Cache-Control:
no-store` and `X-Content-Type-Options: nosniff`. A rendering failure returns a `500` with an
honest message rather than a partial file, because a truncated download that looks valid is a
worse outcome than a visible error. The JSON export at `/api/account` remains available for
anyone who wants to process the data rather than read it.

### `GET`/`POST /api/records`, `PUT`/`DELETE /api/records/{id}`

Request (write): `{ kind, valuePrimary, valueSecondary?, measuredAt, note? }`. `kind` is one
of the seven in `lib/health/kinds.ts`; `valueSecondary` is required for blood pressure and
rejected for every other kind, and is enforced by the kind definition rather than by the
route. Values are checked against the kind's plausibility bounds and the reading is rejected
if the systolic is not above the diastolic. Response `201`/`200`: `{ record }`, which never
includes an owner id.

`GET` accepts `kind`, `from` and `to` and returns `{ records, trends }`, where the trends are
derived from exactly the rows the query selected. An unreadable `kind` or date is a `400`
rather than being ignored, so a filter that silently did nothing cannot look like a filter
that found nothing.

Status codes: `400` invalid input, `401` no session, `403` cross-origin, `404` the record does
not exist or belongs to another account, `429` more than 120 writes per minute, `500`
unhandled error.

## 6. Retrieval and generation design

### Provider integration

Two providers sit behind the pipeline, and they are deliberately separate.

**Embeddings** use Gemini. The client is constructed in `lib/gemini.ts`, which is the only
module that reads `GEMINI_API_KEY`. It uses the current `@google/genai` SDK: the older
`@google/generative-ai` package reached end of support on 30 November 2025, and the
previously configured embedding model `text-embedding-004` was shut down on 14 January 2026,
so either would fail with a valid key. The model is `gemini-embedding-001` at 768
dimensions with explicit retrieval task types, overridable through `EMBEDDING_MODEL` and
`EMBEDDING_DIM`.

**Generation** runs on a local Ollama model through `POST /api/chat`, implemented once in
`lib/ollama.ts`. The system instruction, the question and the numbered evidence are sent as
messages with `stream: false`; there is no API key and no hosted generation call. The model
(`OLLAMA_MODEL`, default `llama3.2:3b`), host (`OLLAMA_BASE_URL`) and whole-request deadline
(`OLLAMA_TIMEOUT_MS`) are configuration, not code. `pnpm verify:gemini` checks the embedding
key and the local model, and `pnpm check:ollama` exercises every provider failure mode with
an injected transport before making a real local call.

### Transient provider failures

Every **embedding** call goes through `withGeminiRetry`. Only failures that can succeed on a
second attempt are retried: HTTP 429 rate limits, exhausted per-minute quotas, and 503
`UNAVAILABLE` demand spikes. The delay honours the `retryDelay` the provider returns, then
falls back to exponential backoff, because the free tier enforces a per-minute request
quota that a fixed short delay would spin against. Configuration failures (rejected key,
unknown model, malformed request) are never retried: they cannot succeed, and retrying them
would turn a clear error into a slow one. Without this, embedding a 296-passage corpus on the
free tier fails partway and leaves the corpus in a mixed state.

Generation is not retried. A local model that failed has usually failed for a reason a
second identical request will not change, and the pipeline has a better response: it quotes
the retrieved passages instead of holding the connection open. The provider errors are typed
(`unreachable`, `timeout`, `model-unavailable`, `out-of-memory`, `empty-response`,
`bad-response`, `server-error`), so the reader sees a cause and an operator sees what to fix.

### Corpus comparability guard

Vectors from different models, or from the same model at a different width, are not
comparable. `findIncomparableVectors` compares the recorded `embedding_model` and
`embedding_dim` of the stored corpus with the provider in use, and `retrieve` throws a
`CorpusMismatchError` rather than perform the comparison. Without this, the store's
min-length dot product would silently truncate a mismatched vector and return plausible but
meaningless similarities. Ingestion performs the matching check in the other direction: a
document is only skipped when its text hash *and* its model *and* its dimension are all
unchanged, so a provider change rebuilds the corpus instead of leaving it stale.

The emergency pathway is unaffected by a stale corpus, because it is deterministic and
returns before retrieval runs.

### Ranking

Chunking is heading-aware: paragraphs are packed toward 1200 characters, capped at 1800,
with 200 characters of trailing context repeated. Two independent rankers run over the same
passages. Dense retrieval catches paraphrase; BM25 catches exact clinical terms, drug names
and numerals. Reciprocal rank fusion (`k = 60`) combines them, which needs no score
calibration between the two and degrades gracefully when one returns nothing.

### Evidence diversity, chosen by measurement rather than by taste

Fusion over roughly 24 candidates produces scores inside a very narrow band, so the six
passages nearest the cut-off are close to arbitrarily ordered. It showed: for "How is
chikungunya different from dengue?" the top six were four passages from one short Indian
page followed by two others, with the entire WHO dengue document below the cut. With no
dengue passage in its evidence, the model answered, correctly, that the evidence did not
cover the comparison. Honest, and useless to the reader.

Two candidate fixes were built and both were measured with `pnpm eval --retrieval-only`
against the 56-question set:

| Rule | Precision@5 | Recall@5 | MRR |
| --- | --- | --- | --- |
| None | 0.696 | 0.780 | 0.884 |
| Hard cap of 2 passages per document | 0.579 | 0.817 | — |
| Cap of 3 | 0.657 | 0.795 | — |
| Tie-break inside 5% of the best score | **0.700** | **0.796** | **0.887** |

The hard cap is the obvious fix and the measurement did not support it: it improves recall by
buying precision, and it penalises exactly the questions whose answer lives in a single
document, where it has nothing to diversify against. The shipped rule is the tie-break
(`RETRIEVAL.tieBand`): candidates within 5% of the best fusion score are treated as tied, and
inside that band a document with no passage yet is preferred over a repeat. It reorders only
what is already indistinguishable, so a decisive ranking is untouched, and it cannot discard
a passage in favour of an unrelated one. The cap remains as `RETRIEVAL.maxPerDocument`, off by
default, so both rules stay comparable without editing code.

Both rules are pure functions over the candidate pool (`applyDiversityRules`), asserted
directly in `pnpm verify` with no database and no provider.

The relevance gate runs **before** generation. If the best cosine similarity is below
`RETRIEVAL.minCosine`, generation never happens and the system abstains. This ordering is
deliberate: it is much easier to prevent a weakly-grounded answer than to detect one.

Prompt assembly numbers the passages, states that the material between the `EVIDENCE` and
`END EVIDENCE` markers is reference material and not instruction, and permits citations only
to the supplied labels. Generation runs on the local Ollama model at temperature 0.

After generation, every citation marker is matched against the evidence list. Labels that do
not resolve are removed from the visible text and counted. If no citation survives, the
answer is returned in `uncited` mode with a visible warning rather than being silently
presented as sourced.

## 7. Safety design

The emergency screen (`lib/rag/safety.ts`) is a fixed rule set over the question text, with
optional linking verbs so that natural phrasing such as "my face is drooping" matches. It
also parses blood pressure readings and fires at or above 180/120.

Two properties matter:

1. **It runs first.** An emergency is answered in about a millisecond, before retrieval and
   before generation, so urgent guidance never waits on a model call and no clarifying
   question is asked. On `/guidance` it is also literally the first step: the screen is
   presented as one yes/no question per rule, and the ordinary questions are not reachable
   until it has been passed.

   Escalation happens in the browser, from the same module. `lib/rag/safety.ts` imports
   nothing at all, so `screenForEmergency` and the fixed instruction steps can run on the
   client with no round trip: a warning sign produces the instructions even if the network
   is down, and the request that follows only attaches source citations. Reported ids are
   sent as rule ids and validated against the server's own table, so a modified client
   cannot skip the screen, and the server escalates on the declared id rather than
   re-deriving a match from the id's label. That distinction is load-bearing: the label
   "Possible stroke signs" contains none of the phrases its own patterns match, so
   re-matching the label would silently fail to escalate. `pnpm check:guidance` covers that
   case specifically.
2. **It is sensitive by design.** A false positive costs a reader a moment of alarm and a
   link to urgent care. A false negative is worse, so the rules are broad and the interface
   says so.

It is also **independent of every external service**, which is what makes it the thing to
test when the provider is unavailable: `pnpm eval --safety-only` measures all 28 cases with no
embedding call and no generation call. That path exists because the embedding provider's free
tier was exhausted during development and the deterministic guarantees had to remain
verifiable anyway.

Arboviral warning signs were added as two rules with different tolerances. Bleeding gums,
bleeding from the nose, and blood in vomit or stool escalate on their own, because bleeding is
never benign. Persistent vomiting, severe abdominal pain and nosebleeds escalate only when
the message also carries a febrile or mosquito-borne context, because on their own they are
common complaints and escalating them all would make the emergency path less useful rather
than safer. Severe joint pain alone does **not** escalate, even though it is the defining
feature of chikungunya.

### Care levels and the measurement threshold

Care levels in symptom guidance are computed by `lib/rag/triage.ts` from corpus-cited
thresholds. The model explains retrieved material; it never decides the level. When
retrieval or the model is unavailable, the care level, warning signs and limitations are
still returned, with a notice explaining what is missing.

The threshold applied to a reading depends on where it was taken. The NHS page gives 140/90
for a reading taken by a health professional and 135/85 at home, so the form asks for the
location and the result names the threshold it used. Previously every reading was compared
against 140/90, which made the guidance less sensitive than its own cited source for anyone
measuring at home. An unspecified location uses the clinic threshold, the stricter of the
two, rather than guessing the more sensitive one.

The system never produces a diagnosis, never estimates a probability, and never states a
medication dose.

## 7b. Source governance

Provenance stops at "where did this text come from and under what licence". Governance is
the separate question of who, if anyone, has checked it. Four mechanisms exist, and one
thing deliberately does not.

**Provenance**, in the `documents` table and shown on every document page: publisher,
licence, licence URL, source URL, retrieval date, word count and content SHA-256.

**Revision history**, in `document_revisions`. A row is written when a document is indexed
at a content hash it has not been indexed at before, and re-indexing identical text writes
nothing, so the table is the set of distinct revisions rather than a run log. This is what
makes "has the publisher changed this since we indexed it" answerable.

**Ingestion outcomes**, in `ingestion_runs`. Every attempt is recorded with one of
`ingested`, `skipped-unchanged` or `failed`, plus the error message when it failed, so
"which sources are broken" is answerable from the database rather than from a console
buffer that no longer exists. Verified against a throwaway database: 37 revisions across 37
sources with no duplicates, and 37 `ingested` plus 2 `skipped-unchanged` runs. No source
failed in that run, so the `failed` path's persistence is written but unexercised.

**Review records**, in `lib/corpus/source-reviews.json`, which is in version control. The
choice of a file over a table is the design: a review is a governance artefact whose audit
trail should be the repository history, it should not be creatable by a visitor to a public
deployment, and no credential for a review interface needs to exist. `pnpm review` records
an entry and refuses one that does not name a reviewer and their stated credential.

Two properties do the real work:

1. **A review is bound to a content hash.** `resolveReview` reports `current` only when the
   newest decision was made against exactly the hash the document has now, and `superseded`
   otherwise, in which case the interface says the document is treated as unreviewed. A
   changed document therefore cannot keep a stale approval. Both branches were verified by
   rendering them.
2. **No wording claims validation.** A record says a review was *recorded*, names the person
   and the date, shows the revision it covers, and states that the software did not verify
the credential and cannot confirm the review happened. Nothing in the interface reports a
   document, or this platform, as clinically validated.

What deliberately does not exist is any claim that review has occurred. The ledger is
empty, every document is labelled "Not clinically reviewed", and the library says so above
the list rather than leaving a reader to infer it from 37 identical tags.

## 7c. Personalisation, the learning catalogue and the dashboard

Three features rest on one principle: a suggestion this platform makes has to be traceable to
something the person themselves supplied, and what it was derived from has to be visible.

### The profile holds ids, not text

`lib/profile/options.ts` defines closed vocabularies - interests, goals, self-reported
conditions, a language preference, and two optional goals the person sets themselves - and each
interest carries the mapping that makes it useful: `corpusTopic` selects library documents by
their own topic, and `podcastTopics` selects episodes. An interest with no episodes yet declares
an empty list rather than being quietly dropped, which is why kidney health appears in the
profile and in the library but not in the catalogue.

Free text is deliberately absent. An id can be matched against the corpus and the catalogue by a
rule that can be read and tested; a free-text health history could not be, and it would also be
the most sensitive input the system could hold. The self-reported condition list is the only
sensitive field, it is labelled as the person's own account wherever it is shown, and neither
the emergency screen nor the triage rules read it at all.

### Recommendations are computed, never stored

`lib/recommendations.ts` is a pure function of the profile, the person's own records, the library
index and the keys already dismissed or completed. Every recommendation carries a `why` and a
`basedOn`, and the dashboard renders on the server from the same rows it displays above them, so
a suggestion and its evidence cannot disagree. Only the key is persisted, in
`recommendation_state`; the text is recomputed on every visit. The educational list also rotates
by an offset derived from the date rather than from randomness, so two loads on one day agree
and a returning reader does not only ever see the same item.

The one piece of interpretation in the module reuses `THRESHOLDS` from `lib/rag/triage.ts`
rather than restating them, so the dashboard and the symptom-guidance page cannot end up
disagreeing about what a threshold is. Nothing in it diagnoses, predicts or prescribes: the
strongest statement available is that a recorded reading is at a level the cited guidance
describes as needing attention. A goal the person set is compared only against their own
recordings and is labelled as their goal rather than a clinical target, and a symptom rated 7 or
above is described as their own rating on their own 1-to-10 scale rather than as a severity
score.

### The catalogue is verified against the publisher, not against memory

`lib/podcasts/catalogue.ts` holds 36 episodes from named health authorities' own channels. Every
value was read from the video's own watch page and oEmbed record, and `pnpm check:podcasts --live`
re-reads all of them and fails on any drift, which is what turns a typo in a video id or a
renamed video into a failing check rather than a card that opens the wrong thing. The live pass
caught two real errors during development - three titles written with a plain apostrophe where
the publisher uses a typographic one, and a channel name that had been expanded rather than
quoted - and it exits 2 when the network prevents it, so "could not test" is never read as
"verified".

What a listing means is bounded on purpose. It means the publisher is a recognised health
authority; it does not mean this project has clinically reviewed the episode. That statement is
held in the data as `CATALOGUE_VERIFICATION.scopeNote` and shown on the tab and on every episode
page, so it cannot drift away from the catalogue it describes. A suggestion names the interest
or goal that produced it and never claims an episode is appropriate for a condition. The episode
page embeds `youtube-nocookie.com` with an always-visible direct link, because some publishers
disable embedding and some networks block it; the catalogue page embeds nothing, so a list of 36
episodes costs no player requests and sets no cookie.

### The export

Personal data export exists twice on purpose: a formatted PDF for reading and the JSON document
for processing. Both resolve the account from the session cookie with no identifier in the path,
and the PDF is generated in memory rather than written to disk.

## 8. Security and privacy

- No analytics, no third-party trackers, and no third-party authentication service.
- Accounts are optional and self-contained. Everything except saved measurements works
  signed out.
- Same-origin enforcement on every mutation endpoint.

The account layer is deliberately thin, because every field is a liability:

| Concern | Decision |
| --- | --- |
| Password storage | `node:crypto` scrypt, self-describing hash (`scrypt$N$r$p$salt$hash`) so raising the cost later is a per-record migration. No hashing dependency was added. |
| Session storage | Server-side row keyed by the SHA-256 digest of a 256-bit random token. The raw token exists only in the browser, so a database copy yields no usable session. |
| Cookie | `uh_session`, HttpOnly, SameSite=Lax, `Secure` unless plainly on loopback. |
| Sign-in failure | One message for both an unknown address and a wrong password, and the hash is computed either way, so timing does not disclose whether an account exists. |
| Authorization | No endpoint accepts a user id. The account is resolved from the cookie, so cross-account access is a missing capability rather than a check that could be forgotten. |
| Deletion | Password re-authentication, then one cascading `DELETE`. A borrowed session cannot destroy an account. |
| Assistant isolation | Nothing in the accounts tables is read by the retrieval or generation path. A measurement cannot reach a model prompt because there is no code path that would carry it. |

Registration is the one place where account existence is disclosed, with a `409`, because
otherwise a person cannot tell a typo from a taken address.

Two limits worth stating plainly. The rate limiter is an in-process token bucket keyed on
`x-forwarded-for`, falling back to a single shared bucket when no proxy sets that header, so
on a development machine it is one global limit rather than a per-person one. And the
interaction log records question text with no account identifier: questions are not
attributable to a person, but they are also not erasable per person.

The guidance submission is still processed in memory and is never written to the database.
- In-process rate limiting, documented as a courtesy limit rather than a defence against a
  distributed attack.
- Input length caps and Zod validation on every field, including a closed enum for symptom
  identifiers.
- Retrieval content is passed to the model as delimited data with an explicit instruction
  that it is not instruction, which addresses prompt injection from ingested documents.
- Errors returned to the browser carry configuration guidance, not stack traces. A failure
  that no handler anticipated returns one fixed body rather than its own message, so an
  internal string cannot name a file, a table or a payload on its way out. Thrown values are
  logged through `redactError`, which records only the error's name and message: a provider
  SDK error commonly carries the request it failed on, and that request holds the reader's
  question and the retrieved passages.
- These claims are asserted rather than described. `pnpm check:security` drives a running
  server and fails if a header disappears, a mutating route accepts a cross-origin request,
  the environment file or the SQLite database becomes fetchable, or a refusal starts
  describing the internals.
- Secrets are read from `website/.env.local`, which is git-ignored by the `.env*` rule in
  `website/.gitignore`; `website/.env.example` contains no real values. The key has no
  `NEXT_PUBLIC_` prefix, so Next.js never inlines it into browser JavaScript.
- `pnpm verify:gemini` checks the key with real embedding and generation calls, prints only
  the model names a key can reach, and redacts the key from every error it reports.

No regulatory assessment has been performed under any data protection framework, and the
policy pages say so. They also mark every unconfirmed detail as draft for review rather
than inventing an operator identity, contact address, retention period or jurisdiction.

## 9. Reused and newly developed

**Reused from upstream:** the idea of a health information platform and its subject
domain; the MIT licensing basis and attribution requirement; nothing in code. No upstream
source file is imported or copied.

**Newly developed:** the corpus manifest and provenance model; HTML extraction and
section-aware chunking; the `KnowledgeStore` interface and SQLite implementation with exact
vector search and FTS5; hybrid retrieval with reciprocal rank fusion; the prompt and
citation-validation pipeline; the evaluation harness and report; the deterministic emergency
screen and triage thresholds; the closed-vocabulary profile and the recommendation rule set;
the podcast catalogue and the script that verifies it against each publisher's own page; the
personal dashboard; the personal-data PDF export; the entire web application and its design
system; the policy pages; this documentation.

## 10. Known limitations and future work

Limitations are listed on `/method` and in `docs/evaluation.md`, including the small
hand-written evaluation set, document-level rather than passage-level relevance judgements,
and the absence of any clinical validation.

### The guidance workflow, and what it still is not

The guidance workflow is four moments:

1. the emergency step, a fixed screen over declared warning signs,
2. the ordinary form, which computes a care level from fixed thresholds,
3. **the first clarifying round**, chosen from the symptoms that were selected,
4. **the second clarifying round**, chosen from an answer to the first.

The clarifying step is the part that branches, and it branches twice in different ways. Round 1
is content-keyed: a question names the symptom ids it belongs to. Round 2 is answer-keyed: a
question names the earlier question ids it depends on and the answers that make it relevant, and
it must also carry a `why` sentence naming the earlier answer that brought it up, which the
interface shows. Both rounds live in `FOLLOW_UP_QUESTIONS`, and every question in both carries a
required `escalatesTo` rule id. A yes-answer declares that rule, which enters the *same* screen
the emergency step uses, resolved from the rule table rather than from any text the caller
supplied. A no-answer and an unknown answer are dropped before they reach the screen at all.

The design decision that matters is that an answer is three-valued. `yes`, `no` and `unknown`
are all recorded, and only `yes` can do anything. `unknown` is not a synonym for `no`: it is
listed explicitly wherever a second-round question follows from it, so a question the person
could not answer still leads to the next question rather than silently collapsing into a
negative finding. That, plus the absence of any field through which a response could remove a
rule, is what makes "an answer can only raise the care level" structural rather than a rule to
remember. It is also why the documented care-level rules never lower a level on the strength of
an answer: the level reports what was *reported*, not what was ruled out, so there is no
documented rule that justifies a reduction.

Nothing is asked once something has escalated. That is not only the emergency-step rule any
more: it is what makes round 2 genuinely downstream of round 1 rather than asked alongside it.
Where round 1 asks whether palpitations come with chest pain, and the answer is yes, the screen
has already escalated and the round-2 question about fainting is never constructed. Only when
the first question was answered no or unknown does the second one exist to be asked.

The bank is smaller than the symptom list on purpose, and the reason is a reachability
constraint rather than curation. Only six of the eighteen symptoms have a first-round question:
headache, vision, dizziness, palpitations, nosebleeds and ankle swelling. The rest have none
because their own label already fires a rule — chest pain, a sudden severe headache, shortness
of breath — so the first submission is an emergency and no question is ever asked. A question
attached to one of those symptoms would be unreachable. A unit check derives that set by
screening each symptom label rather than reading a hand-written list, so the bank cannot quietly
accumulate dead entries when the symptom list changes.

How much is asked is capped, and the cap is honest about which way it fails.
`FOLLOW_UP_LIMITS` records two rounds, eight first-round questions and three second-round ones.
Selection never truncates; a check runs the widest possible trigger and fails if the matched set
exceeds a ceiling, so a question can never be dropped silently to fit one. Adding a question that
broke a ceiling would break the build instead.

The pathway is recorded. Each response's `pathway` lists the question ids answered, the answer
given, and the rule each yes declared, and nothing else — no free text the person typed and no
derived clinical detail — so the record of how a care level was reached can be shown and stored
without holding more about the reader than the decision needs.

What the workflow still is not: it is not a general question-flow engine. There are exactly two
rounds, so no third question can follow from a second answer, and the questions are authored
rather than generated. The part that the requirements make safety-critical — screening before
anything else, escalating without delay, and not depending on the model — is implemented and
checked. That part always was.

### Known retrieval limitation: comparing two diseases

The question "How is chikungunya different from dengue?" abstains, and the cause is measured
rather than guessed. Reciprocal rank fusion places six passages about chikungunya above the
corpus's only dengue document, because the chikungunya pages *mention* dengue and so match
both terms. The WHO dengue passage fuses to rank 9, behind a UKHSA chikungunya passage that
outranks it on both rankers. The model is therefore never shown a description of dengue and
correctly reports that its evidence does not explain the difference.

Two fixes were implemented and measured, and neither is enabled:

| Change | precision@5 | recall@5 | mrr | effect on the question |
| --- | --- | --- | --- | --- |
| none (baseline) | 0.714 | 0.814 | 0.905 | abstains |
| evidence cut-off 6 to 8 | unchanged | unchanged | unchanged | still abstains |
| dominance rule at share 0.4 | 0.675 | 0.826 | 0.905 | still abstains |

Raising the cut-off costs two extra passages and does not reach the dengue text. The
dominance rule caps the dominating page correctly but hands the freed slot to the
best-ranked unrepresented document, which on this corpus is a second chikungunya page. It
also costs 3.9 points of the primary precision metric, so it ships disabled. Both are kept
in the code, behind flags, so the comparison stays reproducible.

What would actually fix it is query decomposition or a reranker that scores passages for
covering both entities, which is item 3 below. Until then the honest position is that the
reader is served by the curated comparison on `/chikungunya`, which was written from the same
two fact sheets and shows its sources, and that the assistant declines rather than inventing
a contrast the corpus does not state.

### Known limits of the catalogue, the profile and the export

- No episode has been clinically reviewed, and no episode is described as appropriate for a
  condition. Each entry records the kind of body that published it and stops there.
- Catalogue coverage follows what these publishers have produced in English and Hindi, so a
  topic with no published video from an authority is absent rather than filled from an
  unofficial channel. Kidney health is the clearest gap, and the profile reflects it by mapping
  that interest to library documents only.
- Playing an episode is subject to YouTube's terms and privacy practices rather than this
  platform's, and no YouTube cookie is set before a reader opens one.
- The profile is deliberately restricted to closed vocabularies, so there is no way to record
  anything those lists do not cover and no free-text health history by design. That is a limit
  of the data model, and it is the reason the recommendation rules can be tested directly.
- The export covers the account's own rows and nothing else. Assistant questions are not
  attributable to an account, so they do not appear in it, and no retention period is asserted
  because none has been decided.

### Known non-measurement: the provider quota

The embedding model is metered per project per day, and that limit was reached during this
work. A run that cannot measure retrieval must not present zeros as findings, so the report
now carries a `notMeasured` list and `/method` renders those sections as "not measured in
this run" and says which run produced the figures on screen. The generation model recorded
in the report is read from the same config module the generator uses (`OLLAMA_MODEL`, default
`llama3.2:3b`), so it names the model that actually ran rather than a hard-coded fallback.

Future work, in the order that would add most value:

1. Passage-level human adjudication of citations, replacing the pragmatic "marker resolves"
   test with a judgement about whether the passage supports the sentence.
2. A larger, independently written question set to remove the authoring bias noted above.
3. Reranking and query rewriting, measured against the current pipeline rather than assumed
   to help.
4. A third round of clarifying questions, or first-round questions for the remaining symptoms
   that currently have none, so the pathway can follow a symptom that branches deeper than two
   steps.
5. Passive voice and readability checks on generated text for a general audience.
6. A pgvector implementation behind the same `KnowledgeStore` interface, allowing retrieval
   quality and latency to be compared against the exact scan.
7. A wider episode catalogue, starting with the topics where no authority has published an
   English or Hindi video, so more of the profile's interests lead to something watchable.
8. Clinician review workflow for corpus documents, with review state and dates displayed.
