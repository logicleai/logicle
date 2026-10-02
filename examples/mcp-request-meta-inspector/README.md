# Inspect Logicle MCP request metadata locally

The development infrastructure provisions a stdio `mcp-file-analyzer` tool, but
it does not show incoming request metadata. This example starts a local MCP
server that prints each `tools/call` request's `_meta` and argument names.
It uses the MCP SDK already installed by this repository.

1. In one terminal, run the inspector from the repository root:

   ```sh
   MISE_CONFIG_FILE="$HOME/.config/mise/projects/logicle.toml" \
     mise exec -- pnpm exec tsx examples/mcp-request-meta-inspector/server.ts
   ```

2. In your running Logicle app, open **Admin → Tools** and create an MCP tool:

   - Name: **MCP request metadata inspector**
   - URL: `http://127.0.0.1:8765/mcp`
   - Authentication: **None**

   The inspector binds to loopback, so run the Logicle backend directly on
   the same host as the inspector.

3. In Logicle, add **MCP request metadata inspector** to an assistant's Tools
   tab and publish it. Chat with that assistant as a signed-in user and ask it
   to use `show_request_context` to inspect the MCP request context. The tool
   returns a short confirmation; the actual metadata appears in the inspector
   terminal.

The revised implementation sends `logicle/conversationId`, `logicle/messageId`,
`logicle/userId`, and `logicle/workspaceMemberships` under
`_meta`. `argumentKeys` should be empty for this tool. A membership appears only
when the assistant is shared with a workspace containing the current user;
otherwise the membership field is omitted. Each entry includes the workspace
ID and the user's role. User and workspace names must be absent.

To test multiple messages, invoke the tool in two separate chat turns and
compare `logicle/messageId`. To test workspace scoping, share the assistant with
a workspace containing the current user and invoke it again. To check
sub-assistant propagation, attach an assistant that has this tool as a sub-assistant,
invoke it from the parent, and compare the reported message ID with the root
chat message ID.

To test Logicle's transport retry, restart only the inspector with
`MCP_INSPECTOR_FAIL_ONCE=1` before the command in step 1. The first `tools/call`
prints `outcome: "forced_disconnect"` and closes the HTTP response. Logicle's
default `MCP_CALL_TOOL_MAX_RETRIES=1` permits one retry, which should print a
second call with `outcome: "success"` and the same `_meta`. Restart the
inspector again to repeat the experiment.

The inspector binds to `127.0.0.1` and prints IDs to its terminal. Stop it with
Ctrl-C when finished.
