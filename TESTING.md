# Testing Procedure

The goal of this strategy is to catch release-blocking regressions early while keeping developer feedback fast and provider costs controlled.  
We split tests into lanes so each risk is validated at the right depth: fast PR gates for runtime viability and deterministic behavior, plus manual lanes for slower or cost-sensitive checks.  
The main compromise is coverage versus speed: some integration and live-provider scenarios are intentionally not run on every PR, and are executed manually until broader automation is worth the added runtime and secret-management overhead.

## Lane 1: Smoke (fast deploy gate, PR required)

- Does:
  - health endpoint
  - signup + login
  - authenticated profile read
  - folder CRUD baseline
  - backend + assistant + conversation setup
  - file upload + content fetch
  - chat SSE stream returns assistant data
  - websocket `/api/rpc` handshake
- Source script: `logicle/scripts/smoke.ts`
- Local execution:
  - `pnpm --dir logicle run test:smoke -- http://localhost:3000`
- CI execution:
  - runs in container using compiled artifact:
  - `node dist-scripts/smoke.js http://127.0.0.1:3000`
- Cadence:
  - every PR build (required)

## Lane 2: Existing unit/integration suite (PR required)

- Does:
  - broader repository test suite already present in project
- Local execution:
  - `pnpm --dir logicle test`
- CI execution:
  - runs in PR pipeline
- Cadence:
  - every PR build (required)

## Lane 3: Provider integration (mocked, PR required)

- Does:
  - validates provider normalization and adapter behavior without external APIs
- Source test:
  - `logicle/__tests__/providersMock.test.ts`
- Local execution:
  - `pnpm --dir logicle run test:providers:mock`
- CI execution:
  - runs as regular test job (no live keys)
- Cadence:
  - every PR build (required)

## Lane 4: Integration/API baseline (manual/optional)

- Does:
  - health response shape
  - admin bootstrap + admin-only endpoint access
  - regular user auth policy checks (`403` on admin routes)
  - user profile response shape
  - selected `400` and `404` error paths
  - folder CRUD side effects (create, update, delete persistence)
- Source script: `logicle/scripts/integration-baseline.ts`
- Local execution:
  - `pnpm --dir logicle run test:integration -- http://localhost:3000`
- CI execution:
  - runs in container using compiled artifact:
  - `node dist-scripts/integration-baseline.js http://127.0.0.1:3000`
- Cadence:
  - currently manual/optional (not required on every PR)

## Lane 5: Provider integration (live canary, manual only)

- Does:
  - real provider request/stream canary with configured `LIVE_*` credentials
- Source script:
  - `logicle/scripts/providers-live.ts`
- Local execution:
  - `pnpm --dir logicle run test:providers:live -- http://localhost:3000`
- CI execution:
  - GitHub Actions manual workflow (`workflow_dispatch`) only
- Cadence:
  - manual pre-release / on-demand (not scheduled)

## Container Guidance

Use containers for:
- smoke tests in CI (validate production-like boot/package/runtime)
- integration tests that depend on external services (for example Postgres)
- provider canary workflows (stable runtime + secret handling)

Keep local fast feedback native for unit tests when possible.

## Planned Expansion (Not Implemented Yet)

- Extend integration from baseline to route-by-route coverage:
  - auth behavior per endpoint (`public`/`user`/`admin`)
  - success response schema checks
  - core error paths (`400`/`403`/`404`/`409`) where applicable
  - DB assertions for all write endpoints
