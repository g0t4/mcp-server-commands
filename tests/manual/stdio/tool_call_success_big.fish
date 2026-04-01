#!/usr/bin/env fish

# FYI grab real examples from cat ~/.local/share/mcp-server-commands/commands.log

set request '{ "jsonrpc": "2.0", "id": 1, "method":"tools/call","params":{"name":"run_process","arguments":{"command_line":"system_profiler SPUSBDataType SPThunderboltDataType -json"}}}'

echo $request \
    | npx ~/repos/github/g0t4/mcp-server-commands/build/index.js \
    | jq
