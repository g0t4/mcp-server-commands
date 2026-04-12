#!/usr/bin/env fish

# this is optional AFAICT in older sdk versions (i.e. 1.9.0 that I am using)...
# - but for newer protocol revisions, the SDK expects this else it will fail with:
#   WARNING:root:Failed to validate request: Received request before initialization was complete

set request '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}'

# initialized notification DOES NOT HAVE ID
set initialized '{"jsonrpc":"2.0","method":"notifications/initialized"}'

begin
    echo $request
    echo $initialized
end | npx ~/repos/github/g0t4/mcp-server-commands/build/index.js -- --verbose \
    | jq

begin
    echo $request
    echo $initialized
end | uvx --directory ~/repos/github/g0t4/mcp-servers/src/fetch mcp-server-fetch \
    # | docker container run -i --rm mcp/fetch \
    | jq
