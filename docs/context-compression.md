# Context Compression

This document specifies how chat context compression works. It is the source of truth for the
behavior — not a description of history, and not an aspirational design. Implementation lives in
`apps/backend/lib/chat/compression-planner.ts`.

## In breve

La compressione è una seconda rappresentazione della cronologia, usata solo per costruire il
prompt da inviare al modello. La conversazione salvata e la cronologia che il server passa ai tool
restano intatte.

Quando il contesto supera la soglia configurata, il planner guarda i messaggi dei turni precedenti:

- gli allegati nei messaggi dell'utente vengono sostituiti da nome, id, tipo e una breve anteprima
  testuale;
- i risultati dei tool che contengono file vengono sostituiti da riferimenti recuperabili;
- i risultati testuali dei tool troppo grandi vengono ridotti a un'anteprima;
- le risposte lunghe dell'assistente nei turni storici vengono ridotte a un'anteprima;
- con il preset `aggressive`, anche i messaggi testuali lunghi dell'utente vengono abbreviati.

Il turno corrente non viene mai compresso. Per impostazione predefinita, una ricerca lessicale usa
il messaggio corrente per reinserire piccoli estratti rilevanti nei messaggi abbreviati, mantenendo
il ruolo originale. Ogni messaggio abbreviato conserva comunque il proprio id: il modello può
usare `search(query, id)` per altri estratti mirati e `get_message`/`get_file` per l'originale
completo. Se non conosce l'id, `search(query)` cerca nella cronologia della conversazione.

Quindi la compressione non è un riassunto generato da un LLM e non è una cancellazione: è una
proiezione deterministica, con recupero esplicito del dettaglio quando serve.

## Goals

- Persisted chat history is never mutated. Compression only affects what is sent to the model.
- Every historical file or message a summary refers to must stay recoverable via `context-retrieve`.
- The decision of what to send (full vs. summary) is deterministic and synchronous, so it can be
  inspected and tested without a live LLM call.
- Summaries are cheap to produce: deterministic text extraction and truncation, never a model call.
- The current turn is always sent in full. Compression only ever touches history.
- Small conversations are never compressed, regardless of assistant configuration.
- Compression must not spend retrieval/tool-prompt budget when the planner does not apply a plan.

## Trigger and economic guards

The trigger expectation is deterministic and must be checked before any provider call. Given the
same model, message lineage, configuration and tokenizer, `inspect-only` must report the same
`estimatedHistoryTokens`, resolved trigger, eligible messages, planned policies and
`estimatedTokensAfter`. A case is an eligible compression fixture only when the resolved trigger
is crossed _and_ applying the plan reduces the estimated history. A configuration that is enabled
but does not cross the trigger is a valid **no-plan** case, not a failed compression run.

There are two provisional economic guards for the suite:

- do not summarize an individual message when its estimated saving is below **64 tokens**;
- do not apply a compression plan when the aggregate estimated saving is below **384 tokens**.

These values are deliberately guardrails, not proven optima. They are motivated by the first
synthetic boundary sweep (where very small summaries can cost as much as they save once the
retrieval instruction and tool surface are included). That sweep is an initial baseline only: the
64/384 values must be revalidated on reviewed real-chat cohorts, with provider/model and tokenizer
held fixed, before being described as production thresholds. Reports must record both the raw
estimated saving and whether each guard fired; never infer a final threshold from one synthetic
run or from a hand-picked successful case.

When the plan guard does not pass, the prompt must be built from the original history and must not
include `context-retrieve` in the model-visible tool set or system/tool instructions for that
turn. The same omission applies when compression is disabled or when the resolved trigger is not
crossed. `context-retrieve` is included only when a compression plan was actually applied, because
only then can the prompt contain recoverable summaries. This is a prompt-shape invariant to test,
not an optimization that may vary with model behavior.

## Configuration

Per-assistant, stored as `Assistant.contextCompression` (`contextCompressionConfigSchema`, in
`packages/core/src/types/dto/assistant.ts`):

```ts
type ContextCompressionConfig = {
  preset: 'conservative' | 'aggressive'
  triggerAtTokens?: number
  keepRecentTurns?: number
  retrievalMode?: 'tool' | 'prefetch'
} | null
```

`contextCompression: null` disables compression entirely for that assistant — history is always
sent in full (subject to the ordinary token-budget truncation in `truncateChat`, which is a
separate mechanism). This is the default for new assistants
(`contextCompressionConfigSchema.optional().default(null)`).

- **`preset`** (required once compression is enabled) — `'conservative'` or `'aggressive'`. Picks
  the size thresholds used by `planMessageCompression` (see the preset table below). There is no
  third "off" value at this level — set the whole config to `null` to disable instead.
- **`triggerAtTokens`** (optional, positive integer) — assistant-specific override that can only
  _raise_ the server-wide token floor described below, never lower it. Leave unset to just use the
  floor as-is.
- **`keepRecentTurns`** (optional, non-negative integer) — number of completed turns immediately
  before the current turn to leave verbatim. The measured default is `0`: in the fixed-reference
  suite, retaining one turn preserved accuracy but raised mean input from 2,434 to 5,606 tokens.
  This is an algorithm/evaluation knob; the assistant editor currently preserves it but does not
  expose a dedicated control.
- **`retrievalMode`** (optional) — `prefetch` (default) adds small query-relevant excerpts to
  compressed messages before the model call; `tool` leaves retrieval entirely to the model. Full
  originals remain available through `context-retrieve` in both modes. This field is preserved by
  the editor but currently has no dedicated control.

### Server-Wide Floor: `CHAT_CONTEXT_COMPRESSION_TRIGGER_TOKENS`

Regardless of preset or per-assistant `triggerAtTokens`, compression never runs below a
server-configured floor — this guarantees short conversations are always sent in full, on every
assistant, without relying on each assistant's config being set sensibly.

- **Env var:** `CHAT_CONTEXT_COMPRESSION_TRIGGER_TOKENS` (integer, in estimated tokens).
- **Default:** `6000` if unset or unparsable (`packages/core/src/env.ts`, `env.chat.contextCompressionTriggerTokens`).
- **Resolution:** `resolveCompressionTriggerTokens(triggerAtTokens)` in `compression-planner.ts`
  returns `Math.max(triggerAtTokens ?? 0, env.chat.contextCompressionTriggerTokens)` — the env var
  is a hard floor, and an assistant's `triggerAtTokens` is only ever honored when it's _higher_ than
  that floor:

```ts
// env.chat.contextCompressionTriggerTokens == 6000 (default)
resolveCompressionTriggerTokens(undefined) // → 6000 (the floor)
resolveCompressionTriggerTokens(500) // → 6000 (500 is below the floor, floor wins)
resolveCompressionTriggerTokens(20000) // → 20000 (above the floor, honored)
```

The estimate itself is the real, tokenizer-based count from `estimateHistoryMessageCosts`
(`token-estimator.ts`) — the same estimator `truncateChat` uses for the actual budget window — not
a cheap `chars/4`-style approximation, so the trigger decision, the truncation window, and the
token-savings numbers all agree with each other.

**Example:** an assistant has `contextCompression: { preset: 'conservative' }` (no
`triggerAtTokens`), and the server runs with the default floor. A conversation with two short turns
and no attachments — a few hundred tokens — is always sent in full. Compression only starts
considering messages once the estimated raw prompt size reaches 6000 tokens. If an operator raises
`CHAT_CONTEXT_COMPRESSION_TRIGGER_TOKENS` to `20000`, every assistant on that server — including
ones with a lower `triggerAtTokens` configured — now waits until 20000 estimated tokens before
compression kicks in at all.

## Presets: `conservative` vs `aggressive`

There are exactly two presets, both implemented entirely inside `planMessageCompression`
(`compression-planner.ts`). A preset only changes _size thresholds_ for historical messages — it
never changes what counts as "current turn" (see below) and never triggers a model call. There is
no per-field customization beyond `triggerAtTokens`: everything else about a preset's behavior is
fixed by these two constants:

```ts
const LARGE_TEXT_THRESHOLD_CHARS = 2000 // conservative
const AGGRESSIVE_LARGE_TEXT_THRESHOLD_CHARS = 800 // aggressive
```

| Rule (applied to historical messages only)                        | `conservative`                        | `aggressive`                                                                                             |
| ----------------------------------------------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Current turn (last user/user-response message + everything after) | always `full`, no exceptions          | always `full`, no exceptions — **identical to conservative; this preset never touches the current turn** |
| Historical `user` message **with attachments**                    | `summary`                             | `summary`                                                                                                |
| Historical `user` message, **long plain text, no attachments**    | `full` (left alone)                   | `summary` if `content.length > 800`                                                                      |
| Historical `tool` result **with a recoverable file**              | `summary`                             | `summary`                                                                                                |
| Historical `tool` result, **large text-only output**              | `summary` if estimated chars `> 2000` | `summary` if estimated chars `> 800`                                                                     |
| Historical `assistant` response, **large text**                   | `summary` if estimated chars `> 2000` | `summary` if estimated chars `> 800`                                                                     |
| Everything else (short historical text, no attachments/files)     | `full`                                | `full`                                                                                                   |

Before these shape rules run, every message belonging to one of the configured
`keepRecentTurns` completed turns is assigned `full`.

In short: **`aggressive` is a strict superset of `conservative`** — every message `conservative`
would summarize, `aggressive` also summarizes, plus two extra cases (long historical plain-text
user messages, and smaller historical tool outputs down to 800 chars instead of 2000). There is no
`aggressive`-only behavior on attachments, files, or the current turn; both presets treat those
identically. The one place `aggressive` differs qualitatively rather than just numerically is rule
2 (`hasLargeText` in `planMessageCompression`) — that check is gated on
`preset === 'aggressive'` entirely, so `conservative` never fires it no matter how long the text is.

**A common misconception worth stating explicitly: `aggressive` does _not_ summarize attachments or
tool results in the current turn.** The "current turn is never compressed" rule in
`planMessageCompression` is checked first and unconditionally, before any preset-specific logic —
there is no code path, under any preset, that assigns `policy: 'summary'` to a current-turn message.
If you need to keep the model from re-reading a huge attachment _just uploaded in this turn_, that
is not something either preset controls; it would require a different mechanism (e.g. the ordinary
token-budget truncation in `truncateChat`, or advising the user to start a fresh conversation).

**Choosing a preset:**

- **`conservative`** — pick this when tool outputs and attachments are the main cost driver and
  historical conversational text is short and cheap to keep verbatim (e.g. mostly short questions,
  large tool/file payloads). Preserves more of the model's own past reasoning text untouched.
- **`aggressive`** — pick this when conversations run very long and include large blocks of pasted
  text from the user (long historical messages, not just files), or when a stricter savings target
  is worth targeted prefetch or `context-retrieve` recovering detail more often.

## Current Turn Is Never Compressed

The **current turn** is the last `user`/`user-response` message and everything sent after it
(assistant text, tool calls, tool results). Every message in the current turn always gets policy
`full` — this is a hard invariant enforced by `planMessageCompression`, not a preference that a
preset can override. `aggressive` compacts historical messages more eagerly (see below); it never
reaches into the current turn.

```ts
// preset: 'aggressive', message is the *last* user message in the conversation
{
  messageId: 'u-current',
  policy: 'full',
  reason: 'current turn is never compressed',
  estimatedTokensBefore: 42,
  estimatedTokensAfter: 42,
}
```

A message stops being "current turn" as soon as a later `user`/`user-response` message exists —
from that point on, it is eligible for summarization on the next prompt build.

## The Decision: `planMessageCompression`

A pure, synchronous function. Given the full message history and a preset, it returns one
`MessageCompressionDecision` per message:

```ts
interface MessageCompressionDecision {
  messageId: string
  policy: 'full' | 'summary'
  reason: string
  estimatedTokensBefore: number
  estimatedTokensAfter: number
}
```

It reads no DB state and makes no I/O calls — it only looks at each message's own shape, size, and
recency relative to the current turn. Decision rules, in order:

1. **Current turn → always `full`.** (see above)
2. **Configured recent completed turns → `full`.**
3. **Historical `user` message with attachments → `summary`.**
4. **Historical `user` message with a long text body (aggressive preset only) → `summary`.**
   Conservative preset leaves long historical text messages alone unless they carry attachments.
5. **Historical `tool` message whose result carries a recoverable file → `summary`.**
6. **Historical `tool` message with a large text-only result → `summary`.** The size threshold is
   2000 characters under `conservative`, 800 under `aggressive` — `aggressive` summarizes smaller
   historical tool output than `conservative` does. Neither preset changes what happens to the
   current turn.
7. **Historical `assistant` message with large text → `summary`.** It uses the same preset-specific
   threshold as tool text.
8. Everything else → `full`.

### Policy Decisions Are Turn-Stable

Crucially, the decision for a historical message never looks at what the _current_ message says.
A message that mentions a historical file by name (`"what's on page 2 of report.pdf?"`) does
**not** flip that historical message back to `full` — the compaction decision never depends on the
current message's content. With `keepRecentTurns > 0`, an eligible turn changes once from `full` to
`summary` when it ages out of the recent window. The cached base summary remains stable after that.

This is deliberate, for two reasons:

- **Prompt caching.** The policy and cached base summary remain stable. In default `prefetch` mode,
  only the small excerpts appended to that base depend on the current request, so the provider may
  lose part of the shared prefix. This trade-off is included in reported cache-read tokens and was
  still cheaper in the measured suite. `retrievalMode: 'tool'` keeps the base prefix stable.
- **Simplicity.** A per-turn, content-dependent override is one more thing to reason about, test,
  and get wrong (fuzzy name matching, false positives on common words, etc.) for a case the model
  can already handle itself.

If prefetch is insufficient, the model first calls `search(query, id)` for focused excerpts, then
`get_message(id)` or `get_file(id)` only when the full original is necessary. With function-name
prefixing enabled (the default), the provider-facing names are
`context-retrieve__get_message`, `context-retrieve__get_file` and `context-retrieve__search`.

## Building the Summary: `applyCompressionPlan`

Given the decisions above, `applyCompressionPlan` rewrites the message list: `full` messages pass
through unchanged; `summary` messages are replaced by a compact, cached representation. In
`prefetch` mode, deterministic lexical ranking then appends up to 6,000 characters of matching
excerpts from compressed messages. Excerpts stay in the original message role; no
historical tool output is promoted to a system or user instruction. The current user's non-empty
text is the query. For an attachment-only turn with an empty text body, prefetch falls back to the
nearest preceding non-empty user request so the uploaded file remains connected to the task it
continues. The prompt builder also adds a bounded continuation note to that otherwise-empty current
user message, making the relationship explicit instead of expecting the model to infer a task from
retrieved historical excerpts alone. The continuation note is also present in `tool` mode, while
the historical excerpts remain exclusive to `prefetch` mode. This changes only query-dependent
prompt content, never the planner's stable decisions or cached base summaries.

### Summaries Are Always Plain Text

There is no model call anywhere in this path. A summary is one of:

- **Deterministic text extraction** of a file (via the existing `cachingExtractor`, the same
  extractor used for native-attachment fallback elsewhere), truncated to 500 characters.
- **Truncation** of an overly long text block, with a marker stating how many characters were
  omitted and requiring retrieval before omitted details are used.
- **A fixed fallback string** when neither applies — e.g. `Image file; no text preview available.`
  for images (there is no text to extract from an image), or `No extractable text preview available for this file type.` when extraction fails or returns nothing.

This means an image can never be described by a vision-model call as part of compression — if the
model needs to actually see the image, that only happens via `full` policy or `context-retrieve`.

### The `context-retrieve` Tool

Constructed whenever `contextCompression` is set (`apps/backend/lib/tools/context-retrieve/`), but
exposed to the model only on turns where an economic compression plan is actually applied, this is
the recovery surface for anything compression touched:

- **`get_file(id)`** — read a file's content by id (DB-authorized via `canAccessFile`, same as
  before this tool was renamed from `retrieve-file`).
- **`get_message(id)`** — return a message's _original, uncompressed_ content by message id.
  Operates directly on the live `messages` array already passed to every tool call
  (`ChatState.chatHistory`, which compression never touches) — no DB access, no extra
  authorization needed beyond already being inside this conversation.
- **`search(query, id?)`** — with an id, lexically ranks chunks from that exact original message or
  file and returns only the best excerpts; without an id, searches this conversation's messages
  and returns ids with short snippets. It is deliberately scoped to this conversation, not a
  knowledge-base or cross-conversation search.

### File Recovery Reference

Every summary that omits a recoverable file's real content includes a stable, uniformly-formatted
reference:

```
File available on demand: documento_semplice.docx
id: xXj3tBxkt4CTy80XL1rFF
type: application/vnd.openxmlformats-officedocument.wordprocessingml.document
summary: Documento semplice: contains a title and one paragraph.
[EXACT CONTENT OMITTED] If the user's request could depend on omitted content, you MUST call the search function of the context-retrieve tool with { "id": "xXj3tBxkt4CTy80XL1rFF", "query": "<terms from the request>" } before answering. Use get_file only if the targeted excerpts are insufficient.
```

Built by `buildFileRecoveryReference(fileRef, summary)`. `fileRef` is a `CompressionFileRef`:

```ts
interface CompressionFileRef {
  id: string
  name: string
  mimetype: string
  size: number
  origin: 'uploaded' | 'generated'
  sourceMessageId: string
}
```

### Every Summary Exposes Its Own Message Id

A file reference alone isn't enough — plenty of summarized content has no file at all (a long
historical user message, a large plain-text tool result). Every `summary`-policy message therefore
also gets its own recovery line, appended by `buildMessageRecoveryNote(messageId)`:

```
[EXACT CONTENT OMITTED] Full original message id: u-old-1. If the user's request could depend on omitted content, call search with this id and focused terms before answering. Use get_message only if targeted excerpts are insufficient.
```

This is unconditional: it's present whether or not the message also carries file references, so
there is never a summarized message the model can't ask to see in full.

### Example: Compressing a Historical Tool Result

Before (a tool message from three turns ago, now historical):

```json
{
  "id": "t-docx",
  "role": "tool",
  "parts": [
    {
      "type": "tool-result",
      "toolCallId": "call-docx",
      "toolName": "office_script",
      "result": {
        "type": "content",
        "value": [
          { "type": "text", "text": "Published 1 resource(s): documento_semplice.docx" },
          {
            "type": "file",
            "id": "file-docx",
            "mimetype": "application/vnd...wordprocessingml.document",
            "name": "documento_semplice.docx",
            "size": 3173
          }
        ]
      }
    }
  ]
}
```

After:

```json
{
  "id": "t-docx",
  "role": "tool",
  "parts": [
    {
      "type": "tool-result",
      "toolCallId": "call-docx",
      "toolName": "office_script",
      "result": {
        "type": "text",
        "value": "[Tool output summarized for context efficiency. A retrieval call is mandatory whenever the request could depend on exact omitted values.]\n\nFile available on demand: documento_semplice.docx\nid: file-docx\ntype: application/vnd...wordprocessingml.document\nsummary: Documento semplice: contains a title and one paragraph.\n[EXACT CONTENT OMITTED] Search this file id with focused terms before answering; use get_file only if targeted excerpts are insufficient.\n\n[EXACT CONTENT OMITTED] Full original message id: t-docx. Search this message id with focused terms before answering; use get_message only if targeted excerpts are insufficient."
      }
    }
  ]
}
```

The `[Tool output summarized for context efficiency. ...]` overview line is a fixed constant
(`TOOL_RESULT_OVERVIEW`) — it does not depend on any separately-generated narrative summary.

### Generated Artifacts: Redacting Duplicated Content

A generated file's content sometimes also appears in the _assistant's own tool-call arguments_
(e.g. a document-generation tool where `args.code` embeds the full document body). If that tool
result gets summarized, the sibling assistant message's matching `tool-call.args` fields are
redacted too — otherwise the "summarized" content is trivially still visible one message earlier.

```json
// before
{ "type": "tool-call", "toolCallId": "call-docx", "toolName": "office_script",
  "args": { "code": "const h = createDocx({ ... 400 chars of paragraph text ... });" } }

// after (tool-result for call-docx was summarized)
{ "type": "tool-call", "toolCallId": "call-docx", "toolName": "office_script",
  "args": { "code": "[redacted: content available via context-retrieve, see summarized result]" } }
```

Any string field over 200 characters in the args of a redacted tool-call is replaced by this
marker; short fields (like a `prompt` argument) are left alone.

### Example: Compressing a Historical User Attachment

```json
// before
{ "id": "u-old-1", "role": "user", "content": "Please inspect this file.",
  "attachments": [{ "id": "file-123", "mimetype": "application/pdf", "name": "report.pdf", "size": 1024 }] }

// after
{ "id": "u-old-1", "role": "user",
  "content": "File available on demand: report.pdf\nid: file-123\ntype: application/pdf\nsummary: The report covers Q1 revenue.\n[EXACT CONTENT OMITTED] Search this file id with focused terms before answering; use get_file only if targeted excerpts are insufficient.\n\nPlease inspect this file.\n\n[EXACT CONTENT OMITTED] Full original message id: u-old-1. Search this message id first; use get_message only if needed.",
  "attachments": [] }
```

## Compression Starts on Save

Building a summary requires I/O (reading a file, running a text extractor) — expensive enough that
paying for it synchronously during prompt construction would add latency to every historical turn
that needs it. Instead, `warmCompressionCache` is kicked off (fire-and-forget) as soon as a message
is persisted, from `apps/backend/models/message.ts`'s `saveMessage`:

```ts
await db.transaction().execute(/* insert the message */)
void import('@/backend/lib/chat/compression-planner').then(({ warmCompressionCache }) =>
  warmCompressionCache(message)
)
```

`warmCompressionCache` checks eligibility with no I/O (attachments present? tool-result carries a
file or a large text blob?) and, only if eligible, builds and caches the compact representation
right away — before the message could ever become historical. By the time a later turn's prompt
build needs to compress that message, `applyCompressionPlan` finds the cached row and reuses it
instead of re-extracting anything.

This is best-effort and never affects message persistence: failures are caught and logged, never
thrown back at the save path.

### Building a Message's Summary Only Happens Once at a Time

Because `warmCompressionCache` is fire-and-forget, it isn't awaited by anything — a prompt build
for a _different_, concurrent request can decide it needs to compress the same message before the
warm-up has finished. `getCompressedMessage`/`saveCompressedMessage` alone make that safe (the
table upserts on `(sourceMessageId, compressionVersion)`), but not free: without anything else,
both callers would redundantly re-read the file and re-run the text extractor.

`compressOnce(messageId, build)` closes that gap with an in-process, in-memory map of in-flight
builds keyed by message id: the second caller joins the first caller's promise instead of starting
a new build. Every place that can build a message's compressed form — both branches of
`applyCompressionPlan` and both branches of `warmCompressionCache` — goes through it. This only
dedupes within a single server process; a build that's genuinely concurrent across two processes
still just lands on the same cache row safely, without the join.

## Message-Level Compression, Cached

The compression unit is the persisted DB message, not sub-parts of it — this keeps the compressed
representation aligned with what's inspectable in the database. A compressed message is a cached
`CompressedMessage` row:

```sql
CompressedMessage
- sourceMessageId TEXT not null references Message(id)
- compressionVersion INTEGER not null
- content TEXT not null   -- JSON: fields to overlay onto the source message
- version INTEGER
- createdAt TEXT not null
- updatedAt TEXT not null

unique(sourceMessageId, compressionVersion)
```

`compressionVersion` (currently `COMPRESSION_VERSION = 8` in `compression-planner.ts`) is bumped
whenever the summary-building rules change, so old cached rows are naturally ignored rather than
served stale. Applying a cached row is a plain overlay:

```ts
const compressedMessage = { ...sourceMessage, ...cachedRow.content }
```

## Flow Summary

```
message saved to DB
  └─ warmCompressionCache(message)         [fire-and-forget, best-effort]
       └─ builds & caches CompressedMessage if eligible

prompt build (ChatAssistant.invokeLlm)
  ├─ estimateHistoryMessageCosts(model, messages) total >= resolveCompressionTriggerTokens(config.triggerAtTokens)?
  │    no  → send messages as-is
  │    yes ↓
  ├─ planMessageCompression(messages, preset)       → MessageCompressionDecision[]
  ├─ discard per-message savings < 64 tokens; apply only if aggregate saving >= 384
  │    no  → send original messages; omit context-retrieve from the prompt/tool set
  │    yes ↓
  ├─ applyCompressionPlan(messages, decisions, current-query options)
  │    full    → message unchanged
  │    summary → cached CompressedMessage row, or built + cached now
  │    prefetch→ matching excerpts appended in the original message role
  ├─ truncateChat(...)                              [separate token-budget window, unchanged]
  └─ buildHistorySegments(...) → dtoMessageToLlmMessage(...) → provider payload
```

Provider conversion (`conversion.ts`) never sees a compression decision — a summarized message
simply no longer contains raw `file` items or attachments, so there is nothing for a provider
adapter to "upgrade" back to native image/file content. `full` messages are converted exactly as
they always were.

## Test Matrix

Covered in `apps/backend/lib/chat/__tests__/compression-planner.test.ts`:

- Current turn stays `full` under both presets.
- The configured number of recent completed turns stays `full` as one unit.
- A historical attachment is summarized once a later turn starts.
- A historical message's decision does not change when a later user message names that file.
- Large historical tool text is summarized; `aggressive` lowers the size threshold.
- `resolveCompressionTriggerTokens` never drops below the floor, honors a higher assistant setting.
- A summarized tool result redacts duplicated content from the sibling assistant tool-call args.
- A generated image summary never triggers a model call and never becomes `image-data`.
- `full`-policy messages still convert exactly as before (native bytes/text-extraction fallback).
- Failed text extraction falls back to deterministic minimal text, never blocks compaction.
- Every `summary`-policy message carries a mandatory-retrieval line naming `context-retrieve`'s
  targeted `search` function, with full-message/file retrieval as fallback.
- Query-aware prefetch inserts a relevant excerpt into the compressed message's original role.
- Attachment-only continuation prefetch falls back to the nearest non-empty user request and
  recovers the preceding task from a compressed answer.
- `warmCompressionCache` builds/caches eligible messages and no-ops on ineligible ones, without
  throwing on failure.
- A concurrent build for the same message joins the in-flight one instead of duplicating work.
- Boundary fixtures just below and just above the resolved trigger, including histories with no
  eligible messages.
- Incompressible fixtures: short messages, short attachments, and plans whose
  per-message saving is below 64 tokens or aggregate saving is below 384 tokens. These must remain
  `full`/no-plan and must not expose `context-retrieve` to the model.
- Deterministic expectation fixtures assert trigger/application state, estimated before/after
  totals, and summary counts; economics unit tests cover the per-message and aggregate guards.

`apps/backend/lib/tools/context-retrieve/__tests__/implementation.test.ts` covers the tool itself:
`get_file`, `get_message`, and `search`, including targeted lexical search inside one message or
authorized file without replaying its irrelevant bulk.

## Behavioral Regression Benchmark

The unit tests above validate the planner and the transformed message shape. They do not prove that
an LLM can solve a task after the relevant content has been removed from the prompt. That question
has a release-smoke benchmark in `__tests__/contextCompressionBenchmark.test.ts` and a comparative,
numeric suite in the goal-driven eval harness.

The benchmark uses real provider calls and is skipped by default. Enable it with:

```bash
RUN_LLM_INTEGRATION=1 pnpm vitest run __tests__/contextCompressionBenchmark.test.ts
```

It first checks deterministically that the planted message is actually assigned `summary`, then
asks a real model to recover facts from the compressed history. The assertions require both the
correct answer and evidence that the appropriate recovery tool was called, which prevents a lucky
guess from passing. The scenarios currently cover:

- recovering metadata from a large historical tool result through `get_message`;
- recovering multiple facts from one uploaded document through `get_file`;
- combining facts from two independently compressed documents.

This test is intentionally an integration benchmark, not a stable quality score: provider/model
versions, tool-calling behavior and network conditions can affect it. Keep the deterministic
preconditions and retrieval assertions strict; use a small provider matrix for release smoke tests
and run broader model comparisons separately.

For the accuracy/cost decision, use the saved-reference, single-message suite:

```bash
OPENAI_API_KEY=... npx tsx apps/backend/scripts/eval.ts \
  --suite context-compression --repeat 5 \
  --runs-out context-compression-runs.json --out context-compression-report.md
```

By default it compares compression off, tool-only retrieval with no recent window, and prefetch
with recent windows of 0 and 1. Explicit `compression-keep-{1,2,4}` arms remain available for wider
window sweeps. The primary cost estimate uses provider usage, including prompt-cache read/write
token details as cache-aware pricing telemetry when available. Missing cache telemetry degrades
the affected input to the full configured input price. The report also shows an
undiscounted/full-price counterfactual; it is not the primary total. Raw runs are stored so the
same evidence can be re-reported without another model call.

## Relevant Files

- `apps/backend/lib/chat/compression-planner.ts` — `planMessageCompression`, `applyCompressionPlan`,
  `warmCompressionCache`, `resolveCompressionTriggerTokens`.
- `apps/backend/lib/chat/context-search.ts` — deterministic lexical ranking shared by prefetch and
  targeted retrieval.
- `apps/backend/lib/chat/index.ts` — wires compression into `ChatAssistant.invokeLlm`.
- `apps/backend/models/message.ts` — calls `warmCompressionCache` after `saveMessage`.
- `apps/backend/models/compressed-message.ts` — `CompressedMessage` cache reads/writes.
- `apps/backend/lib/tools/context-retrieve/implementation.ts` — `get_file`, `get_message`, `search`;
  the tool referenced by every summary.
- `apps/backend/lib/chat/message-projection.ts` — `renderMessagePlainText`, used by `get_message`
  and `search` to render a message's original content as plain text.
- `packages/core/src/types/dto/compression.ts` — `CompressionFileRef`, `MessageCompressionDecision`.
- `packages/core/src/types/dto/assistant.ts` — `ContextCompressionPreset`, `ContextCompressionConfig`
  (the `Assistant.contextCompression` field's schema).
- `packages/core/src/env.ts` — `env.chat.contextCompressionTriggerTokens`, the
  `CHAT_CONTEXT_COMPRESSION_TRIGGER_TOKENS`-backed server-wide floor.
- `apps/frontend/app/assistants/components/AdvancedTabPanel.tsx` — the assistant-editor UI for
  `preset`/`triggerAtTokens`; copy lives in `apps/frontend/locales/{en,it}/logicle.json` under the
  `context-compression-*` keys.
