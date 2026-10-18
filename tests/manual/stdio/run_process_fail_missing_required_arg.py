#!python3
import json
import sys
from pathlib import Path

from mcp_stdio import NOTIFY_INITIALIZED, REQUEST_INIT, run_mcp

run_process = json.dumps({
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": { "name": "run_process", "arguments": {} },
})

run_mcp([
    (REQUEST_INIT, 1),
    (NOTIFY_INITIALIZED, 0),
    (run_process, 1),
])


