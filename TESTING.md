# Testing Procedure

This project should use a layered test strategy. Do not try to achieve full functional coverage with smoke tests alone.

## Test Lanes

1. Smoke tests (deploy gate, fast)
- Goal: verify the app is alive after build/deploy.
- Runtime checks:
  - app boots
  - DB is reachable/migrations run
  - authentication works for one user
  - one core API happy path works
  - chat streaming endpoint responds

2. Integration/API tests (main gate)
- Goal: broad endpoint behavior coverage.
- For each API route:
  - auth behavior (`public`, `user`, `admin`)
  - success response shape
  - expected error paths (`400`, `403`, `404`, `409` where relevant)
- Assert DB side effects.

3. LLM provider integration tests
- Goal: detect provider drift and adapter regressions.
- Split into two suites:
  - mocked provider integration (runs on PR)
  - live provider canaries (nightly + pre-release/manual)

4. Unit tests
- Goal: fast verification of core logic (parsing, schemas, transforms, helpers).

## LLM Provider Coverage Requirements

For each supported provider family (`openai`, `anthropic`, `gemini`, `gcp-vertex`, `perplexity`, `logiclecloud`):

- stream text response succeeds
- streaming protocol is valid (SSE chunks parse and order is coherent)
- usage/token metadata is captured (if available)
- provider-specific errors are mapped correctly:
  - invalid credentials
  - rate limits
  - invalid model/config
  - timeout/abort
- tool-call flow works for at least one tool-capable model (where supported)

For live canaries:
- use minimal prompts and low token budgets
- limit parallelism to control cost and API throttling
- run in isolated workflow with provider secrets

## Recommended CI Cadence

1. PR pipeline (required)
- type checks
- unit tests
- mocked integration tests
- smoke tests

2. Main branch pipeline (required)
- all PR checks
- extended integration matrix

3. Nightly live-provider pipeline (required)
- one or more canary checks per provider
- report pass/fail and latency

4. Pre-release validation (manual required)
- rerun live-provider canaries before tagging release

## Existing Commands

From `logicle/`:

```bash
pnpm run check-types
pnpm test
pnpm run build
```

Note:
- `pnpm test` currently runs the existing test suite.
- Add dedicated scripts for smoke/integration/provider suites as they are introduced (for example: `test:smoke`, `test:integration`, `test:providers:mock`, `test:providers:live`).

## Container Guidance

Use containers for:
- smoke tests in CI (validate production-like boot/package/runtime)
- integration tests that depend on external services (for example Postgres)
- provider canary workflows (stable runtime + secret handling)

Keep local fast feedback native for unit tests when possible.

