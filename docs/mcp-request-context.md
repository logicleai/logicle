# MCP tool request context

Logicle adds request-scoped context to `params._meta` on MCP `tools/call`
requests. The model does not see or generate these fields, and they are never
placed in tool `arguments`. The current contract uses `custom/*` keys:

```json
{
  "custom/conversationId": "conversation-id",
  "custom/messageId": "originating-user-message-id",
  "custom/userId": "user-id",
  "custom/userName": "User name",
  "custom/workspaceMemberships": [
    {
      "workspaceId": "workspace-id",
      "workspaceName": "Workspace name",
      "role": "MEMBER"
    }
  ]
}
```

Each scalar is independent and omitted when unavailable. Memberships are
included only when the intersection of the user's current memberships and the
invoking assistant's shared workspaces is nonempty. The exact role is one of
`MEMBER`, `EDITOR`, `ADMIN`, or `OWNER`. Workspace IDs and names are paired in
each entry. No email address, global role, message content, or OAuth token is
sent.

The conversation, originating user message, and user identity are captured at
the start of a chat run. Confirmation responses and sub-assistants retain that
root identity. A sub-assistant calculates the membership intersection using its
own sharing, because it is the assistant directly invoking the MCP tool. A
logical tool call builds `_meta` once before retrying, so every retry uses the
same snapshot. Other request metadata is merged without removing unrelated
keys. Chat context is never stored on cached MCP clients or transports, and
discovery, listing, ping, and OAuth requests do not inherit it.

These fields are client assertions, not credentials. MCP servers must validate
IDs, names, membership roles, and their relationship to the requested
operation independently. Unknown or missing metadata must not grant access.

This contract replaces the initial `logicle/*` keys sent by the first
implementation in PR #1186. Receivers that consumed those keys must migrate to
`custom/*`.
