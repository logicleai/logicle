# Context strategy: what we are trying to prove

## Why this document exists

Knowledge boxes and context compression are bets. Both are almost certainly right, and neither is
yet demonstrated. This work will take a long time, so the questions belong somewhere durable
rather than in a conversation — otherwise the work drifts towards whatever is easiest to measure,
which is never the thing that matters.

This is the research agenda. It records what we are optimising, what the baseline is, which
hypotheses are falsifiable and how, and what would make us abandon a direction. It is not a
design doc: see [`docs/knowledge-box.md`](knowledge-box.md) for what exists and
[`docs/evaluation-harness.md`](evaluation-harness.md) for how it is measured.

## The thesis: where the information is _not_

The default framing of retrieval is precision-shaped: _give me the k most relevant passages_.
Every RAG tutorial optimises that number, and it is the wrong target for what Logicle's users
actually do.

In a corpus of company documents, the expensive part is not finding the needle. It is **ruling out
the haystack**. "The penalty clause is in contract 47" is only useful alongside "and it is in no
other contract" — otherwise the answer is a guess that happens to be right. A user asking about a
supplier agreement needs to know whether the thing they are looking for exists at all, and a system
that cannot distinguish _absent_ from _not retrieved_ cannot tell them.

This is not a Logicle idiosyncrasy; it is a known and badly-solved problem:

- **Completeness-sensitive negative reasoning** ([arXiv 2608.04591](https://arxiv.org/abs/2608.04591)):
  a negative answer is licensed only when the evidence covers the query scope; otherwise the honest
  answer is _unknown_. Across three model families the paper finds unstable closure judgements and
  substantial **over-closure** — models treating partial evidence as if it covered the question.
  Prompting redistributes the errors rather than fixing them.
- **Over-searching** ([arXiv 2601.05503](https://arxiv.org/html/2601.05503)): models issue ~70%
  more searches than needed, and search augmentation _improves_ answer accuracy by 24% while
  _degrading_ abstention accuracy by 12.8%. Only 13–22% of documents retrieved for an unanswerable
  query contain any negative evidence, because corpora record what is true, not what is absent.

So the trap to avoid is building the definitive retriever. A better retriever raises precision on
answerable questions and does nothing for the case that actually hurts: a confident answer, or a
confident "not found", from a system that never covered the corpus.

**What we optimise instead: the cost of justified coverage.** How cheaply can the system reach a
state where it can say "the answer is here" or "it is nowhere in these documents" and be right
about _both_?

## The baseline: everything in context

Fixed, and not to be moved: every document in the preamble, every turn. It is what Logicle does
today, and it has one property nothing else has — **it is the coverage ceiling**. Whatever it
answers, it answered having seen everything.

Two caveats that must stay attached to it:

- Coverage ceiling is not accuracy ceiling. Accuracy degrades with input length _even when
  retrieval is perfect_ ([arXiv 2510.05381](https://arxiv.org/pdf/2510.05381)), and the
  lost-in-the-middle U-curve costs >30% on mid-context facts. Above some size the baseline has
  coverage and still gets it wrong, which is the worst combination: authoritative and mistaken.
- It stops existing. Past the context window it is not expensive, it is impossible, and the
  comparison stops being about cost.

Those two facts are why the interesting result is a _curve_, not a table. Somewhere below a
threshold the baseline wins on everything and an index is wasted effort; somewhere above it the
baseline degrades; somewhere above that it is gone.

## The experiment that tests the thesis: the flip test

Measuring "does it know what it does not know" needs paired corpora.

For each question, build two corpora identical except that one contains the answer and one has had
it removed. Run the same question against both.

| behaviour on positive corpus | behaviour on negative corpus            | verdict                                                                           |
| ---------------------------- | --------------------------------------- | --------------------------------------------------------------------------------- |
| answers correctly            | says "not in these documents"           | **coverage** — the only passing combination                                       |
| answers correctly            | answers anyway                          | hallucination under absence                                                       |
| says "not found"             | says "not found"                        | over-closure: right on the negative corpus by luck, and wrong on the positive one |
| answers correctly            | searches until the turn budget runs out | over-searching                                                                    |

A system that gives the same answer to both has told us nothing, however confident it sounds. This
is what separates a retriever from a coverage mechanism, and it is cheap to run because it reuses
the corpus generator with one clause deleted.

**Projections are an exclusion device, not a retrieval device.** The current benchmark shows them
helping because they _answered_ the question directly; that is a nice side effect, not the reason
they exist. Their real job is to let the model discard a document without reading it. That
reframing has a testable consequence: ingestion questions should be chosen for **discriminative
power** — questions whose answers differ between documents — rather than for summary quality. A
projection that says "this is a supply agreement" on all 200 documents excludes nothing and costs
200 × its own length.

## Axes to sweep

Two independent dials, and their interaction is the real production case.

**Corpus axis** (knowledge box): documents × words per document, from ~5k to ~2M tokens. Plus
three shape dials that matter more than raw size:

- _distractors_ — how many other documents state the same kind of fact with a different value.
  This is what turns a retrieval miss from an obvious failure into a plausible wrong answer.
- _needle depth_ — position within its document, for the U-curve.
- _hops_ — how many documents must be combined. Single-shot retrieval finds one and stops.

**Conversation axis** (compression): turns, and how much earlier turns matter later. Compression
is about conversation length, not corpus size, and it has no arm in the harness yet.

The combined cell — a long conversation over a large corpus — is where real users live and where
neither mechanism has been measured.

## Hypotheses

Each states what would refute it. A hypothesis nothing could refute is a slogan.

1. **There is a crossover size below which the knowledge box is not worth building.**
   Refuted if the box is cheaper at every size once ingestion is amortised. Current data puts
   break-even at 5–13 conversations on a 5k-token corpus, so the crossover is probably very low —
   but that is two scenarios at one size.
2. **Above some size the baseline loses accuracy while retaining coverage.** Refuted if success
   rate stays flat up to the context limit. Expected to bite between 50k and 200k tokens.
3. **The knowledge box beats the baseline on unanswerable questions, not just on cost.** This is
   the thesis. Refuted if the flip test shows the same over-closure rate for both.
4. **Discriminative projections exclude more per token than summary projections.** Refuted if
   swapping the ingestion questions for deliberately discriminative ones does not reduce documents
   read per correct answer.
5. **Chunk retrieval and projections are complementary, not redundant.** Already dented: on the
   two-document scenario `knowledge-box` (3 836 tokens) lost to `knowledge-box-no-projections`
   (2 329) because the listing was dumped wholesale. Fixed by ranking and budgeting the listing;
   needs re-measuring at 50+ documents, where it actually matters.
6. **Compression and the knowledge box compose.** Refuted if a compressed conversation over a box
   does worse than either alone — plausible, since compression can summarise away the tool results
   the box just paid to retrieve.

## Metrics we do not have yet

The harness measures success, tokens, cost and break-even. The thesis needs three more:

- **Exclusion recall / false exclusion.** What fraction of the corpus was ruled out, and how often
  was the answer-bearing document among the ruled-out. False exclusion is the silent failure.
- **Abstention calibration.** The flip test's verdict, as a rate. Implemented in
  [`abstention.ts`](../apps/backend/lib/eval/abstention.ts): each run is classified by whether the
  assistant mentioned the needle, another percentage, no percentage, or failed to conclude; the
  two halves are paired per arm and repetition, and the report gives coverage and value-under-
  absence rates. This is deliberately a conservative lexical proxy, not an assertion classifier:
  a value quoted in a denial is still counted, while a no-value answer needs the judge to confirm
  that it was a useful explicit abstention. Related work uses a five-level evidence scale
  (supportive / partial / irrelevant / absent / conflicting) — worth borrowing.
- **`pass^k` rather than mean score.** From τ-bench: the probability that _all_ k trials succeed.
  A 70%-mean system that is 70% on every run is a different product from one that is 100% on seven
  runs and 0% on three, and the mean hides it.

Provider-reported cache reads and writes remain in the eval totals and report as telemetry used by
[`computeCostUsd`](../apps/backend/lib/eval/cost.ts). The primary cost estimate is cache-aware so
tool-heavy strategies receive the economics of their actual prefix-cache usage; when cache
telemetry is missing, the affected input falls back to the full input price. An undiscounted/full-
price counterfactual is reported separately, while an unknown model still reports token usage and
leaves USD unavailable rather than silently using the wrong price.

## Threats to validity

Written down so we do not discover them in the results.

- **Simulated users are not users.** [arXiv 2601.17087](https://arxiv.org/pdf/2601.17087) finds
  LLM-simulated users are unreliable proxies for human users in agentic evaluation. Our runs
  compare arms under the same scenario and simulated-user policy, but each arm has an independent
  stochastic trajectory. Absolute success rates are not transferable to production.
- **Judge bias.** Assistant, simulated user and judge currently share a provider. A judge from a
  different family would reduce the risk of rewarding its own phrasing.
- **Synthetic corpora.** The generator is built to have the right shape, not to be real text. Real
  traffic is curated separately through the private multi-tenant dataset workflow.
- **Answer keys as substring matching.** Cheap and unambiguous, and it cannot see a correct answer
  phrased unexpectedly. The judge covers that gap; when the two disagree, suspect the scenario.
- **Small samples.** Bootstrap intervals are reported and differences that include zero are
  labelled not separable. Resist reading a ranking out of three runs.

## Sequence

### Compression TODO from production replay

Real same-model replay found that historical-attachment compression reduced input by 93–97% and
preserved quality when the current user message contained a useful query. It initially produced a
material continuity regression when the current message contained only an attachment: the file was
read correctly, but the immediately preceding assistant answer had been compressed and prefetch
received an empty query. Falling back to the previous user request recovered relevant excerpts but
was insufficient by itself: the model still treated the attachment-only turn as having no task. A
bounded continuation note in the otherwise-empty current user message fixed the real replay while
retaining a 96.51% input reduction. A long text-only replay remained usable with a minor drafting
regression.

- [x] Recover the nearest non-empty user request for an empty current user message, use it for
      prefetch, and add a bounded continuation note to attachment-only current turns. Keep the
      planner's turn-stable decisions and cached base summaries unchanged; apply the note in both
      `prefetch` and `tool` retrieval modes.
- [x] Add a synthetic attachment-only continuation case: the user asks a document question, the
      assistant answers and requests a specific follow-up document, then the user uploads that
      document with empty text. Success requires connecting the new document to the prior answer,
      not asking what to do with it.
- [x] Verify the two production cases that retained quality as deterministic regression controls;
      their compression decisions and estimated token counts remain unchanged.
- [x] Record and review provider-call/tool-call counts. One successful prefetch replay invoked
      context retrieval three times, so the real turn cost was substantially above the one-pass
      compressed-history estimate even though it remained far below production. The corrected
      attachment-only replay used one provider call and no retrieval tools.
- [x] Guard response-preference turns from historical compression and retrieval. A real replay of
      a format-only follow-up previously produced unsupported historical document details and was
      judged a major regression; after the guard, off/on both used one provider call with no
      context-retrieve call and equivalent responses.
- [x] Rebuild the private real-chat dataset from the legacy corpus and add reviewed cases from a
      second tenant. Keep source-dependent knowledge-box and combined cases as explicit gaps until
      a replayable target is found; do not promote knowledge-enabled compression cases by label.
- [ ] Compare against `keepRecentTurns: 1` only if a broader attachment-only sample exposes cases
      where the continuation query and note are insufficient. Do not buy an uncompressed high-token
      replay unless cheaper compressed variants are inconclusive.
- [ ] Do not call context compression robust for attachment-heavy chats until the attachment-only
      case passes and the result is repeated across more than one conversation.

Done:

- Harness: simulated user, judge, answer keys, bootstrap intervals, break-even
  ([`docs/evaluation-harness.md`](evaluation-harness.md)).
- Arms: `all-in-context`, `knowledge-box`, `knowledge-box-no-projections`.
- Parametric corpus generator with size, distractor, depth and hop dials.
- Metadata-only multi-tenant discovery for real conversations; semantic curation stays with the
  coding agent.
- Cache-aware provider usage and cost telemetry, end to end from the provider's usage report to the
  priced total, with full-input fallback when cache details are missing.
- Flip-test machinery: paired corpora (`--flip`), per-run lexical classification, and the paired
  coverage / value-under-absence verdict. Built, unit-tested, and calibrated on a live synthetic
  run.

Initial marker-free result (OpenAI `gpt-4o-mini`, 20 documents × approximately 700 words, seed 1,
five repetitions per half and arm):

- Both arms answered the positive corpus correctly in 5/5 runs, with no positive failures.
- `all-in-context` had 0/5 coverage under absence and emitted the same wrong `4.25%` distractor in
  5/5 negative runs, despite having every document in context.
- `knowledge-box` had 5/5 coverage and 0/5 values under absence. It made at least one
  `knowledge_box__*` call in 10/10 positive and negative runs, so the result reflects retrieval
  rather than an answer recoverable from chat history.
- Mean assistant query cost was 76–77% lower for `knowledge-box` across the two halves. Its roughly
  `$0.0074` per-corpus indexing cost broke even after three conversations at this corpus size.

This is evidence for the thesis at one fixed point, not a general result: repetitions reused one
generated corpus and seed, the assistant ran at temperature zero, and only one model and corpus
size were tested. The next run must vary corpus size and seed rather than merely increasing the
repetition count.

Next, in order:

1. **Run the real-chat failure investigation** using the protocol in
   [`docs/evaluation-harness.md`](evaluation-harness.md). Start with approved offline bundles and
   find both `combined-no-net-gain` and `combined-quality-regression` regions; a failure is the
   desired output of this phase, not a discarded outlier. Use reviewed source claims rather than
   production replies as answer keys, retain a sanitized per-case ledger, and execute the bounded
   first-batch plan before changing any retrieval or compression behavior.
2. **Extend the flip test** to at least two more corpus sizes and a second seed — hypothesis 3, the
   thesis. The marker-free 20-document point strongly favours the knowledge box, but one fixed
   corpus can expose a deterministic distractor preference rather than a general coverage property.
3. **Size sweep** over the generated corpora, to place the crossover and find where the baseline
   degrades — hypotheses 1 and 2. Cache-aware provider usage makes the multi-turn numbers reflect
   real prefix-cache economics; retain the undiscounted counterfactual for a simple upper-bound
   comparison.
4. **Discriminative projections** as a fourth arm — hypothesis 4. The flip test is what makes this
   measurable: exclusion is the thing projections are supposed to buy.
5. **Compression as a synthetic arm**, then compare its failure mechanisms with the real-chat
   ledger — hypothesis 6.

## References

- [When Absence Is Evidence: Completeness-Sensitive Negative Reasoning in LLMs](https://arxiv.org/abs/2608.04591)
- [Over-Searching in Search-Augmented Large Language Models](https://arxiv.org/html/2601.05503)
- [Context Length Alone Hurts LLM Performance Despite Perfect Retrieval](https://arxiv.org/pdf/2510.05381)
- [Lost in Simulation: LLM-Simulated Users are Unreliable Proxies for Human Users](https://arxiv.org/pdf/2601.17087)
- [τ-bench: Tool-Agent-User Interaction Benchmark](https://sierra.ai/blog/benchmarking-ai-agents)
- [Never Lost in the Middle: Position-Agnostic Decompositional Training](https://arxiv.org/pdf/2311.09198)
