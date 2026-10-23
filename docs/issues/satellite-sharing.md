# Fix satellite sharing at creation and visibility for shared users

## Issue Description

Satellite sharing is incomplete in two places:

- Creating a satellite only asks for its name and always creates it as private, without offering an initial sharing choice.
- Sharing an existing satellite from its detail page, including the administration view, saves without errors but does not make it available to the intended recipients.

Shared satellites remain absent from other users' satellite lists and from the satellite picker when configuring an agent. As a result, users cannot discover or select satellites shared with their workspace or company.

## Steps to Reproduce

1. Sign in as user A and create a satellite. The creation form only asks for its name.
2. Sign in as an administrator and open the satellite's detail page under `/admin/satellites`.
3. Share the satellite with the company or with a workspace containing user B.
4. Save the changes. No error is reported.
5. Sign in as user B, using a separate browser profile or signing out of the previous account.
6. Open `/satellites` and check whether the shared satellite is listed.
7. Open an agent's configuration and check the satellite picker in the tools section.

## Current Behavior with Screenshots

- There is no sharing choice in the satellite creation form; newly created satellites are always private.
- Updating an existing satellite's sharing settings completes without errors, but the satellite does not appear in the recipients' lists.
- Recipients cannot select the shared satellite when configuring an agent.

<!-- Add screenshots of the creation form, saved sharing settings, and the recipient's satellite list or picker here. -->

## Expected Behavior

- Satellite creation offers an initial sharing choice: private, selected workspaces, or company-wide, according to the user's permissions.
- The selected sharing settings are persisted and applied consistently to satellite lists, detail access, and agent pickers.
- Company-wide sharing makes the satellite available to all authenticated company users; selecting this mode requires administrator privileges.
- Workspace sharing makes the satellite available to authorized members of the selected workspaces, while preserving owner access and existing administrator access rules.
- Sharing recipients can view and select a satellite without gaining permission to rename or delete it, change its sharing, or regenerate its connection secret.
- Revoking sharing removes access for users who are no longer authorized.
- Shared satellites show an updated connection status, while ephemeral personal bridges remain restricted to their own user.
- Clients that omit sharing during creation continue to create private satellites.

## Additional Context

The investigation identified a visibility problem rather than a general failure to save sharing settings. The sharing update path writes to the permission-target tables, but the user-facing lists filter exclusively by ownership.

Relevant code before the locally prepared fix:

- `apps/frontend/app/satellites/components/SatelliteDialog.tsx` submits only the name during creation.
- `packages/core/src/types/dto/satellite.ts` accepts sharing updates but does not accept sharing in the creation payload.
- `apps/backend/models/satellite.ts` initializes sharing as private and lists a user's satellites by `userId`.
- `apps/backend/api/me/satellites/route.ts` returns only the current user's satellites and connections.
- `apps/backend/api/me/satellites/connected/route.ts` also filters connections by ownership.
- `apps/frontend/app/assistants/components/ToolsTabPanel.tsx` uses the same user-facing list through `useSatellites`, so the agent picker inherits the visibility issue.

A fix has been prepared locally, covering creation controls, sharing persistence, recipient visibility, and separation of usage and management permissions. No new dependency or database migration is required; the API schemas and generated OpenAPI have been updated.

Local validation passed for 56 targeted tests, TypeScript, and lint on the affected files. A separate SQLite/frontend test environment also verified login, profiles, frontend delivery, and expected satellite visibility for administrator, owner, workspace-member, and outsider accounts.

No remote or production environment was inspected. The reproduction steps and current behavior describe the application before the locally prepared fix.
