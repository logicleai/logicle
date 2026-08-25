# Testing strategy: where coverage should come from

This repo has two very different kinds of test, and confusing which one
should cover a given piece of code either wastes effort (reimplementing
`smoke.ts` at the unit level) or leaves gaps (business logic nobody ever
calls except in a full docker deploy). This doc records the split, and a
prioritized backlog for closing gaps in the "should be unit tested" bucket.

## The two layers

**`apps/backend/scripts/smoke.ts`** (run in CI on every push, against a real
Docker deployment, both sqlite and postgres) and
**`apps/backend/scripts/integration-baseline.ts`** (main/dispatch only) exist
to prove that routes, auth, DB persistence, and cross-module side effects
actually wire together end-to-end. `providerType: 'mock'` (`EchoLanguageModel`,
gated behind `ALLOW_MOCK_PROVIDER`) stands in for a real LLM so the chat
pipeline can be driven without external services. Grow *this* layer only for
things that can't be verified any other way: authn/authz boundaries, DB
side-effects that span tables (e.g. file ownership reassignment), and
wiring between routes and the modules behind them. Do not use it to chase
statement coverage — every extra smoke scenario costs a full server
build+boot cycle to iterate on, versus milliseconds for a unit test.

**`vitest` unit/integration tests under `__tests__/` and
`**/__tests__/`** (run via `npm run test:coverage`, coverage scoped to
`packages/core/src/**` and `apps/backend/lib/**` in `vitest.config.ts`) are
where statement-coverage percentage should actually be pushed. Most of the
codebase's real branching logic — validation, transforms, request/response
shaping, error classification — lives here and needs zero DB or network
access to exercise.

## What NOT to chase for coverage

A large share of the lowest-covered files in the current report are not
undertested business logic — they're one of these, and 0% there is expected,
not a gap:

- **Type-only modules** with no runtime code: `packages/core/src/types/base.ts`,
  `folder.ts`, `provider.ts`, `session.ts`, `stats.ts`, `compression.ts`,
  `packages/core/src/chat/tools.ts` / `types.ts`,
  `packages/core/src/tools/openapi-types.ts`, `apps/backend/lib/chat/ClientSink.ts`,
  `apps/backend/lib/chat/usage.ts`, `apps/backend/lib/imagegen/types.ts`.
  There's nothing executable to cover.
- **Generated code**: `apps/backend/lib/router/*.generated.ts`,
  `apps/backend/db/migrations.generated.ts`,
  `apps/backend/lib/backend/routes.generated.ts` — never hand-edited, never
  hand-tested.
- **Process entrypoints / worker-thread bootstraps**: `apps/backend/lib/bootstrap.ts`,
  `apps/backend/lib/provision.ts`, `apps/backend/lib/chat/tokenizer-worker/{runtime,script}.ts`,
  `apps/backend/lib/search/{runtime,script}.ts`, `apps/backend/lib/satellite/server.ts`,
  `apps/backend/lib/tracing/telemetry.ts`, `apps/backend/lib/staticFrontendVite.ts`
  (dev-only Vite middleware, never runs in production). These only make sense
  exercised by actually booting the process — i.e. smoke.ts already does,
  implicitly, every time it hits `/api/health`.
- **Thin external-API wrappers whose only logic is "make the HTTP/SDK call"**:
  the `invoke()` half of most `apps/backend/lib/tools/*/implementation.ts`
  tool implementations (calls to a real search/image/transcription provider).
  These need contract tests against the real provider or nothing at all —
  unit-testing them means mocking the provider SDK into meaninglessness.

## Where the real gaps are (backlog, roughly prioritized)

These are files with substantial *pure* logic (schema/request shaping,
branching, calculation) that are currently undertested and are cheap to
cover with plain vitest unit tests — no DB, no network:

1. `apps/backend/lib/tools/mcp/implementation.ts` (~17%) and `file-bridge.ts`
   (~21%) — protocol/message shaping, separate from the actual MCP transport.
2. `apps/backend/lib/chat/summarizer.ts` (~20%), `startServerChatRun.ts`
   (~33%, error branches only partially covered), `chat/index.ts` (~61%,
   large file, worth incremental coverage rather than a single pass).
3. `apps/backend/lib/chat/litellm/litellm-provider.ts` (~7%) — provider
   config/factory logic.
4. `apps/backend/lib/imagegen/metering.ts` (~13%) and
   `apps/backend/lib/tools/audio_transcription/metering.ts` (~13%) — thin
   wrappers around the OpenMeter SDK, but the guard clauses (no-op when
   unconfigured) and the try/catch-and-log-a-warning around the ingest call
   are pure branching worth covering with the SDK client mocked.
5. `packages/core/src/bootstrapPlaceholders.ts` (0%, small) — DOM-dependent
   (`readBootstrapJson` reads `document`), needs a `jsdom` environment via
   `// @vitest-environment jsdom` (no existing test file uses that pragma
   yet, so this is also the first one) — quick win once that's set up.
6. `apps/backend/lib/router.ts` (~71%, branch coverage 50%) and
   `apps/backend/lib/logging.ts` (~35%, mixed — some pure formatting, some
   transport wiring) — partial gaps worth closing incrementally.
7. `apps/backend/lib/tools/openapi/implementation.ts`'s multipart-response
   branch (the file overall went 7% -> 90%, but parsing a
   `multipart/`-content-type response — `parseMultipart` + per-part
   text-vs-attachment handling — is still uncovered; needs a hand-built
   multipart body in the mocked `fetch` response).

Done: `echo-language-model.ts` (23% -> 95%), `tools/timeofday/implementation.ts`
(25% -> 100%), `tools/openapi/implementation.ts` (7% -> 90%, see the
multipart caveat above).

When picking up an item here: confirm with a quick read that the file is
still mostly pure logic (code moves), write the unit test, and cross it off
by deleting the line — this list is a backlog, not a permanent doc.
