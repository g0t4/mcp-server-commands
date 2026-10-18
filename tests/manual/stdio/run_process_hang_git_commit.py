#!python3
# FYI grab real examples from cat ~/.local/state/mcp-server-commands/commands.log
import json
import sys
from pathlib import Path

from mcp_stdio import NOTIFY_INITIALIZED, REQUEST_INIT, run_mcp

run_process = json.dumps({
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params":{
    "name":"run_process",
    "arguments": {
        "command_line":"git add systemd_same/qwen3-vl-30b-a3b-instruct-q8_0.service use-paxy.fish && git commit -m \"Add Qwen3-VL-30B-A3B-Instruct Q8_0 service and include in use-paxy\" --author=\"gptoss120b <gptoss120b@example.com>\" -e","timeout_ms":10000,"cwd":"/Users/wesdemos/repos/wes-config/wes-bootstrap/home/systemd_lan",
    }},
})

run_mcp([
    (REQUEST_INIT, 1),
    (NOTIFY_INITIALIZED, 0),
    (run_process, 1),
])
