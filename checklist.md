# MCP request context — manual checklist

Run the metadata inspector and attach its MCP tool to the assistant being tested.
Inspect the requests printed in the inspector terminal.

- [x] **Basic: two messages in the same chat**
  - Both calls succeed.
  - Conversation and user IDs remain the same; message IDs differ.
  - `argumentKeys` is empty; context appears only under `_meta`.
  - Membership entries contain only workspace IDs and roles; no user or workspace names appear.
- [x] **No matching workspace**
  - Use an assistant with no workspace sharing and invoke the tool.
  - `logicle/workspaceMemberships` is absent, rather than an empty array.
- [x] **Multiple workspaces**
  - Share the assistant with two workspaces the calling user belongs to.
  - [x] Both memberships appear with the user's respective roles, verified with an `OWNER` user and a different `MEMBER` user over two turns each.
  - [x] Workspaces the user belongs to but the assistant is not shared with are excluded. Confirmed against the local database: the user belongs to both test workspaces as `MEMBER`, while the assistant is shared only with `Workspace di prova 2`; this matches the two pasted calls.
  - [x] Workspaces the assistant is shared with but the user does not belong to are excluded. Confirmed against the local database: the assistant is shared with both test workspaces, while `prova@foosoft.it` belongs only to `Workspace di prova 2` as `MEMBER`; this matches the two pasted calls.
- [x] **Subassistant**
  - Attach the MCP tool to a subassistant and have the parent delegate to it.
  - Give the parent and subassistant different workspace sharing.
  - Conversation, message, and user IDs match the root chat request.
  - Memberships follow the subassistant's sharing, not the parent's.
  - Verified against the local database over two turns: `MCP parent test` delegates to `Asisstente di prova`; metadata retains the parent conversation and root user message IDs, with `MEMBER` in the child's `Workspace di prova`, excluding the parent's `Workspace di prova 2`.
- [x] **Transport retry**
  - Restart the inspector with `MCP_INSPECTOR_FAIL_ONCE=1` and invoke the tool.
  - A call with `outcome: "forced_disconnect"` is followed by one with `outcome: "success"`.
  - Both calls contain identical `_meta` and empty arguments.
  - Verified manually: the first message produced a forced disconnect followed by a successful retry with identical metadata; the second message succeeded once with a new message ID.
- [ ] **Satellite through the bridge — separate PR**
  - Implement MCP request context forwarding through the bridge before testing this case.
  - Invoke an MCP tool through the satellite/bridge path.
  - Verify at the destination MCP server that root IDs and scoped memberships arrive under `_meta`.

Concurrency, confirmations, and OAuth are additional automated coverage areas;
they are outside this initial manual checklist.
