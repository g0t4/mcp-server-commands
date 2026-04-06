#!/usr/bin/env fish

# this is optional AFAICT in older sdk versions (i.e. 1.9.0 that I am using)...
# - but for newer protocol revisions, the SDK expects this else it will fail with:
#   WARNING:root:Failed to validate request: Received request before initialization was complete

set request '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}'

echo $request \
    | npx ~/repos/github/g0t4/mcp-server-commands/build/index.js -- --verbose  \
    | jq

echo $request \
    | docker container run -i --rm mcp/fetch \
    | jq
