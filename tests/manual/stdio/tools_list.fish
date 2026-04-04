#!/usr/bin/env fish
set request '{ "jsonrpc": "2.0", "id": 1, "method": "tools/list" }'

echo $request \
    | npx ~/repos/github/g0t4/mcp-server-commands/build/index.js -- --verbose  \
    | jq

# ?? make this into an integration test that I can run to verify STDIO comms?

# FYI original goal (for these scripts) was to make executable a few sanity checks of JSON-RPC over STDIO
#   - also helps me remember how things work
#   - and then I can spin this off into troubleshooting reproductions 
#     - i.e. response object seemingly split across lines... though might not be from this server
