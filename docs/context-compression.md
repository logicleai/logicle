# Context Compression

This document specifies how chat context compression works. It is the source of truth for the
behavior — not a description of history, and not an aspirational design. Implementation lives in
`apps/backend/lib/chat/compression-planner.ts`.

## Goals

- Persisted chat history is never mutated. Compression only affects what is sent to the model.
- Every historical file or message a summary refers to must stay recoverable via `context-retrieve`.
- The decision of what to send (full vs. summary) is deterministic and synchronous, so it can be
  inspected and tested without a live LLM call.
- Summaries are cheap to produce: deterministic text extraction and truncation, never a model call.
- The current turn is always sent in full. Compression only ever touches history.
- Small conversations are never compressed, regardless of assistant configuration.

## Configuration

Per-assistant, stored as `Assistant.contextCompression` (`contextCompressionConfigSchema`, in
`packages/core/src/types/dto/assistant.ts`):

```ts
type ContextCompressionConfig = {
  preset: 'conservative' | 'aggressive'
  triggerAtTokens?: number
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
  *raise* the server-wide token floor described below, never lower it. Leave unset to just use the
  floor as-is.

### Server-Wide Floor: `CHAT_CONTEXT_COMPRESSION_TRIGGER_TOKENS`

Regardless of preset or per-assistant `triggerAtTokens`, compression never runs below a
server-configured floor — this guarantees short conversations are always sent in full, on every
assistant, without relying on each assistant's config being set sensibly.

- **Env var:** `CHAT_CONTEXT_COMPRESSION_TRIGGER_TOKENS` (integer, in estimated tokens).
- **Default:** `6000` if unset or unparsable (`packages/core/src/env.ts`, `env.chat.contextCompressionTriggerTokens`).
- **Resolution:** `resolveCompressionTriggerTokens(triggerAtTokens)` in `compression-planner.ts`
  returns `Math.max(triggerAtTokens ?? 0, env.chat.contextCompressionTriggerTokens)` — the env var
  is a hard floor, and an assistant's `triggerAtTokens` is only ever honored when it's *higher* than
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
(`compression-planner.ts`). A preset only changes *size thresholds* for historical messages — it
never changes what counts as "current turn" (see below) and never triggers a model call. There is
no per-field customization beyond `triggerAtTokens`: everything else about a preset's behavior is
fixed by these two constants:

```ts
const LARGE_TEXT_THRESHOLD_CHARS = 2000            // conservative
const AGGRESSIVE_LARGE_TEXT_THRESHOLD_CHARS = 800  // aggressive
```

| Rule (applied to historical messages only)                       | `conservative`                          | `aggressive`                            |
| ------------------------------------------------------------------ | ---------------------------------------- | ----------------------------------------- |
| Current turn (last user/user-response message + everything after) | always `full`, no exceptions             | always `full`, no exceptions — **identical to conservative; this preset never touches the current turn** |
| Historical `user` message **with attachments**                     | `summary`                                | `summary`                                |
| Historical `user` message, **long plain text, no attachments**     | `full` (left alone)                      | `summary` if `content.length > 800`      |
| Historical `tool` result **with a recoverable file**                | `summary`                                | `summary`                                |
| Historical `tool` result, **large text-only output**                | `summary` if estimated chars `> 2000`    | `summary` if estimated chars `> 800`     |
| Everything else (short historical text, no attachments/files)      | `full`                                   | `full`                                   |

In short: **`aggressive` is a strict superset of `conservative`** — every message `conservative`
would summarize, `aggressive` also summarizes, plus two extra cases (long historical plain-text
user messages, and smaller historical tool outputs down to 800 chars instead of 2000). There is no
`aggressive`-only behavior on attachments, files, or the current turn; both presets treat those
identically. The one place `aggressive` differs qualitatively rather than just numerically is rule
2 (`hasLargeText` in `planMessageCompression`) — that check is gated on
`preset === 'aggressive'` entirely, so `conservative` never fires it no matter how long the text is.

**A common misconception worth stating explicitly: `aggressive` does *not* summarize attachments or
tool results in the current turn.** The "current turn is never compressed" rule in
`planMessageCompression` is checked first and unconditionally, before any preset-specific logic —
there is no code path, under any preset, that assigns `policy: 'summary'` to a current-turn message.
If you need to keep the model from re-reading a huge attachment *just uploaded in this turn*, that
is not something either preset controls; it would require a different mechanism (e.g. the ordinary
token-budget truncation in `truncateChat`, or advising the user to start a fresh conversation).

**Choosing a preset:**

- **`conservative`** — pick this when tool outputs and attachments are the main cost driver and
  historical conversational text is short and cheap to keep verbatim (e.g. mostly short questions,
  large tool/file payloads). Preserves more of the model's own past reasoning text untouched.
- **`aggressive`** — pick this when conversations run very long and include large blocks of pasted
  text from the user (long historical messages, not just files), or when a stricter savings target
  is worth the model needing `context-retrieve.get_message`/`get_file` more often to recover detail.

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
2. **Historical `user` message with attachments → `summary`.**
3. **Historical `user` message with a long text body (aggressive preset only) → `summary`.**
   Conservative preset leaves long historical text messages alone unless they carry attachments.
4. **Historical `tool` message whose result carries a recoverable file → `summary`.**
5. **Historical `tool` message with a large text-only result → `summary`.** The size threshold is
   2000 characters under `conservative`, 800 under `aggressive` — `aggressive` summarizes smaller
   historical tool output than `conservative` does. Neither preset changes what happens to the
   current turn.
6. Everything else → `full`.

### Decisions Are Turn-Stable

Crucially, the decision for a historical message never looks at what the _current_ message says.
A message that mentions a historical file by name (`"what's on page 2 of report.pdf?"`) does
**not** flip that historical message back to `full` — the compaction decision only depends on the
historical message's own position and shape, so it is computed once (as soon as the message stops
being "current turn") and never changes again for the rest of the conversation.

This is deliberate, for two reasons:

- **Prompt caching.** Providers cache the serialized prompt by shared prefix (e.g. Anthropic
  breakpoints). If message M's representation depended on the current turn's content, the prefix
  containing M would differ from one turn to the next, invalidating the cache on every single turn.
- **Simplicity.** A per-turn, content-dependent override is one more thing to reason about, test,
  and get wrong (fuzzy name matching, false positives on common words, etc.) for a case the model
  can already handle itself.

If the model actually needs the original content of a summarized historical message, it calls
`context-retrieve.get_message` (or `get_file`, for a specific recoverable file) with the id from
the summary's reference block — that is precisely what the tool is for. There is no other path
back to `full` for a historical message.

## Building the Summary: `applyCompressionPlan`

Given the decisions above, `applyCompressionPlan` rewrites the message list: `full` messages pass
through unchanged; `summary` messages are replaced by a compact, cached representation.

### Summaries Are Always Plain Text

There is no model call anywhere in this path. A summary is one of:

- **Deterministic text extraction** of a file (via the existing `cachingExtractor`, the same
  extractor used for native-attachment fallback elsewhere), truncated to 500 characters.
- **Truncation** of an overly long text block, with a `…[truncated; N chars omitted]` marker.
- **A fixed fallback string** when neither applies — e.g. `Image file; no text preview available.`
  for images (there is no text to extract from an image), or `No extractable text preview available for this file type.` when extraction fails or returns nothing.

This means an image can never be described by a vision-model call as part of compression — if the
model needs to actually see the image, that only happens via `full` policy or `context-retrieve`.

### The `context-retrieve` Tool

Registered whenever `contextCompression` is set (`apps/backend/lib/tools/context-retrieve/`), this
is the model's one recovery surface for anything compression touched:

- **`get_file(id)`** — read a file's content by id (DB-authorized via `canAccessFile`, same as
  before this tool was renamed from `retrieve-file`).
- **`get_message(id)`** — return a message's *original, uncompressed* content by message id.
  Operates directly on the live `messages` array already passed to every tool call
  (`ChatState.chatHistory`, which compression never touches) — no DB access, no extra
  authorization needed beyond already being inside this conversation.
- **`search(query)`** — case-insensitive substring search over this conversation's own message
  history (via the same `messages` array), returning matching message ids with a short snippet.
  For when the model doesn't already have an id to call `get_message` with. Deliberately scoped to
  *this conversation's uncompressed context only* — it is not a knowledge-base or cross-conversation
  search.

### File Recovery Reference

Every summary that omits a recoverable file's real content includes a stable, uniformly-formatted
reference:

```
File available on demand: documento_semplice.docx
id: xXj3tBxkt4CTy80XL1rFF
type: application/vnd.openxmlformats-officedocument.wordprocessingml.document
summary: Documento semplice: contains a title and one paragraph.
Use context-retrieve.get_file with this id if exact contents are needed.
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
Full original message available on demand via context-retrieve.get_message with id: u-old-1.
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
        "value": "[Tool output summarized for context efficiency.]\n\nFile available on demand: documento_semplice.docx\nid: file-docx\ntype: application/vnd...wordprocessingml.document\nsummary: Documento semplice: contains a title and one paragraph.\nUse context-retrieve.get_file with this id if exact contents are needed.\n\nFull original message available on demand via context-retrieve.get_message with id: t-docx."
      }
    }
  ]
}
```

The `[Tool output summarized for context efficiency.]` overview line is a fixed constant
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
  "content": "File available on demand: report.pdf\nid: file-123\ntype: application/pdf\nsummary: The report covers Q1 revenue.\nUse context-retrieve.get_file with this id if exact contents are needed.\n\nPlease inspect this file.\n\nFull original message available on demand via context-retrieve.get_message with id: u-old-1.",
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
for a *different*, concurrent request can decide it needs to compress the same message before the
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

`compressionVersion` (currently `COMPRESSION_VERSION = 2` in `compression-planner.ts`) is bumped
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
  ├─ applyCompressionPlan(messages, decisions)
  │    full    → message unchanged
  │    summary → cached CompressedMessage row, or built + cached now
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
- A historical attachment is summarized once a later turn starts.
- A historical message's decision does not change when a later user message names that file.
- Large historical tool text is summarized; `aggressive` lowers the size threshold.
- `resolveCompressionTriggerTokens` never drops below the floor, honors a higher assistant setting.
- A summarized tool result redacts duplicated content from the sibling assistant tool-call args.
- A generated image summary never triggers a model call and never becomes `image-data`.
- `full`-policy messages still convert exactly as before (native bytes/text-extraction fallback).
- Failed text extraction falls back to deterministic minimal text, never blocks compaction.
- Every `summary`-policy message carries a `context-retrieve.get_message` recovery line, with or
  without an accompanying file reference.
- `warmCompressionCache` builds/caches eligible messages and no-ops on ineligible ones, without
  throwing on failure.
- A concurrent build for the same message joins the in-flight one instead of duplicating work.

`apps/backend/lib/tools/context-retrieve/__tests__/implementation.test.ts` covers the tool itself:
`get_file` (unchanged behavior from the old `retrieve-file` tool), `get_message` (found/not-found,
and that it needs no DB access), and `search` (match with snippet, no-match, empty query).

## Relevant Files

- `apps/backend/lib/chat/compression-planner.ts` — `planMessageCompression`, `applyCompressionPlan`,
  `warmCompressionCache`, `resolveCompressionTriggerTokens`.
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
