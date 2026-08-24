#!/usr/bin/env python3
"""
pytest (e2e) for MCP cancellation via stdio against the real server.

FYI This is in python because I can use this for other MCP servers and consolidate on one set of e2e tests for all of my MCP servers.
Or, if I don't go that path I can always convert this to typescript+node too.
"""
import json
import os
import random
import subprocess
import time

import pytest

SERVER = os.environ.get(
    "MCP_SERVER_COMMANDS",
    os.path.expanduser("~/repos/github/g0t4/mcp-server-commands/build/index.js"),
)


class McpStdioClient:
    """Tiny line-delimited JSON-RPC client speaking to the MCP server over stdio."""

    def __init__(self) -> None:
        self.proc = subprocess.Popen(
            ["npx", SERVER, "--", "--verbose"],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
        )

    def send(self, message: dict) -> None:
        self.proc.stdin.write(json.dumps(message) + "\n")
        self.proc.stdin.flush()

    def close(self) -> None:
        try:
            self.proc.stdin.close()
        except Exception:
            pass
        try:
            self.proc.wait(timeout=3)
        except subprocess.TimeoutExpired:
            self.proc.kill()


def pgrep_running(marker: str) -> list[str]:
    """Full command lines of processes whose cmdline contains `marker`."""
    try:
        output = subprocess.run(
            ["pgrep", "-ilfa", marker],
            capture_output=True,
            text=True,
            timeout=5,
        ).stdout
    except Exception:
        return []
    return [line for line in output.splitlines() if line.strip()]


def wait_until(predicate, timeout_s: float, interval_s: float = 0.1) -> bool:
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        if predicate():
            return True
        time.sleep(interval_s)
    return False


@pytest.fixture
def mcp_client():
    client = McpStdioClient()
    yield client
    client.close()


def test_cancel_stops_a_running_sleep(mcp_client: McpStdioClient) -> None:
    marker = f"super-unique-message-{random.randint(10000, 99999)}"

    # handshake (optional in older SDKs, required by newer protocol revisions)
    mcp_client.send({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": {
            "protocolVersion": "2024-11-05",
            "capabilities": {},
            "clientInfo": {"name": "cancel-test", "version": "1.0"},
        },
    })
    time.sleep(0.5)
    mcp_client.send({"jsonrpc": "2.0", "method": "notifications/initialized"})

    # 1. start a process that sleeps 10s then echoes the unique marker
    mcp_client.send({
        "jsonrpc": "2.0",
        "id": 2,
        "method": "tools/call",
        "params": {
            "name": "run_process",
            "arguments": {"command_line": f"sleep 10; echo {marker}"},
        },
    })

    # 2. wait until the sleep is actually running
    assert wait_until(lambda: pgrep_running(marker), timeout_s=10.0), \
        "FAIL: sleep process never appeared"

    # 3. wait 1 second, then cancel the request
    time.sleep(1)
    mcp_client.send({
        "jsonrpc": "2.0",
        "method": "notifications/cancelled",
        "params": {"requestId": 2, "reason": "cancelled by manual cancel test"},
    })

    # 4. verify the process is gone
    assert wait_until(lambda: not pgrep_running(marker), timeout_s=15.0), \
        "FAIL: process still running after cancel"
