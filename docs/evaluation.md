# Evaluation report

Generated 2026-10-25T14:25:46.051Z. This file is produced by `pnpm eval` and is regenerated on every run, so it always reflects a real measurement rather than a remembered one.

**Not measured in this run:** assistant, outOfScope, latency. Those sections are shown below as unmeasured rather than as zero.

## Test conditions

| Item | Value |
| --- | --- |
| Embedding provider | gemini:gemini-embedding-001 |
| Generation model | llama3.2:3b |
| Corpus | 37 documents, 343 passages |
| Retrieval | hybrid (vector + BM25), reciprocal rank fusion |
| Retrieval cut-off | top 5 passages |

## Retrieval

| Metric | Definition | Value |
| --- | --- | --- |
| Precision@5 | Share of the top 5 retrieved passages whose document is relevant for the question | 71.4% |
| Recall@5 | Share of relevant documents represented in the top 5 | 81.4% |
| Mean reciprocal rank | Mean of 1 divided by the rank of the first relevant passage | 0.905 |
| Questions | In-corpus questions with relevance judgements | 56 |

## Answer behaviour

| Metric | Definition | Value |
| --- | --- | --- |
| Citation correctness | Answered questions where every citation resolved to a retrieved passage | 0.0% |
| Unsupported citation rate | Citations stripped because they did not resolve to a retrieved passage | 0.0% |
| Uncited answers | Answers with no verifiable citation at all | 0 |
| Answered | In-corpus questions answered | 0 |
| Abstained | In-corpus questions declined | 0 |
| Abstention on out-of-scope questions | Declined questions the corpus cannot answer | 0.0% (0/13) |

## Safety

| Metric | Definition | Value |
| --- | --- | --- |
| Warning-sign detection | Inputs where the screen fired as expected, including the expected rule | 100.0% (28/28) |
| Screen latency | Median time from input to decision | 0.022 ms |

## Latency

| Percentile | Value |
| --- | --- |
| p50 | 0 ms |
| p95 | 0 ms |
| max | 0 ms |

## Limitations

- Retrieval relevance is judged at document level by one person who wrote the questions after the corpus was assembled. Questions are therefore easier than questions gathered from real users, and the retrieval figures should be read as an upper estimate.
- The question sets are small, so each question moves the percentages by roughly 2.5 points in the in-corpus set and 10 points in the out-of-scope set.
- Precision is computed against a fixed cut-off of 5 retrieved passages, and a passage counts as correct when its source document is in the relevance list for that question, whether or not the passage itself answers the question.
- Citation correctness measures whether citation markers resolve to a retrieved passage. It does not measure whether the passage actually supports the sentence, which would require sentence-level human adjudication.
- Latency was measured on a single development machine with a local SQLite database and a hosted language model. It is indicative, not a benchmark, and it will vary with network conditions and provider load.
- The emergency screen is evaluated against a hand-written set of inputs. It measures whether the rules fire as intended, not whether the rules cover every real emergency presentation.
- No measure here says anything about clinical effectiveness. Nothing on this platform has been clinically validated.
- This run used --retrieval-only, so assistant, out-of-scope and latency figures were not measured. They are reported as unmeasured rather than as zero.
- No generation calls failed on the provider in this run.

These metrics measure the behaviour of this software. They are not evidence of clinical effectiveness, and no such claim is made.
