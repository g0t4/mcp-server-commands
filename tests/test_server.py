from __future__ import annotations

import asyncio
from pathlib import Path

import pytest

from mcp_server_commands.processes import execute, get_process
from mcp_server_commands.server import create_server


async def test_run_bash_heredoc() -> None:
    result = await execute("bash", "cat <<EOF\nline one\nline two\nEOF")
    s = result.structuredContent
    assert s is not None
    assert s["exit_code"] == 0
    assert s["stdout"] == "line one\nline two\n"


async def test_run_bash_pipe_and_brace() -> None:
    result = await execute("bash", "echo {a,b,c} | tr ' ' '\\n'")
    s = result.structuredContent
    assert s is not None
    assert s["exit_code"] == 0
    assert s["stdout"] == "a\nb\nc\n"


async def test_run_xonsh_python_expression() -> None:
    result = await execute("xonsh", "print(sum([1, 2, 3, 4]))")
    s = result.structuredContent
    assert s is not None
    assert s["exit_code"] == 0
    assert s["stdout"] == "10\n"


async def test_run_xonsh_python_shell_interop() -> None:
    result = await execute("xonsh", "print(int($(echo 5)) * 2)")
    s = result.structuredContent
    assert s is not None
    assert s["exit_code"] == 0
    assert s["stdout"] == "10\n"


async def test_run_bash_nonzero_exit_is_error() -> None:
    result = await execute("bash", "exit 3")
    s = result.structuredContent
    assert s is not None
    assert s["exit_code"] == 3
    assert result.isError is True


async def test_run_bash_timeout_terminates_process_group() -> None:
    result = await execute("bash", "sleep 10", timeout_seconds=0.05)
    s = result.structuredContent
    assert s is not None
    assert s["timed_out"] is True
    assert s["exit_code"] != 0


async def test_background_run_bash_returns_token() -> None:
    result = await execute("bash", "sleep 0.2", background=True)
    s = result.structuredContent
    assert s is not None
    assert s["background"] is True
    assert s["token"]
    assert get_process(s["token"]) is not None


async def test_process_status_reports_done_and_result() -> None:
    result = await execute("bash", "echo hello", background=True)
    s = result.structuredContent
    assert s is not None
    token = s["token"]

    for _ in range(20):
        bg = get_process(token)
        if bg and bg.done:
            break
        await asyncio.sleep(0.05)

    status = await create_server().call_tool("process_status", {"token": token})
    ss = status.structuredContent or {}
    assert ss["done"] is True
    assert "hello" in ss["result"]["stdout"]


async def test_process_stop_kills_background() -> None:
    result = await execute("bash", "sleep 30", background=True)
    s = result.structuredContent
    assert s is not None
    token = s["token"]

    stop = await create_server().call_tool("process_stop", {"token": token})
    ss = stop.structuredContent or {}
    assert ss["stopped"] is True

    # The process should finish shortly after being stopped.
    for _ in range(30):
        bg = get_process(token)
        if bg and bg.done:
            break
        await asyncio.sleep(0.05)
    assert bg is not None and bg.done is True


def test_server_exposes_tools() -> None:
    server = create_server()
    tools = server._tool_manager.list_tools()
    names = [tool.name for tool in tools]
    assert names == ["run_bash", "run_xonsh", "process_status", "process_stop"]


async def test_run_bash_via_tool() -> None:
    server = create_server()
    result = await server.call_tool("run_bash", {"command_line": "echo tool"})
    s = result.structuredContent or {}
    assert s["exit_code"] == 0
    assert s["stdout"] == "tool\n"


async def test_run_xonsh_via_tool() -> None:
    server = create_server()
    result = await server.call_tool("run_xonsh", {"code": "print('tool')"})
    s = result.structuredContent or {}
    assert s["exit_code"] == 0
    assert s["stdout"] == "tool\n"


async def test_run_bash_stdin() -> None:
    result = await execute("bash", "cat", stdin="hello from stdin")
    s = result.structuredContent
    assert s is not None
    assert s["exit_code"] == 0
    assert s["stdout"] == "hello from stdin"


async def test_run_xonsh_stdin_and_env() -> None:
    result = await execute(
        "xonsh",
        "import os, sys\nprint(os.environ['MCP_TEST'])\nprint(sys.stdin.read())",
        stdin="from stdin",
        env={"MCP_TEST": "from env"},
    )
    s = result.structuredContent
    assert s is not None
    assert s["exit_code"] == 0
    assert s["stdout"].splitlines() == ["from env", "from stdin"]
