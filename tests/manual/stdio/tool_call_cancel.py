#!/usr/bin/env python3
"""Manual stdio test: MCP cancellation (notifications/cancelled).

1. send a tools/call for `sleep 10; echo <unique-marker>`
2. verify the sleep is running via `pgrep -ilfa <marker>`
3. wait 1 second, send notifications/cancelled for request id 1
4. verify the process is gone (no pgrep match)
"""
import json
import os
import random
import subprocess
import sys
import time

SERVER = os.path.expanduser("~/repos/github/g0t4/mcp-server-commands/build/index.js")
marker = f"super-unique-message-{random.randint(10000, 99999)}"

proc = subprocess.Popen(
    ["npx", SERVER, "--", "--verbose"],
    stdin=subprocess.PIPE,
    stdout=subprocess.PIPE,
    stderr=subprocess.STDOUT,
    text=True,
    bufsize=1,
)


def send(obj: dict) -> None:
    line = json.dumps(obj)
    print(f"> {line}")
    proc.stdin.write(line + "\n")
    proc.stdin.flush()


def pgrep_running() -> list[str]:
    """Full command lines of processes matching the marker."""
    try:
        out = subprocess.run(
            ["pgrep", "-ilfa", marker],
            capture_output=True,
            text=True,
            timeout=5,
        ).stdout
    except Exception:
        return []
    return [line for line in out.splitlines() if line.strip()]


# handshake (optional in older SDKs, keeps newer revisions happy)
send({"jsonrpc": "2.0", "id": 1, "method": "initialize",
      "params": {"protocolVersion": "2024-11-05", "capabilities": {},
                 "clientInfo": {"name": "cancel-test", "version": "1.0"}}})
time.sleep(0.5)
send({"jsonrpc": "2.0", "method": "notifications/initialized"})

# 1. tools/call that sleeps then echoes the unique marker
send({"jsonrpc": "2.0", "id": 2, "method": "tools/call",
      "params": {"name": "run_process",
                 "arguments": {"command_line": f"sleep 10; echo {marker}"}}})

# 2. wait until the sleep is actually running
started = time.time()
running = []
while time.time() - started < 10:
    running = pgrep_running()
    if running:
        break
    time.sleep(0.1)

assert running, "FAIL: sleep process never appeared"
print("RUNNING (verified via pgrep):")
for line in running:
    print(f"  {line}")

# 3. wait 1 second, then cancel request id 2
time.sleep(1)
send({"jsonrpc": "2.0", "method": "notifications/cancelled",
      "params": {"requestId": 2, "reason": "cancelled by manual cancel test"}})

# 4. verify the process is gone
gone = False
while time.time() - started < 15:
    if not pgrep_running():
        gone = True
        break
    time.sleep(0.1)

assert gone, "FAIL: process still running after cancel"
print("CANCELLED OK: no pgrep match after notifications/cancelled")

# grab the server's final response for the request
proc.stdin.close()
deadline = time.time() + 5
while time.time() < deadline:
    line = proc.stdout.readline()
    if not line:
        break
    print(f"< {line.rstrip()}")

proc.terminate()
try:
    proc.wait(timeout=3)
except subprocess.TimeoutExpired:
    proc.kill()
