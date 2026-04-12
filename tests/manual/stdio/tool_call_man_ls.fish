#!/usr/bin/env fish

# test of what `man ls` would look like (on my mac or another platform, depending on man client)

set request '{ "jsonrpc": "2.0", "id": 1, "method":"tools/call","params":{"name":"run_process","arguments":{"command_line":"man ls"}}}'

echo $request \
    | npx ~/repos/github/g0t4/mcp-server-commands/build/index.js \
    | jq
