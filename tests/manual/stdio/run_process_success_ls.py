#!python3
import json
import sys
from pathlib import Path

from mcp_stdio import NOTIFY_INITIALIZED, REQUEST_INIT, run_mcp

run_process = json.dumps({
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
        "name": "run_process",
        "arguments": {
            "command_line": "ls",
        },
    }
})

run_mcp([
    (REQUEST_INIT, 1),
    (NOTIFY_INITIALIZED, 0),
    (run_process, 1),
])

# * STDOUT
#
# {
#   "result": {
#     "content": [
#       {
#         "name": "EXIT_CODE",
#         "type": "text",
#         "text": "0"
#       },
#       {
#         "name": "STDOUT",
#         "type": "text",
#         "text": "build\nCHANGELOG.md\njest.config.js\nLICENSE\nnode_modules\npackage-lock.json\npackage.json\nREADME.md\nsrc\ntests\nTODO.md\ntsconfig.json\n"
#       }
#     ]
#   },
#   "jsonrpc": "2.0",
#   "id": 1
# }
