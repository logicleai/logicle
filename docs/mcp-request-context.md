# MCP tool request context

Logicle adds request-scoped context to `params._meta` on MCP `tools/call`
requests, both directly and through an updated `logicle-bridge` MCP relay. The model does not see or generate these fields, and they are never
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

This coverage follows `docs/testing-strategy.md`: use Vitest for context and payload
logic, and the deployed integration harness for authentication, database joins,
and chat-to-tool wiring. No external LLM or new dependency is needed. Assertions
must inspect requests received by an MCP server, rather than infer correctness
from the assistant's answer.

### Existing automated coverage

- `chat/__tests__/toolRequestContext.test.ts` checks new-turn selection,
  confirmation-response origin selection, missing user messages, and independent
  snapshots across successive turns.
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

### Additional unit coverage

- Invocation tests overlap two users in different conversations
  using a shared non-OAuth client. A delayed call forces interleaving; tests
  assert each call's complete metadata and unchanged arguments.
- Tests assert no chat metadata reaches initialization, listing, ping, or the OAuth
  resolver, and preserve unrelated tracing/provider keys on `tools/call`.
- Tests check that two tool calls from one turn retain its origin, while the
  next turn changes `messageId`. Nested child assistants retain root identity;
  membership queries use each invoking assistant ID.
- Tests exercise retry snapshot stability while the mocked membership state changes
  between attempts. A subsequent logical call must see the updated membership.
- Tests verify missing/empty scalars and an all-invalid membership result omit
  their fields. Mock-model tests ensure MCP content results end the tool loop
  for generated and streamed replies. A cache regression test checks that
  client disposal cannot recursively delete the same entry when close events fire.

### One deployed integration scenario

One authenticated chat-to-MCP scenario runs in
`apps/backend/scripts/integration-baseline.ts`, following the existing shared
satellite chat scenario. It uses the deployed backend and real database, the
existing mock LLM provider, and a real Streamable HTTP MCP fixture reachable
from the backend container. The fixture captures requests privately and
returns a constant response; no external service is needed.

1. Create a user and three workspaces: one where the user is an `EDITOR` and
   the assistant is shared, one where only the user belongs, and one where
   only the assistant is shared. Create and publish an assistant with the
   fixture's single MCP tool. Set recognizable user and workspace names.
2. Log in as that user, create a conversation, and send one message with a
   known ID through `/api/chat`. Let the mock model invoke the tool.
3. Require a captured `tools/call` with the actual conversation, message, and
   authenticated user IDs under `_meta`. Require exactly the eligible
   workspace ID and `EDITOR` role, and unchanged tool arguments. Check that
   names and other private fixture values are absent from application metadata,
   and that initialization/listing requests contain no chat context. Allow
   unrelated SDK metadata.
4. Verify the tool's constant result was persisted in the conversation,
   completing the request/result path. A missing call or result is a failure.
5. Close the fixture and remove seeded resources/captures in `finally`, with
   bounded waits. The API may archive published assistants and retain their
   referenced backend; those records disappear with the disposable database.

CI runs this scenario in the SQLite integration baseline. PostgreSQL remains
covered by the existing smoke tests. For a
container backend, set `MCP_INTEGRATION_HOST` to a hostname that reaches the
test runner (CI uses `host.docker.internal`). The fixture binds an ephemeral
port on the runner; with a host backend, the default is `127.0.0.1`.
Do not duplicate the MCP scenario in `smoke.ts` or add deployed scenarios for
every edge case. The manual inspector remains a debugging aid.

### Keep the remaining coverage below the deployment layer

Retries, concurrent callers, confirmation origin, nested assistants, omission,
role validation, metadata merging, and OAuth resolver interactions belong in
focused Vitest tests. Use mocked dependencies to force failures and precise
interleavings. Extend the existing tests rather than reproduce these cases in
full deployments.

For transport-specific serialization concerns, add small real-SDK contract
checks under Vitest only when there is a concrete uncovered risk. Such checks
can use a local stdio/SSE fixture without a deployed Logicle instance. The single
HTTP deployment scenario establishes the chat/auth/database/MCP wiring; it does
not claim to exercise every transport or a complete OAuth authorization flow.

### Satellite and bridge propagation

Satellite tools use the same metadata builder as direct MCP calls. Logicle
calculates root identity and memberships for the invoking assistant, then sends
an optional top-level `_meta` on the WebSocket `tool-call` message. Satellite
`params` remains the model-generated arguments:

```json
{
  "type": "tool-call",
  "id": "call-id",
  "method": "tool-name",
  "params": { "input": "tool argument" },
  "_meta": {
    "logicle/conversationId": "conversation-id",
    "logicle/messageId": "originating-user-message-id",
    "logicle/userId": "user-id"
  }
}
```

The bridge forwards this metadata unchanged into the upstream MCP
`tools/call` request's `params._meta`, alongside `name` and `arguments`.
This applies to both bridge MCP transports (stdio and HTTP/SSE), which share
one request builder. No context is stored on the relay or connection, and
initialization/discovery do not inherit it. Built-in filesystem and command
handlers receive only tool arguments; metadata does not change their local
permissions. An argument named `_meta` remains an ordinary argument.

The additional field is optional and omitted when empty. Updated bridges
accept calls from older Logicle servers without metadata. Older Go bridges
ignore the new field, so calls still work but metadata propagation requires
updating both repositories. The WebSocket subprotocol remains
`logicle-satellite-v1`.

Logicle unit tests cover metadata construction at satellite invocation,
root identity, invoking-assistant membership queries, unrelated keys,
argument separation, concurrent callers, and metadata-free messages. Bridge Go
tests cover decoding/dispatch, relay forwarding, discovery exclusion,
concurrent calls, missing/empty metadata, and unchanged local capability gates.

The Logicle test suite does not require a bridge binary or a second checkout.
Tests involving both projects belong in a dedicated integration repository.
That suite should exercise Logicle → WebSocket → real bridge → MCP and inspect
received MCP requests and returned results, including separate callers,
a subsequent user turn, and a later call without metadata. A full deployed
scenario should additionally establish chat, authentication, and membership
database wiring. This cross-project suite has not been added.

### Completion criteria

Require the focused unit suite, type checking, and the single deployed scenario
in the SQLite baseline. Record which issue #310 criteria have unit coverage
and which have deployment coverage; do not claim a full integration matrix for
OAuth, confirmations, sub-assistants, or all transports. Bridge changes
additionally require the bridge repository's Go tests. Report cross-project
deployment coverage separately; the self-contained suites do not prove the
complete Logicle-to-bridge deployment path.
