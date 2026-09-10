# Evaluation harness

## Goal

Measure whether one of Logicle's retrieval or context strategies is actually better than another,
and by how much, in the only two units that matter: did the user get what they came for, and what
did it cost.

Logicle is accumulating algorithms whose value is an empirical question — knowledge boxes, context
compression, sub-assistants, routing. Each one trades tokens for accuracy somewhere, and none of
them can be evaluated by reading the code. This harness exists so that "is the knowledge box worth
it" has an answer with a number attached.

## Model

An LLM impersonates a user pursuing a goal, and talks to a real Logicle assistant until it decides
the goal is met, gives up, or runs out of turns. The same scenario is replayed against several
**arms** — alternative assistant configurations — and the arms are compared.

```mermaid
flowchart LR
  S[Scenario: corpus, goal, persona, rubric] --> U[Simulated user LLM]
  S --> A[Arm setup]
  A --> C[ChatAssistant]
  U -->|next message| C
  C -->|reply + usage| U
  C --> T[Transcript + token counts]
  T --> D[Answer key check]
  T --> J[Judge LLM]
  D --> R[Report]
  J --> R
```

The assistant under test is the real `ChatAssistant`, driven in-process against a throwaway SQLite
database with real files in storage. Ingestion, retrieval, preamble construction and token
accounting are the production code paths — the only substitutions are the human at one end and the
reviewer at the other.

## The wall between the user and the grader

The simulated user receives the goal and the persona. It never receives the rubric or the answer
key.

This is the single property the harness is built around. A simulated user that knows the answer
asks "so the penalty is 2.4%, right?", and from that moment every arm passes — including one that
retrieves nothing at all. The same applies to the exit condition: the simulated user decides only
whether it was _answered_, never whether the answer was _right_, because judging correctness would
require it to know the answer. `apps/backend/lib/eval/__tests__/simulatedUser.test.ts` asserts the
answer key never reaches its prompt.

Grading happens afterwards, in two passes:

- **The answer key** is a deterministic substring check over the assistant's own turns — what the
  user said is excluded, so a leaked answer cannot pass it. It is a hard gate: a run that never
  said the required fact scores zero, no matter how well it reads. `mustNotMention` catches the
  failure mode that matters most here, which is a confident answer taken from the wrong document.
- **The judge** is an LLM that grades how well the goal was served. It runs for every non-error
  transcript; the deterministic gate still controls the final score. The judge receives no arm
  metadata or tool-call/result parts.

The raw run artifact stores both verdicts; the markdown report shows their combined score. When
they disagree, the scenario is usually underspecified.

## Tool visibility

The assistant under test receives the real tool-call and tool-result parts in its next-turn
history, exactly as production does. The simulated user and judge receive a text-only transcript:
user messages and assistant text. Tool names are retained only as run metrics, not injected into
either LLM prompt. This keeps tool activity from revealing an arm directly to the judge.

## Arms

An arm is `setup(context) → { tools, knowledge, systemPromptSuffix?, setupCost? }`. Three ship
with the harness:

| arm                            | what it does                                                                                        |
| ------------------------------ | --------------------------------------------------------------------------------------------------- |
| `all-in-context`               | every document attached as assistant knowledge, sent in the preamble every turn — today's behaviour |
| `knowledge-box`                | documents reachable only through the `knowledge_box` tool, with ingestion questions                 |
| `knowledge-box-no-projections` | the same, with no ingestion questions — isolates chunk retrieval from projections                   |

Anything expressible as "same scenario, different assistant configuration" belongs here. An arm
can return `assistant.contextCompression` to compare compression on versus off; two chunk sizes
are two arms. Adding one does not touch the runner.

## Counting the cost of building an index

An arm that prepares something reports a `setupCost`, and the knowledge box arm reports the tokens
its ingestion questions actually consumed — which is why `computeProjections` returns usage.

Without this the comparison would be dishonest in the knowledge box's favour: it is cheap to query
precisely because it was expensive to build, and quoting only the per-conversation saving hides
the whole other side of the trade. The report therefore derives a **break-even point**: how many
conversations the index has to serve before it has paid for itself. A box that breaks even after
four conversations is obviously worth building; one that breaks even after eight hundred is not,
and the per-conversation figures look identical in both cases.

## Not lying about small samples

Repeated runs of the same scenario against the same arm vary a lot. Reporting one run per arm and
declaring a winner is the main way benchmarks like this mislead.

So `--repeat` defaults to 3, differences are reported as a percentile bootstrap interval on the
difference in means, and any difference whose interval contains zero is printed as _not separable
at this sample size_ rather than as a result. With fewer than two runs per arm the harness refuses
to claim separability at all and says so at the bottom of the report. The bootstrap RNG is seeded,
so re-rendering a report from stored runs gives the same intervals.

`--runs-out` writes a versioned artifact with the raw run records and run metadata (revision,
models, arms, scenarios and sweep configuration). Re-render it without an API key with
`--runs-in runs.json --out report.md`; this also accepts the legacy raw-run-array format.

## Running it

```bash
# Everything, three repetitions
OPENAI_API_KEY=... npx tsx apps/backend/scripts/eval.ts --repeat 3

# One scenario, two arms, watch the conversation happen
OPENAI_API_KEY=... npx tsx apps/backend/scripts/eval.ts \
  --scenario supplier-penalty --arms all-in-context,knowledge-box \
  --repeat 5 --verbose --out report.md --runs-out runs.json
```

The runner creates its own SQLite database and storage directory under the system temp dir and
removes them afterwards. It needs no server and touches no existing database.

Flags are documented in the header of `apps/backend/scripts/eval.ts`. The ones that matter:
`--repeat`, `--arms`, `--baseline`, `--model`, `--user-model`, `--judge-model`, `--no-judge`,
`--runs-out`, and `--runs-in`.

## Scenarios from real conversations

Hand-written scenarios drift towards what their author already believes the system is good at.
`apps/backend/scripts/eval-mine-scenarios.ts` reads a Logicle database snapshot and proposes
scenario drafts from conversations people actually had — goal, persona, rubric, and candidate
facts copied verbatim from the assistant's answers.

```bash
OPENAI_API_KEY=... npx tsx apps/backend/scripts/eval-mine-scenarios.ts \
  --db /path/to/snapshot.sqlite --limit 20 --out drafts.json
```

Two things about this are deliberate:

- **It produces drafts, not scenarios.** An answer key has to be true of the corpus, and only
  someone who can read the source documents can confirm that. Every draft carries
  `needsReview: true` and its `candidateFacts` are proposals.
- **Point it at a snapshot, not at production.** `logicle-infra-deploy`'s
  `cli/backup_db_to_sqlite_native` produces a suitable SQLite file. The drafts contain verbatim
  user and assistant text: the output file is production data and belongs wherever that tenant's
  data is allowed to live.

## Layout

| path                         | what it is                               |
| ---------------------------- | ---------------------------------------- |
| `lib/eval/types.ts`          | scenario, arm, run result                |
| `lib/eval/harness.ts`        | drives one (scenario, arm) run           |
| `lib/eval/simulatedUser.ts`  | the LLM playing the user                 |
| `lib/eval/judge.ts`          | the LLM grading transcripts              |
| `lib/eval/metrics.ts`        | answer key, totals, scoring — pure       |
| `lib/eval/stats.ts`          | seeded RNG, bootstrap intervals — pure   |
| `lib/eval/cost.ts`           | model pricing — pure                     |
| `lib/eval/report.ts`         | aggregation, break-even, markdown — pure |
| `lib/eval/arms.ts`           | the shipped arms                         |
| `lib/eval/scenarios/`        | scenario definitions                     |
| `lib/eval/scenarioMining.ts` | real conversation → scenario draft       |

Everything marked pure is unit-tested and needs no API key.

## Open

- **The corpus is synthetic.** `supplierContracts.ts` is built to have the right shape — one needle,
  four near-identical distractors, realistic boilerplate — but it is not a real corpus. Mining real
  scenarios is the intended next step, and the answer keys they produce need a human pass.
- **One provider at a time.** The assistant, the simulated user and the judge all run on the same
  provider. Using a different model family for the judge would reduce the risk of a model
  preferring its own phrasing.
- **Setup cost is paid per repetition.** Ingestion runs once per run rather than once per arm, so
  wall-clock time scales with `--repeat` more than it needs to. It does not distort the reported
  numbers, since setup cost is reported per-arm rather than summed.
