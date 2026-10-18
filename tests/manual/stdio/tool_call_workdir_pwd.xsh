#!/usr/bin/env xonsh --no-rc
$XONSH_SHOW_TRACEBACK=True

# TODO! migrate to unified python server if I want to keep this test
# FYI you'd need to send init first and then check pwd ... do this with new mcp_run in mcp_stdio

from pathlib import Path
$MCP_SERVER_CMD = str(
    Path("~/repos/github/g0t4/mcp-server-commands/.venv/bin/mcp-server-commands").expanduser()
)

# * server level default workdir:
$request='{ "jsonrpc": "2.0", "id": 1, "method":"tools/call","params":{"name":"run_bash","arguments":{"command_line":"pwd"}}}'
$result=$(echo $request \
    | $MCP_SERVER_CMD --workdir /private/tmp)
    # | jq '.result.content[] | select(.name=="STDOUT") | .text' --raw-output)
print(f"{$result=}") # trailing \n\n
assert $result.strip("\n") == "/private/tmp"

# * tool call has workdir:
# $request='{ "jsonrpc": "2.0", "id": 1, "method":"tools/call","params":{"name":"run_bash","arguments":{"cwd":"/Users/wesdemos/repos","command_line":"pwd"}}}'
# echo $request \
#     | command npx ~/repos/github/g0t4/mcp-server-commands/build/index.js \
#     | jq '.result.content[] | select(.name=="STDOUT") | .text' --raw-output

# * current dir only (no workdir provided to server, nor to tool call):
# $request='{ "jsonrpc": "2.0", "id": 1, "method":"tools/call","params":{"name":"run_bash","arguments":{"command_line":"pwd"}}}'
# echo $request \
#     | command npx ~/repos/github/g0t4/mcp-server-commands/build/index.js \
#     | jq '.result.content[] | select(.name=="STDOUT") | .text' --raw-output
