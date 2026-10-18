#!/usr/bin/env fish

set request '{ "jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": { "name": "run_process", "arguments": {} } }'

echo $request \
    | npx ~/repos/github/g0t4/mcp-server-commands/build/index.js -- --verbose  \
    | jq
