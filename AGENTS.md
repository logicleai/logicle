# AGENTS.md

## API and server

- API endpoints live under `logicle/app/api/**/route.ts` and should be declared with `route(...)` + `operation(...)` from `logicle/lib/routes.ts` (including `authentication` and `responseSpec`/`errorSpec` with Zod schemas).
- For auth, rely on `operation({ authentication: 'public' | 'user' | 'admin' })` and the route helpers in `logicle/lib/routes.ts` (do not hand-roll auth checks inside handlers).
- Declare return shapes via `responses: [responseSpec(...), errorSpec(...)] as const` so `route(...)` can validate output; prefer shared DTO schemas and `errorSpec(...)`/`errorResponseSchema` for failures.
- For failures, return typed errors with `error(...)`, `notFound(...)`, `forbidden(...)`, `conflict(...)` from `logicle/lib/routes.ts` rather than throwing raw errors.
- If an API route needs to bypass caching, follow the existing pattern and set `export const dynamic = 'force-dynamic'`.
- When API schemas or routes change, regenerate the OpenAPI spec via `npm run generate:openapi` (updates `logicle/public/openapi.yaml`). Do not edit the OpenAPI file by hand. Do not ask the user to do it, just do it.
- Shared types live in `logicle/types/**` and `logicle/types/dto/**`; keep API request/response shapes aligned with these schemas.

## UI and client

- Client-side API calls should go through `logicle/lib/fetch` and the thin wrappers in `logicle/services/**` instead of ad‑hoc `fetch` in components.
- UI primitives live in `logicle/components/ui` and are built on Radix UI + `class-variance-authority` variants. Extend variants there and reuse from app code.
- App-agnostic UI belongs in `logicle/components/ui`; app-specific composition lives in `logicle/components/app` or page-local `logicle/app/**`.
- Streaming chat uses server-sent events; keep message-part handling consistent with `logicle/services/chat.ts` when changing chat payloads.

## Maintenance

- If you notice missing, outdated, or incomplete instructions here, propose specific additions or edits to the user.
- To verify type correctness, run `npm run check-types`.
- DTO naming convention: prefer `Entity`, `InsertableEntity`, `UpdateableEntity` in `logicle/types/dto/**`.
- Avoid upsert endpoints unless explicitly requested; prefer create + update with explicit errors on duplicates.
- Use `PATCH` for update endpoints.
- `PATCH` request bodies should use partial DTOs (all fields optional).
- Prefer `DELETE` endpoints that target the entity ID (e.g., `/resource/{id}`).

## Blacklisted libraries

- `unpdf` is blacklisted in this repo. Do not add it as a dependency and do not use it for PDF parsing, extraction, rendering, or analysis.
- When a library is explicitly blacklisted here, do not reintroduce it indirectly as part of a refactor or dependency swap unless the user explicitly asks for it.

## Dependencies

- Adding a new dependency or replacing an existing library is a change that requires explicit user intervention.
- Before introducing a dependency, removing one, or swapping one library for another, stop and get explicit user confirmation unless the user has already asked for that exact change in the current conversation.
- Treat transitive reintroduction of a blacklisted library as a dependency change that also requires explicit user confirmation.

## Pull request guidelines

- When preparing a PR description, use Markdown headings with this structure (in order): `## Summary`, optional additional `##` sections as needed (for example `## Breaking changes`, `## Migration`, `## Risks`), and `## Tests`.
- Under each section, use concise bullet points (`- ...`), one change or claim per bullet.
- In `## Summary`, describe user-visible behavior and implementation changes clearly and concretely.
- PR text must describe the final merged diff (net result): explain what will be true after merge, not how the work evolved through commits, chronology, or intermediate refactors.
- In `## Tests`, list the exact validation performed (commands run, scope, and outcome). If tests were not run, simply skip the section.
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
