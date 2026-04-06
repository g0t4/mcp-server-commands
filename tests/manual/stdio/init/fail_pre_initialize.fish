#!/usr/bin/env fish

# some MCP servers will fail if you send tools/list before initialize (i.e. fetch example in modelcontextprotocol/servers repo)
# right now mcp-server-commands doesn't need initialize (it is optional, won't hurt)

# TODO test this if/when I upgrade SDK version to newer protocol capabilities

set request '{ "jsonrpc": "2.0", "id": 1, "method": "tools/list" }'

# fetch MCP server
echo $request \
    | docker container run -i --rm mcp/fetch \
    | jq
# results in:
#   WARNING:root:Failed to validate request: Received request before initialization was complete

# echo $request \
#     | npx ~/repos/github/g0t4/mcp-server-commands/build/index.js -- --verbose  \
#     | jq
