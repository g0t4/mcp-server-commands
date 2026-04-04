#!/usr/bin/env fish

# FYI grab real examples from cat ~/.local/share/mcp-server-commands/commands.log

# -e/--edit == further edit the message, opens editor and blocks!
set request '{ "jsonrpc": "2.0", "id": 1, "method":"tools/call","params":{"name":"run_process","arguments":{"command_line":"git add systemd_same/qwen3-vl-30b-a3b-instruct-q8_0.service use-paxy.fish && git commit -m \"Add Qwen3-VL-30B-A3B-Instruct Q8_0 service and include in use-paxy\" --author=\"gptoss120b <gptoss120b@example.com>\" -e","timeout_ms":10000,"cwd":"/Users/wesdemos/repos/wes-config/wes-bootstrap/home/systemd_lan"}}}'

echo $request \
    | npx ~/repos/github/g0t4/mcp-server-commands/build/index.js -- --verbose  \
    | jq
