#!/usr/bin/env xonsh
$XONSH_SHOW_TRACEBACK=True

# * server level default workdir:
$request='{ "jsonrpc": "2.0", "id": 1, "method":"tools/call","params":{"name":"run_process","arguments":{"command_line":"pwd"}}}'
$result=$(echo $request \
    | command npx ~/repos/github/g0t4/mcp-server-commands/build/index.js --workdir /private/tmp \
    | jq '.result.content[] | select(.name=="STDOUT") | .text' --raw-output)
print(f"{$result=}") # trailing \n\n
assert $result.strip("\n") == "/private/tmp"

# * tool call has workdir:
# $request='{ "jsonrpc": "2.0", "id": 1, "method":"tools/call","params":{"name":"run_process","arguments":{"cwd":"/Users/wesdemos/repos","command_line":"pwd"}}}'
# echo $request \
#     | command npx ~/repos/github/g0t4/mcp-server-commands/build/index.js \
#     | jq '.result.content[] | select(.name=="STDOUT") | .text' --raw-output

# * current dir only (no workdir provided to server, nor to tool call):
# $request='{ "jsonrpc": "2.0", "id": 1, "method":"tools/call","params":{"name":"run_process","arguments":{"command_line":"pwd"}}}'
# echo $request \
#     | command npx ~/repos/github/g0t4/mcp-server-commands/build/index.js \
#     | jq '.result.content[] | select(.name=="STDOUT") | .text' --raw-output
