#!python3
import json
import sys
from pathlib import Path

from mcp_stdio import NOTIFY_INITIALIZED, REQUEST_INIT, run_mcp

list_tools = json.dumps({
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/list",
})

run_mcp([
    (REQUEST_INIT, 1),
    (NOTIFY_INITIALIZED, 0),
    (list_tools, 1),
])
