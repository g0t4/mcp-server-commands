"""Shared helper for driving the MCP server over stdio in tests.

Each test script sends a sequence of newline-delimited JSON-RPC messages to
``uv run -m subagents`` (the MCP stdio server), then pipes the server's
responses through ``jq`` (or renders an image, in the case of screencap).
"""

import subprocess
import sys
import threading
import time
from pathlib import Path

MCP_SERVER_DIR = Path("~/repos/github/g0t4/mcp-server-commands/build/index.js").expanduser()
print(MCP_SERVER_DIR)

REQUEST_INIT = (
    '{"jsonrpc":"2.0","id":1,"method":"initialize","params":'
    '{"protocolVersion":"2024-11-05","capabilities":{},'
    '"clientInfo":{"name":"test","version":"1.0"}}}'
)

# The initialized notification is a notification, so it has no id.
NOTIFY_INITIALIZED = '{"jsonrpc":"2.0","method":"notifications/initialized"}'


def _send_message(proc, message):
    proc.stdin.write(message + "\n")
    proc.stdin.flush()


def run_mcp(messages):
    """Send ``messages`` to the server and return all of its stdout.

    ``messages`` is an iterable of ``(message, delay_after_send_seconds)``
    tuples. Each message is written to the server's stdin, then the delay
    elapses before the next message is sent (mirroring the original fish tests,
    where sleeps kept the pipe open so the server had time to respond). After
    the last delay the stdin pipe is closed, which sends EOF and shuts the
    server down.

    Server stderr is left inherited so it surfaces on the terminal, exactly as
    it did in the fish tests (stdout is reserved for the JSON-RPC transport).
    """
    cmd = ["npx", MCP_SERVER_DIR, "--", "--verbose"]
    proc = subprocess.Popen(
        cmd,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        text=True,
    )

    def _drain_stdout():
        for line in proc.stdout:
            # print(line) # print w/o jq
            pipe_to_jq(line)

    reader = threading.Thread(target=_drain_stdout, daemon=True)
    reader.start()

    for message, delay_after in messages:
        _send_message(proc, message)
        if delay_after:
            time.sleep(delay_after)

    # EOF on stdin tells the stdio server to exit.
    proc.stdin.close()
    proc.wait()
    reader.join() # block once dump is all that remains


def pipe_to_jq(stdout):
    """Feed ``stdout`` through ``jq``, mirroring the original ``| jq`` pipeline."""
    jq = subprocess.run(["jq"], input=stdout, text=True)
    if jq.returncode != 0:
        sys.exit(jq.returncode)
