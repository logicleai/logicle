# AGENTS.md

## Monorepo structure

The repository is structured as:
- `apps/frontend/` — Next.js frontend (pages, components, hooks, services)
- `apps/backend/` — Backend API server (routes, models, DB, scripts)
- `packages/core/` — Shared types, DTO schemas, and generated manifests used by both apps

## API and server

- API endpoints live under `apps/backend/api/**/route.ts` and should be declared with `operation(...)` from `apps/backend/lib/routes.ts` (including `authentication` and `responseSpec`/`errorSpec` with Zod schemas). Export each HTTP method as a named export: `export const GET = operation({...})`.
- For auth, rely on `operation({ authentication: 'public' | 'user' | 'admin' })` and the route helpers in `apps/backend/lib/routes.ts` (do not hand-roll auth checks inside handlers).
- Declare return shapes via `responses: [responseSpec(...), errorSpec(...)] as const` so `operation(...)` can validate output; prefer shared DTO schemas and `errorSpec(...)`/`errorResponseSchema` for failures.
- For failures, return typed errors with `error(...)`, `notFound(...)`, `forbidden(...)`, `conflict(...)` from `apps/backend/lib/routes.ts` rather than throwing raw errors.
- Runtime API traffic is handled by the custom Node server; Next should only handle HTML and asset requests.
- **After adding or removing any `route.ts` file**, regenerate the backend route manifest via `npm run generate:backend-route-manifest` (updates `apps/backend/lib/backend/routes.generated.ts`). Do not edit the generated file by hand. Do not ask the user to do it, just do it.
- When API schemas or routes change, regenerate the OpenAPI spec via `npm run generate:openapi` (updates `apps/frontend/public/openapi.yaml`). Do not edit the OpenAPI file by hand. Do not ask the user to do it, just do it.
- Shared types live in `packages/core/src/types/**` and `packages/core/src/types/dto/**`; keep API request/response shapes aligned with these schemas.

## Database migrations

- Migration files live under `apps/backend/db/migrations/` and are named `YYYYMMDD-description.ts`.
- The DB schema types live in `apps/backend/db/schema.ts`; add a new interface and register it in the `DB` map when adding a table.
- **After adding a new migration file**, regenerate the migration manifest via `npm run generate:migration-manifest` (updates `apps/backend/db/migrations.generated.ts`). Do not edit the generated file by hand. Do not ask the user to do it, just do it.

## UI and client

- Client-side API calls should go through `apps/frontend/lib/fetch` and the thin wrappers in `apps/frontend/services/**` instead of ad‑hoc `fetch` in components.
- UI primitives live in `apps/frontend/components/ui` and are built on Radix UI + `class-variance-authority` variants. Extend variants there and reuse from app code.
- App-agnostic UI belongs in `apps/frontend/components/ui`; app-specific composition lives in `apps/frontend/components/app` or page-local `apps/frontend/app/**`.
- Streaming chat uses server-sent events; keep message-part handling consistent with `apps/frontend/services/chat.ts` when changing chat payloads.

## Maintenance

- If you notice missing, outdated, or incomplete instructions here, propose specific additions or edits to the user.
- To verify type correctness, run `npm run check-types`.
- DTO naming convention: prefer `Entity`, `InsertableEntity`, `UpdateableEntity` in `packages/core/src/types/dto/**`.
- Avoid upsert endpoints unless explicitly requested; prefer create + update with explicit errors on duplicates.
- Use `PATCH` for update endpoints.
- `PATCH` request bodies should use partial DTOs (all fields optional).
- Prefer `DELETE` endpoints that target the entity ID (e.g., `/resource/{id}`).
- Process-level bootstrap belongs in `logicle/server.ts`. Initialize logging, telemetry, worker runtimes, and other Node entrypoint concerns there.
- `logicle/instrumentation.ts` has been removed; do not reintroduce it as a primary startup path.

## Blacklisted libraries

- `unpdf` is blacklisted in this repo. Do not add it as a dependency and do not use it for PDF parsing, extraction, rendering, or analysis.
- When a library is explicitly blacklisted here, do not reintroduce it indirectly as part of a refactor or dependency swap unless the user explicitly asks for it.

## Dependencies

- Adding a new dependency or replacing an existing library is a change that requires explicit user intervention.
- Before introducing a dependency, removing one, or swapping one library for another, stop and get explicit user confirmation unless the user has already asked for that exact change in the current conversation.
- Treat transitive reintroduction of a blacklisted library as a dependency change that also requires explicit user confirmation.

## Pull request guidelines

- When preparing a PR description, keep it concise and high-signal.
- Use Markdown headings with this structure (in order): `## Summary`, optional additional `##` sections as needed (for example `## Details`, `## Breaking changes`, `## Migration`, `## Risks`), and `## Tests`.
- In `## Summary`, use a short paragraph that describes the final merged result at a high level, including the user-visible or operational impact when relevant.
- In follow-up sections, use concise bullet points (`- ...`), one change, risk, or note per bullet.
- PR text must describe the net result after merge, not commit history, chronology, or intermediate refactors.
- In `## Tests`, list the exact validation already performed (commands run, scope, and outcome). This section records what was done, not future instructions. Use bullet points, not checkboxes. If tests were not run, simply skip the section.
- Use inline code formatting for env vars, flags, endpoints, and commands (for example `ENABLE_CSRF_PROTECTION`, `npm run check-types`).

## Branch guidelines

- Name branches as `<type>/<slug>` where `type` is one of: `feature`, `fix`, `chore`, `docs`, `refactor`, `test`, `ci`, `perf`, `revert`, `hotfix`, `release`.
- Use lowercase kebab-case for `<slug>` (letters, numbers, and `-` only). Avoid spaces, underscores, and uppercase letters.
- Keep branch names short and descriptive (`2` to `6` words in the slug is preferred).
- When a ticket exists, include it at the start of the slug (`feature/1234-add-csrf-toggle` or `feature/proj-1234-add-csrf-toggle`).
- Prefer `feature/*` for user-visible behavior changes, `fix/*` for bug fixes, `chore/*` for maintenance/tooling, and `docs/*` for documentation-only changes.
- Use `hotfix/*` only for urgent production fixes and `release/*` only for release-preparation work.
- Do not mix multiple unrelated scopes in one branch; split into separate branches if needed.

## Git workflow

- Do not run any git write operation unless the developer/user explicitly asks for it in the current conversation (for example `commit`, `push`, `merge`, `rebase`, `tag`, `reset`, `cherry-pick`).
- By default, stop after making local changes and report what changed; wait for explicit confirmation before creating commits or pushing branches.
- When changes are coherent and ready, you may proactively propose a commit message and scope, but still wait for explicit approval before executing any git write operation (`commit`, `push`, `tag`, `rebase`, etc.).
