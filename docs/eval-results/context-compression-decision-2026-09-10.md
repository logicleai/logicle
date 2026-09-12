# Context compression decision — 2026-09-10

## Decision

The original decision used query-aware prefetch with `keepRecentTurns: 0` as the default. The
decision is superseded by the model-directed default now implemented in the compression planner:
use on-demand `context-retrieve` tools with `keepRecentTurns: 0`; retain prefetch as an explicit
evaluation/configuration arm. Keep the exact originals retrievable through
`context-retrieve.search(query, id)` and the full `get_message(id)` / `get_file(id)` fallbacks.

`keepRecentTurns: 0` means no completed turn is protected wholesale. It does not blindly replace
tiny plain-text messages: the planner leaves those verbatim when an id plus recovery instructions
would be larger than the original. Attachments, recoverable files, large tool results, large
assistant responses, and aggressive-preset long user messages remain the compression targets.

The evaluated task is intentionally one assistant response over a fixed reference chat. This
removes simulated-user trajectory variance: every arm receives the same saved messages,
attachments and tool results, followed by the same final user request. Success is the scenario's
deterministic answer gate; these runs used `--no-judge`.

## Result

| model                  | arm              | runs | success | mean input tokens | mean cache-read tokens | mean cost | mean tool calls |
| ---------------------- | ---------------- | ---: | ------: | ----------------: | ---------------------: | --------: | --------------: |
| `gpt-4.1-mini`         | compression off  |   30 |    100% |             8,977 |                  4,868 |  $0.00215 |             0.0 |
| `gpt-4.1-mini`         | prefetch, keep 0 |   30 |    100% |             2,434 |                    538 |  $0.00083 |             0.0 |
| `gpt-4.1-mini`         | prefetch, keep 1 |   30 |    100% |             5,606 |                  1,399 |  $0.00184 |             0.0 |
| `gpt-5-latest`         | compression off  |   18 |    100% |             8,997 |                  4,361 |   $0.0105 |             0.0 |
| `gpt-5-latest`         | prefetch, keep 0 |   18 |    100% |             2,472 |                    975 |  $0.00357 |             0.0 |
| `gpt-5-latest`         | prefetch, keep 1 |   18 |    100% |             5,825 |                  1,022 |   $0.0104 |             0.1 |
| `claude-sonnet-latest` | compression off  |   18 |    100% |            16,552 |                  5,360 |   $0.0307 |             0.0 |
| `claude-sonnet-latest` | prefetch, keep 0 |   18 |    100% |             5,825 |                  2,269 |   $0.0102 |             0.2 |
| `claude-sonnet-latest` | prefetch, keep 1 |   18 |    100% |            15,697 |                  7,727 |   $0.0233 |             0.4 |

Across the three model matrices, prefetch/keep-0 preserved 66/66 successes while reducing mean
input tokens by 73% on `gpt-4.1-mini`, 73% on `gpt-5-latest`, and 65% on Claude Sonnet. The
corresponding mean cost reductions were 61%, 66%, and 67%. Cache reads and writes are priced
separately where the provider reports them.

Keeping one recent turn uncompressed produced no accuracy improvement in this suite and increased
cost versus keep-0 by 122% (`gpt-4.1-mini`), 191% (`gpt-5-latest`), and 128% (Claude Sonnet). The
data therefore does not support a default uncompressed recent-turn window.

Tool-only keep-0 also reached 100%, but cost more than prefetch/keep-0: 54% more on
`gpt-4.1-mini`, 82% more on `gpt-5-latest`, and 18% more on Claude Sonnet. Targeted retrieval
remains necessary as a fallback, but forcing a model round trip for every omitted fact is not the
efficient default.

## Reference-chat corpus

The six synthetic chats cover exact facts in a recent attachment, a middle-depth attachment, a
long assistant response, a far tool result with a rejected distractor, irrelevant old bulk, and a
mixed far-tool/recent-attachment answer. Their message counts use the p25/p50/p75 shape of the 100
most expensive conversations seen during a read-only 30-day production aggregate:

- message count: p25 6, p50 13, p75 33, p90 52, maximum 128;
- cumulative input tokens: p25 1,132,885, p50 1,877,757, p75 3,917,060, p90 5,977,545;
- total conversation cost: p25 $3.586, p50 $4.931, p75 $9.256, p90 $12.396.

No production message text, title, filename, user/tenant identifier, conversation identifier or raw
row is stored. Only these aggregates informed the deterministic synthetic padding. The saved corpus
lives in `apps/backend/lib/eval/scenarios/contextCompression.ts`; the JSON run artifacts preserve
the evaluated transcripts and usage accounting.

## Evidence and limits

- Full reports: `context-compression-prefetch-gpt-4.1-mini-2026-09-10.md`,
  `context-compression-prefetch-gpt-5-latest-2026-09-10.md`, and
  `context-compression-prefetch-claude-sonnet-latest-2026-09-10.md`.
- Each report has a matching `.runs.json` artifact with scenario, arm, transcript, token usage,
  cache usage, cost and compression diagnostics.
- A focused version-8 Claude regression covers the two cases that had redundant retrieval calls;
  it remains 6/6 successful. Global search no longer sees the current request or its own tool call.
- The corpus is synthetic and small. It validates the mechanism and the current default, not every
  real conversational dependency. Expansion should add anonymized _derived fixtures_, never raw
  production transcripts.
- Cost comparisons use the published [OpenAI API pricing](https://developers.openai.com/api/docs/pricing)
  and [Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing), and exclude
  any contractual discounts.
