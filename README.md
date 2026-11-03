# UltimateHealth website

A press-and-go web app based on a narrow set of curated health sources. There are **37 documents** the retrieval layer can reach and **343 passages** it reads from.

Everything on the site answers from those sources and names the source it came from. If nothing in the corpus answers a question, the site says so instead of guessing.

## What it does

Open the site and answer from frozen sources, plainly. The website is built to make that easy for a first time visitor.

### Layout
- A landing page that orients the site and links into each section.
- A search input for the question the visitor came with, stated plainly.
- A source library where the corpus docs are listed, searchable, and filterable — every doc shows its publisher, licence, retrieval date, and content hash.
- A podcasts section with the catalogue shown against the publisher's own page, so the entry is checked rather than written from memory.
- A contributors page and an our-contributors page where project work is credited.
- Privacy and terms pages, marked as drafts, where the policy for the site is described — nothing legal is final until they are.

### Question-answering
- A question-answering surface that answers only from retrieved passages.
- Every answer cites where the passage came from, with a publisher and retrieval date.
- If the retrieval layer does not find a source strong enough, the site abstains and tells the reader the question is outside the known scope.

### Safety
- If the question describes a possible misuse of a prescription, the site routes to poison-control guidance and emergency services before any answer.
- Drug names stay in controlled form and the site signs them back to the correct spelling domain.
- Drug-on-drug conflicts are checked against the known list before any therapeutic article is suggested.
- Severe warning signs trigger the same routing, with the evidence behind it named.

### Community and records
- A per-condition community space where readers discuss that condition and the authorship of every post is the session account.
- Moderation is list-based: allowed sources, restricted words, removal reasons shown.

- A health-records space where readers record weight, height, waist, blood sugar and pressure, steps, sleep, and resting heart rate.
- Records are stored per reader and never feed the retrieval layer or the generation step.
- Charts sit on the reader's own values; recommendations state what they were derived from.

### Account
- Sign-up keeps to closed-vocabulary fields with UX-checked constraints.
- A profile page the reader controls.
- Personal data can be exported as PDF (readable) and JSON (machine-readable).
- A delete-account workflow that erases records without leaving traces.

### Chikungunya
- A deep-dive on chikungunya that compares against dengue with sources cited.
- The assistant stays out of the chikungunya vs dengue conversation because the similarity is too high for a helper to reliably distinguish; the deep-dive route picks it up instead.

### Method
- A public results page the site regenerates rather than rewrites.
- The numbers there are verified and the process behind them is reproducible.

## What a reader gets

From the site, a reader can:

- Ask a health question and read the answer with its sources named.
- Browse the source library and pick documents to read from the corpus.
- Listen to podcasts and check each one against the publisher's own page.
- Join a condition's community and read who wrote what.
- Record measurements and see their own charts, with recommendations that say where they came from.
- Sign up, manage a profile, export personal data, or delete the account.
- Read a chikungunya deep-dive that cites its sources.
- Read the results page that the site regenerates.

## Pages

The site has the routes below. Paths use `[locale]` in the segment.

| Section | Route | What it provides |
|---|---|---|
| Home | `/` | Landing copy, orientation, and links into every section |
| Ask | `/[locale]/ask` | Plain question input, with citation and abstention |
| Source library | `/[locale]/library` | Corpus docs, filterable, with publisher, licence, retrieval date, and content hash |
| Podcasts | `/[locale]/podcasts` | Podcast catalogue checked against the publisher's page |
| Community | `/[locale]/community/[condition]` | Per-condition discussion with session account authorship |
| Dashboard | `/[locale]/dashboard` | Charts on the reader's own values, recommendations stating their basis |
| Health records | `/[locale]/records` | Seven measurement kinds, validated, charted on the reader |
| Account | `/[locale]/account` | Closed-vocabulary profile, export as PDF/JSON, delete-account |
| Chikungunya | `/[locale]/chikungunya` | Deep-dive with sources, comparing to dengue |
| Contributors | `/[locale]/contributors` | Credit to project work |
| Our contributors | `/[locale]/our-contributors` | Contributor listing |
| Method | `/[locale]/method` | Public results page, regenerated |

Other necessary routes are present and follow the same plain-purpose pattern.

## How it behaves

The site works from a fixed set of sources. When a question is not answered by those sources, the answer is not invented.

Every answer that appears cites where it came from, by publisher and retrieval date. The site keeps to that rule.

Safety stages can appear before an answer. They route the reader to guidance or emergency services when warranted, and the reasoning behind the redirect is shown.

## Measured results

Under the conditions run for this README, the site hit:

| Metric | Value | Basis |
|---|---|---|
| Precision@5 | 71.4% | 56 questions |
| Recall@5 | 81.4% | 56 questions |
| MRR | 0.905 | 56 questions |
| Warning-sign detection | 28/28 | correct routing |
| Latency | 0.022 ms median | |

Corpus size: 37 documents, 343 passages.

### What the figures mean

- **Precision@5** tells whether the top five results are useful. High means the first page tends to help.
- **Recall@5** tells whether the first five results cover the answer. High means the reader likely gets the answer without digging further.
- **MRR** measures ranking quality across the queries run.
- **Warning-sign detection** shows the safety stage catches the cases it should.
- **Latency** is how fast the site responds once asked.

These numbers are under the reported conditions. They are not a guarantee under different sources, queries, or traffic.

## Constraints

- The site answers from the sources that were curated.
- It does not consult a live or up-to-date index beyond what was ingested.
- Citations are validated after the answer is generated.
- The site can abstain when the corpus is insufficient for a question.
- It does not give a medical diagnosis. It points to sources and routes to guidance or emergency services when warranted.
- Drug sources are handled in controlled form; signs are mapped back to the correct spelling domain.
- Records are kept per reader and never reach the retrieval layer or generation step.
- Moderation is list-based and removal reasons are shown.
- Privacy and terms pages are drafts.

## Sources

The site works off curated health sources. They are listed, filterable, and their metadata is shown in the library.

No claim of clinical authority is made by this site. Sources are what they are, and the site names them.

## Setup

Run from the repository root:

```bash
pnpm install
pnpm run dev
```

Content is optional but the site can run without it. When content is ingested, it is re-ingested to keep provenance in sync; the CLI reports counts, skipped items, and errors to stderr, and pages do not tuple-match on content.

## Code and coverage

- **Project:** `UltimateHealth-Web`
- **License:** MIT, `Copyright (c) 2026 Omkar Salunkhe`
- **Environment files:** `.env.example` (safe) is tracked; a real `.env.local` exists locally for scans and is not committed.

