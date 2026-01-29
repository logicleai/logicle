# AGENTS.md

## API and server
- API endpoints live under `logicle/app/api/**/route.ts` and should be declared with `route(...)` + `operation(...)` from `logicle/lib/routes.ts` (including `authentication` and `responseSpec`/`errorSpec` with Zod schemas).
- For auth, rely on `operation({ authentication: 'public' | 'user' | 'admin' })` and the route helpers in `logicle/lib/routes.ts` (do not hand-roll auth checks inside handlers).
- Declare return shapes via `responses: [responseSpec(...), errorSpec(...)] as const` so `route(...)` can validate output; prefer shared DTO schemas and `errorSpec(...)`/`errorResponseSchema` for failures.
- For failures, return typed errors with `error(...)`, `notFound(...)`, `forbidden(...)`, `conflict(...)` from `logicle/lib/routes.ts` rather than throwing raw errors.
- If an API route needs to bypass caching, follow the existing pattern and set `export const dynamic = 'force-dynamic'`.
- When API schemas or routes change, regenerate the OpenAPI spec via `npm run generate:openapi` (updates `logicle/public/openapi.yaml`). Do not edit the OpenAPI file by hand.
- Shared types live in `logicle/types/**` and `logicle/types/dto/**`; keep API request/response shapes aligned with these schemas.

## UI and client
- Client-side API calls should go through `logicle/lib/fetch` and the thin wrappers in `logicle/services/**` instead of ad‑hoc `fetch` in components.
- UI primitives live in `logicle/components/ui` and are built on Radix UI + `class-variance-authority` variants. Extend variants there and reuse from app code.
- App-agnostic UI belongs in `logicle/components/ui`; app-specific composition lives in `logicle/components/app` or page-local `logicle/app/**`.
- Streaming chat uses server-sent events; keep message-part handling consistent with `logicle/services/chat.ts` when changing chat payloads.

## Maintenance
- If you notice missing, outdated, or incomplete instructions here, propose specific additions or edits to the user.
