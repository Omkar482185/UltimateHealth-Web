# Retrieval demonstration

Everything in this file was produced by commands run against the live database on
the machine described in [RAG_DATABASE_GUIDE.md](RAG_DATABASE_GUIDE.md). The
output is copied verbatim; nothing is illustrative.

## How to reproduce

```bash
cd "D:\UltimateHealth(F)\ultimatehealth\website"
pnpm retrieval-check     # prints the fused ranking for ten fixed questions
pnpm check:assistant     # exercises the live API, including an abstention
pnpm tsx scripts/rag-audit.ts   # re-verifies corpus counts
```

`pnpm retrieval-check` needs the embedding provider configured in `.env.local`
(here: Gemini `gemini-embedding-001`). It runs the same `retrieve()` function the
assistant uses, with no model generation involved.

## What the header of a run looks like

```
backend:  sqlite-exact
provider: gemini:gemini-embedding-001
corpus:   37 documents, 343 chunks
```

`sqlite-exact` is the store's own identifier: SQLite storage with an exact (full
scan) vector ranking. It is **hybrid**, not keyword-only — every question below
shows a vector rank, a keyword rank, or both, fused by reciprocal rank fusion.

## Reading a result line

```
   - [ 1/ 1] cos=0.753 rrf=0.0328 High blood pressure #6
```

| Field | Meaning |
| --- | --- |
| `1 / 1` | rank in the vector ranking / rank in the BM25 keyword ranking (`-` means that ranker did not return it in its top hits) |
| `cos=0.753` | cosine similarity between the query embedding and the chunk's embedding |
| `rrf=0.0328` | reciprocal rank fusion score, `Σ 1/(k + rank)` over the rankers |
| `High blood pressure #6` | document title and the chunk's ordinal inside that document |

The top 6 fused chunks become the evidence the model may cite as `[S1]..[S6]`.
Thresholds and cut-offs are the project's defaults in `lib/config.ts`
(`vectorTopK=12`, `keywordTopK=12`, `finalTopK=6`).

## Captured output, question by question

### Q: What blood pressure reading is considered high?

```
   topCosine=0.753 vectorHits=12 keywordHits=12 evidence=6
   - [ 1/ 1] cos=0.753 rrf=0.0328 High blood pressure #6
   - [ 2/ 2] cos=0.737 rrf=0.0323 High blood pressure #5
   - [ 6/ 3] cos=0.707 rrf=0.0310 How to Prevent High Blood Pressure #2
```

Both rankers put the same passage first: the fused rank 1/1 passage comes from
`nhs-high-blood-pressure`, <https://www.nhs.uk/conditions/high-blood-pressure/>
(NHS, Open Government Licence v3.0). Ranks 1 and 2 in both lists come from the
same NHS document; the third passage is MedlinePlus,
`mlp-prevent-high-blood-pressure`,
<https://medlineplus.gov/howtopreventhighbloodpressure.html>.

### Q: What are the warning signs of a stroke?

```
   topCosine=0.757 vectorHits=12 keywordHits=12 evidence=6
   - [ 3/ 6] cos=0.743 rrf=0.0310 Symptoms of a stroke #1
   - [ 8/ 2] cos=0.709 rrf=0.0308 Stroke #9
   - [ 1/10] cos=0.757 rrf=0.0307 Stroke #3
```

The winning passage is `nhs-stroke-symptoms`,
<https://www.nhs.uk/conditions/stroke/symptoms/> ("Symptoms of a stroke" #1),
ranked 3rd by the vector ranker and 6th by BM25. The vector ranker's own first
choice (`Stroke #3`, MedlinePlus <https://medlineplus.gov/stroke.html>) fuses to
third because BM25 ranked it 10th — which is exactly what fusion is for: a passage
both rankers consider relevant outranks one only a single ranker likes.

### Q: How much sodium should I eat per day?

```
   topCosine=0.717 vectorHits=12 keywordHits=12 evidence=6
   - [ 4/ 1] cos=0.695 rrf=0.0320 Sodium #0
   - [ 1/ 5] cos=0.717 rrf=0.0318 Sodium reduction #4
   - [ 3/ 4] cos=0.699 rrf=0.0315 Sodium reduction #0
```

Here BM25's first choice (`Sodium #0`, MedlinePlus
<https://medlineplus.gov/sodium.html>) wins the fusion, and the WHO fact sheet
`who-sodium-reduction`
<https://www.who.int/news-room/fact-sheets/detail/sodium-reduction>
contributes two of the top three passages. The question is phrased in everyday
words; the corpus documents use clinical vocabulary, so the fusion of both
rankers is what surfaces the right pages.

### A question only one ranker can answer

```
Q: How does high blood pressure affect the kidneys?
   topCosine=0.699 vectorHits=12 keywordHits=12 evidence=6
   - [ 1/ -] cos=0.699 rrf=0.0164 Hypertension #6
   - [ -/ 1] cos=  n/a rrf=0.0164 How to Prevent High Blood Pressure #7
   - [ 2/ -] cos=0.691 rrf=0.0161 High Blood Pressure #3
```

The second passage never appeared in the vector ranking (`n/a`) but was BM25's
first hit, so it still reaches the evidence set. Its `rrf` (0.0164) is half of a
two-ranker winner's because only one ranker contributed.

## Behaviour when the evidence cannot support an answer

Retrieval always returns its best passages; deciding whether they *support an
answer* is the generator's job, and its rule is: answer only from the retrieved
passages, cite every claim as `[S1]..[S6]`, and abstain otherwise. A question the
corpus cannot support is declined rather than answered from the model's own
knowledge.

Observed in the live API (`pnpm check:assistant`, 19/19 passing on this machine):

```
ok   an unrelated question abstains  -> {"status":200,"mode":"abstained"}
```

The unrelated question in that suite is a billing/refund question — the same
category as `How do I get a refund for my hospital bill?`, which retrieval-check
includes on purpose: BM25 may still match an incidental word, but no passage
supports an answer, so the assistant abstains and says why. Two further
abstention gates exist upstream of retrieval: the emergency screen (which stops
everything and directs the reader to urgent care) and the triage guidance path.

## Confidence numbers, measured

`docs/evaluation.md` records the harness measurement for this corpus: precision@5
71.4%, recall@5 81.4%, MRR 0.905 over 56 hand-judged questions, with 0.0%
unsupported citation rate in the measured run. Those figures were measured by
`pnpm eval` against this same database; the limitations section of that file
applies (single judge, small hand-built question set, upper-bound estimates).
