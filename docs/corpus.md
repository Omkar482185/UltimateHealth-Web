# Corpus documentation

The corpus is the whole basis of the assistant's answers, so it is treated as a designed
artefact rather than a scraped pile. This document records how sources were selected and
verified, what licences apply, how ingestion behaves, and how to change the corpus safely.

Current size: **37 documents** from 6 publishers, producing **343 indexed passages**.

## 1. Selection criteria

A source is admitted only if all of the following hold:

1. It is published by a national public health body or an intergovernmental health agency.
2. The licence permits reproduction in an academic, non-commercial project, and the licence
   can be recorded and displayed.
3. The page is static HTML that can be retrieved and extracted without a browser.
4. The topic is within the declared scope: raised blood pressure, the conditions that
   share its risk factors or consequences, and chikungunya and dengue.
5. The text is stable enough that a change can be detected by content hash.

Chikungunya and dengue form a second, self-contained domain. They are included because they
are a worked demonstration of the feature the platform exists to provide: two illnesses that
public guidance says are easy to confuse, answered from documents that can be compared
rather than from a model's recollection. Dengue is not an afterthought to the chikungunya
material; it is a required source, because a comparison cannot be answered honestly from
one side of it.

The declared scope is deliberate. A small, coherent corpus with recorded provenance is more
defensible than a large one assembled without a rule for what belongs in it, and it keeps
retrieval evaluation interpretable.

## 2. Verification log

Every URL was fetched before being added to the manifest. The manifest records the resolved
URL after redirects, not the requested URL.

### MedlinePlus, US National Library of Medicine (14 documents)

All 14 returned HTTP 200. One URL redirected and the manifest was corrected to the resolved
address: `highbloodpressuremedicines.html` resolves to `bloodpressuremedicines.html`.

Topics covered: high blood pressure, prevention, blood pressure medicines, sodium, stroke,
heart attack, cholesterol, heart disease prevention, kidney failure, type 2 diabetes,
diabetes, obesity, exercise and physical fitness, stress.

### NHS, United Kingdom (11 documents)

All 11 returned HTTP 200. `conditions/high-blood-pressure-hypertension/` resolves to
`conditions/high-blood-pressure/`.

**Three NHS entries failed extraction on the first ingestion run and were replaced.** The
pages `conditions/stroke/`, `conditions/type-2-diabetes/` and `live-well/exercise/` are
section hubs: they carry a short summary and links to sub-pages rather than the guidance
itself. Extraction returned 224, 218 and 76 characters respectively, which is below the
500-character floor, so ingestion failed loudly and nothing was indexed. They were replaced
with the content-bearing sub-pages:

| Replaced | With |
| --- | --- |
| `conditions/stroke/` | `conditions/stroke/symptoms/` and `conditions/stroke/treatment/` |
| `conditions/type-2-diabetes/` | `conditions/type-2-diabetes/symptoms/` and `conditions/type-2-diabetes/treatment/` |
| `live-well/exercise/` | `live-well/exercise/exercise-health-benefits/` |

This is the intended failure mode. A publisher reorganising its pages produces a visible
failure rather than a silently indexed stub, and `scripts/debug-extract.ts` reports which
container was chosen, how much text each candidate holds, and the tag distribution.

### World Health Organization (6 documents)

All 6 returned HTTP 200: hypertension, sodium reduction, noncommunicable diseases, diabetes,
obesity and overweight, physical activity.

### Chikungunya and dengue (6 documents)

All six returned HTTP 200 and were extracted before being added.

| Source | URL | Licence |
| --- | --- | --- |
| Chikungunya (WHO fact sheet) | `who.int/news-room/fact-sheets/detail/chikungunya` | CC BY-NC-SA 3.0 IGO |
| Dengue and severe dengue (WHO fact sheet) | `who.int/news-room/fact-sheets/detail/dengue-and-severe-dengue` | CC BY-NC-SA 3.0 IGO |
| Facts about Chikungunya (NCVBDC, India) | `ncvbdc.mohfw.gov.in/index1.php?...&sublinkid=5968&lid=3764` | NCVBDC copyright policy, attribution required |
| Chikungunya (MedlinePlus) | `medlineplus.gov/chikungunya.html` | Mostly public domain |
| Chikungunya (UKHSA, on GOV.UK) | `gov.uk/guidance/chikungunya` | Open Government Licence v3.0 |
| Hypertension in India (WHO India) | `who.int/india/health-topics/hypertension` | CC BY-NC-SA 3.0 IGO |

The NCVBDC page is published by the Indian national programme responsible for vector-borne
disease and carries its own copyright policy rather than an open licence. That policy permits
reproduction with a prominent acknowledgement of the source and excludes third-party
material, and the obligation is recorded in that phrasing on every document row rather than
being paraphrased into "open licence".

**Sources checked and rejected.** NHS has no chikungunya condition page: both
`nhs.uk/conditions/chikungunya/` and the travel-vaccination chikungunya page return **404**.
India's National Health Portal chikungunya URL did not resolve. The PAHO chikungunya topic
page is live but states no reuse terms, so it is not reproducible here. UKHSA on GOV.UK was
used instead of NHS for the United Kingdom position.

### Publisher evaluated and excluded: CDC

Five CDC pages were requested and all returned **HTTP 403**:
`high-blood-pressure/about/`, `high-blood-pressure/prevention/`, `stroke/signs-symptoms/`,
`heart-disease/about/` and `salt/`.

Re-checked when the CDC chikungunya and blood-pressure-measurement pages were considered.
`cdc.gov/chikungunya/about/index.html` and `cdc.gov/high-blood-pressure/measure/index.html`
returned **403** as well. The measurement page would have been the best available source for
technique, and CDC material is public domain and would otherwise be an obvious choice, so the
exclusion costs the corpus something real: there is currently **no source with step-by-step
home measurement instructions**, and the guidance page therefore does not give any. It links
the NHS description of what happens at a check instead.

A retry with a full browser header set (User-Agent, Accept, Accept-Language,
Upgrade-Insecure-Requests) returned 403 again, so this is bot protection rather than a
missing header. CDC content is not included, purely on accessibility. Circumventing the
control was not attempted.

### Described but not verified: the upstream UltimateHealth API

The upstream platform exposes `GET /api/articles` (200, JSON) and permits guest reads, and
some of its article content derives from the same public health publishers. It is **not**
used as a corpus source. Community-authored content has no per-document provenance and no
recorded licence, which the corpus model requires.

## 3. Licences and obligations

| Publisher | Documents | Licence | Obligations |
| --- | --- | --- | --- |
| MedlinePlus, US National Library of Medicine | 15 | Mostly public domain as a US Government work | Attribution; some embedded content is third-party and separately licensed |
| NHS, United Kingdom | 11 | Open Government Licence v3.0 | Attribution to the NHS |
| World Health Organization | 8 | CC BY-NC-SA 3.0 IGO | Non-commercial use only, attribution, share-alike on adaptations |
| National Centre for Vector Borne Diseases Control, India | 1 | Agency copyright policy, not an open licence | Prominent acknowledgement of the source; no misleading context; third-party material excluded |
| UK Health Security Agency | 1 | Open Government Licence v3.0 | Attribution to UKHSA |
| World Health Organization (India country office) | 1 | CC BY-NC-SA 3.0 IGO | Non-commercial use only, attribution, share-alike on adaptations |

Consequences that shaped the design:

- **WHO material is non-commercial.** The licence is recorded per document and displayed
  with the content, and the restriction is stated in the README and the terms page. Any
  commercial use of the corpus would require a separate arrangement.
- **Attribution is not optional.** Every document page shows publisher, licence and a link
  to the original, and every citation in the assistant links to the source. The corpus
  cannot be displayed without its attribution because the two are stored together.
- **The licence is machine-readable.** It is a field on the document row, not a comment, so
  it cannot be lost when the corpus is re-ingested.

This documentation records what each publisher's terms say. It is not a legal opinion, and
no legal review of these obligations has been carried out.

## 4. Ingestion behaviour

Run `pnpm ingest`. For each source:

1. Fetch the page with an identifying User-Agent, a 30-second timeout, and up to three
   attempts with linear backoff.
2. Strip scripts, styles, forms, navigation, headers, footers, sidebars and cookie banners.
3. Choose the first candidate content container whose text exceeds 800 characters, falling
   back to `<body>`.
4. Walk headings, paragraphs and list items in document order, dropping paragraphs shorter
   than 25 characters, paragraphs that are mostly links, exact duplicates, and repeats of the
   page title.

   **List items are held to a different floor (3 characters) than paragraphs (25).** Carrying
   one floor for both deleted the substance of several warning-sign sections. The WHO dengue
   fact sheet was indexed as "The symptoms of severe dengue ... may include:" followed by
   nothing, because "severe abdominal pain", "bleeding gums or nose" and "blood in vomit or
   stool" are each under 25 characters. The WHO hypertension page read "Very high blood
   pressure may cause:" with "chest pain", "confusion" and "difficulty breathing" removed.
   Asked about warning signs, the assistant answered, correctly, that its sources did not
   cover them. A second, tag-blind length filter after the walk reintroduced the same deletion
   and was removed; the floor now lives only where the element's tag is still known. Short
   paragraphs are still dropped, because a short `<p>` on these sites is almost always
   chrome.
5. Fail the source if fewer than 500 characters of content remain.
6. Hash the extracted text with SHA-256 and compare against the stored document.
7. Chunk along heading boundaries: paragraphs packed toward 1200 characters, capped at 1800,
   with 200 characters of trailing context repeated between chunks. If the hash is unchanged
   and the source is not forced, stop here.
8. Embed each chunk, prefixing the section heading to the embedded text so the passage
   carries its context, while storing the passage text itself.
9. Upsert the document and replace its chunks inside a transaction.

Requests are spaced 400 ms apart to avoid loading the publishers' servers.

**Idempotency.** Re-running ingestion on an unchanged corpus writes nothing. When a publisher
edits a page, its hash changes and only that document is re-chunked and re-embedded. The hash
is displayed on every document page, so a reader can confirm which revision is indexed.

**Politeness.** The pipeline reads a few dozen static pages, once, with an identifying agent
and a delay. It does not crawl, does not follow links, and does not attempt to bypass access
controls. `robots.txt` was not separately parsed; if this corpus were to grow substantially,
that would need to change.

## 5. Adding, replacing or removing a source

1. Verify the URL returns 200 and is the resolved address after redirects.
2. Confirm the publisher and the exact licence and licence URL.
3. Check extraction before committing: `pnpm exec tsx scripts/debug-extract.ts <url>`. If the
   chosen container holds little text, the URL is probably a hub page; find the content page.
4. Add an entry to `CORPUS_SOURCES` in `lib/corpus/sources.ts` with a stable `sourceId`,
   the `topic`, publisher, resolved URL and licence fields.
5. Run `pnpm ingest`. Confirm the source reports `OK` with a plausible chunk count.
6. Run `pnpm eval` if the change could affect retrieval quality, and record the new numbers.
7. Update this document: the publisher table, the counts and the verification log.

To remove a source, delete its entry and re-ingest; documents are keyed by `source_id`.
Deleting a document cascades to its chunks. Because embeddings from different models are not
comparable, changing the embedding model requires re-ingesting the whole corpus.

## 6. Content limitations

- **No clinician review.** Every document is reproduced from a named public health publisher,
  but no clinician has reviewed this corpus or the way passages are selected for a given
  question. Review state and dates are future work.
- **Pages change.** Upstream text can be edited, moved or withdrawn. The content hash detects
  change on the next ingestion run but does not detect it in real time, so an indexed document
  is only as current as its recorded retrieval date.
- **Extraction is a heuristic.** A publisher redesign can change what is extracted. The
  500-character floor and the diagnostics script are the guards against silent degradation.
- **Chunks are not passages in the publishing sense.** Boundaries come from headings and
  character targets, so a chunk can begin mid-argument. The overlap exists to limit that harm.
- **The corpus is narrow.** It covers raised blood pressure and closely related conditions,
  plus chikungunya and dengue. Questions beyond that scope are supposed to be declined, and
  that behaviour is measured rather than assumed.
- **No measurement-technique source.** As recorded above, every CDC page returns 403 to this
  ingester, and CDC's "Measuring Your Blood Pressure" page is the clearest public-domain
  description of correct technique. The corpus has no step-by-step measurement instructions,
  so the guidance page gives none and says why instead of paraphrasing the NHS description of
  what happens at a check.
- **Recency is the publisher's, not ours.** WHO fact sheets are reviewed on the publisher's
  schedule. The NCVBDC page displays an update date of "October 08, 2026" at the time of
  writing, which is in the future and is reproduced here only so that the inconsistency is on
  the record rather than silently normalised.
