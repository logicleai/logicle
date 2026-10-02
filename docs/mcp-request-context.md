# MCP tool request context

Logicle adds request-scoped context to `params._meta` on MCP `tools/call`
requests. The model does not see or generate these fields, and they are never
placed in tool `arguments`. The current contract uses `logicle/*` keys:

```json
{
  "logicle/conversationId": "conversation-id",
  "logicle/messageId": "originating-user-message-id",
  "logicle/userId": "user-id",
  "logicle/workspaceMemberships": [
    {
      "workspaceId": "workspace-id",
      "role": "MEMBER"
    }
  ]
}
```

Each scalar is independent and omitted when unavailable. Memberships are
included only when the intersection of the user's current memberships and the
invoking assistant's shared workspaces is nonempty. The exact role is one of
`MEMBER`, `EDITOR`, `ADMIN`, or `OWNER`. Each membership contains only its
workspace ID and role. No user or workspace names, email address, global role,
message content, or OAuth token is sent.

The conversation, originating user message, and user identity are captured at
the start of a chat run. Confirmation responses and sub-assistants retain that
root identity. A sub-assistant calculates the membership intersection using its
own sharing, because it is the assistant directly invoking the MCP tool. A
logical tool call builds `_meta` once before retrying, so every retry uses the
same snapshot. Other request metadata is merged without removing unrelated
keys. Chat context is never stored on cached MCP clients or transports, and
discovery, listing, ping, and OAuth requests do not inherit it.

These fields are client assertions, not credentials. MCP servers must validate
IDs, membership roles, and their relationship to the requested
operation independently. Unknown or missing metadata must not grant access.

This contract retains the `logicle/*` namespace introduced in PR #1186 and
preserves the ID-only contract clarified in issue #310.

## Testing strategy

This plan follows `docs/testing-strategy.md`: use Vitest for context and payload
logic, and the deployed integration harness for authentication, database joins,
and chat-to-tool wiring. No external LLM or new dependency is needed. Assertions
must inspect requests received by an MCP server, rather than infer correctness
from the assistant's answer.

### Existing automated coverage

- `chat/__tests__/toolRequestContext.test.ts` checks new-turn selection,
  confirmation-response origin selection, and missing user messages.
- `tools/mcp/__tests__/request-meta.test.ts` checks independent scalar fields,
  root identity precedence, all four roles, duplicate/invalid memberships,
  empty membership omission, lookup failure, ID-only output, removal of stale
  name metadata, preservation of unrelated metadata, and concurrent identities.
  Its database is mocked: it checks query filters but does not prove the join.
- `tools/mcp/__tests__/request-meta-call.test.ts` checks separation from
  arguments, discovery exclusion, a shared retry snapshot, and concurrent calls
  with an OAuth client. The SDK and OAuth resolver are mocked: this does not
  prove transport serialization or an actual OAuth flow.
- `tools/subassistant/__tests__/implementation.test.ts` checks forwarding of
  root context into child assistant construction. It does not prove a complete
  parent-to-child-to-MCP chat run.

### Unit test additions

- Extend the invocation tests to overlap two users in different conversations
  using a shared non-OAuth client. Delay one call to force interleaving and
  assert each call's complete metadata and unchanged arguments.
- Assert no chat metadata reaches initialization, listing, ping, or the OAuth
  resolver. Preserve unrelated tracing/provider keys on `tools/call`.
- Check two tool calls from one turn retain its origin, while the next turn
  changes `messageId`. Test nested child assistants and unchanged root identity
  with different invoking assistant IDs.
- Exercise retry snapshot stability while the mocked membership state changes
  between attempts. A subsequent logical call must see the updated membership.
- Verify missing/empty scalars and an all-invalid membership result omit their
  fields. Treat any new discovered contract defect as a regression to fix.

### Integration scenarios to implement

Extend `apps/backend/scripts/integration-baseline.ts` with an MCP fixture that
captures requests privately and returns a constant response. Use the existing
mock provider to drive chat deterministically. Start a real SDK server on an
ephemeral port and exercise Streamable HTTP and legacy SSE; for stdio, launch
the fixture as a child process and write captures to a temporary file or a
separate IPC channel, never protocol stdout. Use the same assertions for each
transport. The manual inspector example is useful for debugging, but is not
an automated integration gate.

1. **Real database intersection:** create two users, a parent and child
   assistant, and several workspaces. Include a user-only workspace, an
   assistant-only workspace, a workspace shared with both assistants, and
   distinct parent/child workspaces. Assign all four roles across eligible
   fixtures. Derive the expected result from the seeded fixtures, and require
   exact membership sets and roles; ordering need not be significant. Run
   against SQLite and PostgreSQL deployments.
2. **Wire contract and privacy:** capture `tools/call` and require the expected
   IDs in `_meta`, unchanged tool arguments, and exactly `workspaceId` and
   `role` per membership. Seed recognizable names, email, message text, and
   credentials, and assert those values are absent from the application
   metadata. Do not assert that OAuth credentials are absent from HTTP auth
   headers, where they belong. Check non-tool MCP requests for absence of
   `logicle/*` chat context.
3. **Chat lifecycle:** send two messages in one chat, multiple tool calls in a
   turn, and a call requiring confirmation. Require each call to retain its
   originating message ID, with a new ID for the next user message. Execute a
   parent-to-child-to-MCP turn: root chat/message/user IDs must survive, and
   membership scope must match the child assistant.
4. **Concurrent calls:** interleave two authenticated users and two chats
   through the same configured MCP tool. Use barriers in the fixture to force
   overlap and assert there is no identity or membership crossover.
5. **Retry:** capture the first call and deliberately close the connection
   before replying. Change the user's membership before releasing the retry,
   and compare the application metadata across attempts. A later logical call
   must reflect the change. Use barriers and bounded timeouts rather than sleeps.
6. **OAuth:** use a local authorization-server fixture and actual token
   resolution. Test distinct users, token refresh, and authorization followed
   by resumed tool execution; require root identity to survive and verify that
   authorization/token requests carry no chat context. Keep token captures
   private and out of test output.
7. **Compatibility and omission:** exercise an MCP handler that ignores
   unknown metadata, a user with no eligible workspace, and partial context via
   direct tool invocation. Valid calls must succeed, with unavailable fields
   omitted rather than null or empty arrays.

Keep fixtures isolated by run, close clients/servers and child processes in
`finally`, remove temporary captures, and give every wait a bounded timeout.
An integration run passes only when the captured requests match expectations;
a missing tool call is a failure. Add one small authenticated chat-to-MCP
scenario to `smoke.ts` for the CI wiring gate; keep the broader matrix in the
integration baseline.

### Bridge follow-up

The satellite/bridge path currently has no metadata propagation and cannot
pass this contract. After the coordinated protocol change, add Go tests for
metadata forwarding without moving it into arguments, plus a deployed
Logicle → WebSocket → real bridge → MCP fixture scenario. Cover stdio and SSE,
root identity, workspace scope, overlapping calls, reconnects, and compatibility
with a bridge that does not support metadata. Metadata-dependent operations
must fail safely when context is unavailable. Until those tests pass, report
bridge coverage as unsupported rather than include it in a completion claim.

### Completion criteria

The direct MCP feature is verified when the unit suite, type checking, the
real-transport matrix, and the SQLite/PostgreSQL chat integration scenarios all
pass. Existing mocked tests alone do not satisfy issue #310's integration
criteria. Bridge support is a separate completion gate after its implementation.
