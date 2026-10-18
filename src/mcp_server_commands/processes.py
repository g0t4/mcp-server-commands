"""Unified process execution + registry for the bash and xonsh tools.

Both ``run_bash`` and ``run_xonsh`` share one token-keyed registry and the
same ``process_status``/``process_stop`` tools. A background process is
identified by a token (the client's progressToken, or a synthesized one), not
a PID, so agents can poll/stop either kind the same way.
"""

from __future__ import annotations

import asyncio
import os
import signal
import sys
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

from mcp.types import CallToolResult

from mcp_server_commands.blocking import get_blocking_message

DEFAULT_TIMEOUT_SECONDS = 30.0
DEFAULT_MAX_OUTPUT_BYTES = 131072


@dataclass
class BackgroundProcess:
    """Live handle for a background bash or xonsh process."""

    token: str
    kind: str  # "bash" | "xonsh"
    code: str
    process: asyncio.subprocess.Process | None = None
    done: bool = False
    result: dict | None = None
    error: str | None = None
    task: asyncio.Task | None = None
    # Streamed output buffers, drained by process_status on each poll so
    # callers only see NEW output since their last status check.
    stdout_buffer: str = ""
    stderr_buffer: str = ""


_processes: dict[str, BackgroundProcess] = {}


def register_process(token: str, kind: str, code: str) -> BackgroundProcess:
    bg = BackgroundProcess(token=token, kind=kind, code=code)
    _processes[token] = bg
    return bg


def get_process(token: str) -> BackgroundProcess | None:
    return _processes.get(token)


def stop_process(token: str, signal_name: str = "SIGTERM") -> bool:
    """Kill a background process (the whole group). Returns False if gone."""
    bg = _processes.get(token)
    if bg is None or bg.process is None or bg.process.returncode is not None:
        return False
    try:
        os.killpg(bg.process.pid, getattr(signal, signal_name))
    except (ProcessLookupError, PermissionError):
        return False
    return True


def _resolve_cwd(cwd: str | None, default_cwd: str | None = None) -> Path:
    path = Path(cwd or default_cwd or os.getcwd()).expanduser().resolve()
    if not path.exists():
        raise ValueError(f"cwd does not exist: {path}")
    if not path.is_dir():
        raise ValueError(f"cwd is not a directory: {path}")
    return path


def _build_env(kind: str, changes: dict[str, str | None] | None) -> dict[str, str]:
    env = os.environ.copy()
    if kind == "xonsh":
        # A headless Xonsh process must not inherit TERM=dumb: Xonsh interprets
        # it as a request to construct its readline shell even for `-c`.
        if not changes or "TERM" not in changes:
            env.pop("TERM", None)
        env["PYTHONUNBUFFERED"] = "1"
        env["COLOR_RESULTS"] = "False"
        env["XONSH_SUBPROC_CMD_RAISE_ERROR"] = "False"
        env["XONSH_SUBPROC_RAISE_ERROR"] = "False"
    for key, value in (changes or {}).items():
        if not key or "=" in key or "\x00" in key:
            raise ValueError(f"invalid environment variable name: {key!r}")
        if value is None:
            env.pop(key, None)
        else:
            env[key] = value
    return env


def _truncate_and_decode(data: bytes, limit: int) -> tuple[str, bool, int]:
    original_bytes = len(data)
    truncated = original_bytes > limit
    if truncated:
        data = data[:limit]
    return data.decode("utf-8", errors="replace"), truncated, original_bytes


async def spawn_process(
    kind: str,
    code: str,
    *,
    cwd: str | None = None,
    default_cwd: str | None = None,
    stdin: str | None = None,
    env: dict[str, str | None] | None = None,
    bash_path: str | None = None,
) -> asyncio.subprocess.Process:
    """Create a fresh, non-interactive subprocess (not yet run)."""
    resolved = _resolve_cwd(cwd, default_cwd)
    env = _build_env(kind, env)
    # Attach /dev/null to stdin when no input is provided, so tools that
    # inspect stdin (e.g. ripgrep) don't see a readable socket and hang.
    stdin_fd = (
        asyncio.subprocess.PIPE if stdin is not None else asyncio.subprocess.DEVNULL
    )
    if kind == "bash":
        bash = bash_path or "bash"
        return await asyncio.create_subprocess_exec(
            bash,
            "-c",
            code,
            cwd=resolved,
            env=env,
            stdin=stdin_fd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            start_new_session=True,
        )
    if kind == "xonsh":
        return await asyncio.create_subprocess_exec(
            sys.executable,
            "-m",
            "xonsh",
            "--no-rc",
            "-c",
            code,
            cwd=resolved,
            env=env,
            stdin=stdin_fd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            start_new_session=True,
        )
    raise ValueError(f"unknown kind: {kind!r}")


def _build_result(
    process: asyncio.subprocess.Process,
    stdout: bytes,
    stderr: bytes,
    timed_out: bool,
    max_output_bytes: int,
) -> CallToolResult:
    stdout_text, stdout_truncated, stdout_bytes = _truncate_and_decode(
        stdout, max_output_bytes
    )
    stderr_text, stderr_truncated, stderr_bytes = _truncate_and_decode(
        stderr, max_output_bytes
    )
    structured = {
        "exit_code": process.returncode,
        "stdout": stdout_text,
        "stderr": stderr_text,
    }
    if timed_out:
        structured["timed_out"] = True
    if stdout_truncated:
        structured["stdout_truncated"] = True
        structured["stdout_bytes"] = stdout_bytes
    if stderr_truncated:
        structured["stderr_truncated"] = True
        structured["stderr_bytes"] = stderr_bytes
    return CallToolResult(
        content=[],
        structuredContent=structured,
        isError=process.returncode != 0 or timed_out,
    )


async def _kill_group(process: asyncio.subprocess.Process, signal_name: str) -> None:
    try:
        os.killpg(process.pid, getattr(signal, signal_name))
    except ProcessLookupError:
        pass


async def communicate(
    process: asyncio.subprocess.Process,
    *,
    stdin: str | None = None,
    timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS,
    max_output_bytes: int = DEFAULT_MAX_OUTPUT_BYTES,
) -> CallToolResult:
    """Run a spawned process to completion and build the result."""
    timed_out = False
    try:
        stdout, stderr = await asyncio.wait_for(
            process.communicate(None if stdin is None else stdin.encode()),
            timeout=timeout_seconds,
        )
    except TimeoutError:
        timed_out = True
        await _kill_group(process, "SIGTERM")
        try:
            stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=1.0)
        except TimeoutError:
            await _kill_group(process, "SIGKILL")
            stdout, stderr = await process.communicate()
    except asyncio.CancelledError:
        # The MCP request was cancelled: kill the process group so the running
        # command actually stops, then re-raise.
        await _kill_group(process, "SIGTERM")
        try:
            await process.communicate()
        except Exception:
            pass
        raise
    return _build_result(process, stdout, stderr, timed_out, max_output_bytes)


async def stream(
    process: asyncio.subprocess.Process,
    bg: BackgroundProcess,
    *,
    stdin: str | None = None,
    timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS,
    max_output_bytes: int = DEFAULT_MAX_OUTPUT_BYTES,
) -> CallToolResult:
    """Run a spawned process, streaming output into the bg task's buffers."""
    timed_out = False
    if stdin is not None and process.stdin is not None:
        process.stdin.write(stdin.encode())
        await process.stdin.drain()
        process.stdin.close()

    stdout_chunks: list[bytes] = []
    stderr_chunks: list[bytes] = []

    async def _read_stream(
        stream: asyncio.StreamReader | None,
        chunks: list[bytes],
        buffer_attr: str,
    ) -> None:
        if stream is None:
            return
        try:
            while True:
                chunk = await stream.read(8192)
                if not chunk:
                    break
                chunks.append(chunk)
                setattr(
                    bg,
                    buffer_attr,
                    getattr(bg, buffer_attr) + chunk.decode("utf-8", errors="replace"),
                )
        except asyncio.CancelledError:
            pass
        except Exception:
            pass

    stdout_task = asyncio.create_task(
        _read_stream(process.stdout, stdout_chunks, "stdout_buffer")
    )
    stderr_task = asyncio.create_task(
        _read_stream(process.stderr, stderr_chunks, "stderr_buffer")
    )

    try:
        await asyncio.wait_for(process.wait(), timeout=timeout_seconds)
    except TimeoutError:
        timed_out = True
        await _kill_group(process, "SIGTERM")
        try:
            await asyncio.wait_for(process.wait(), timeout=1.0)
        except TimeoutError:
            await _kill_group(process, "SIGKILL")
            await process.wait()

    await asyncio.gather(stdout_task, stderr_task)
    stdout = b"".join(stdout_chunks)
    stderr = b"".join(stderr_chunks)
    return _build_result(process, stdout, stderr, timed_out, max_output_bytes)


async def execute(
    kind: str,
    code: str,
    *,
    cwd: str | None = None,
    default_cwd: str | None = None,
    stdin: str | None = None,
    env: dict[str, str | None] | None = None,
    timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS,
    max_output_bytes: int = DEFAULT_MAX_OUTPUT_BYTES,
    background: bool = False,
    token: str | None = None,
    bash_path: str | None = None,
    on_background_done: Callable[[dict | None, str | None, int | None], Any] | None = None,
) -> CallToolResult:
    """Execute code in a fresh subprocess (foreground or background)."""
    if not code.strip():
        raise ValueError("code must not be empty")
    if timeout_seconds <= 0:
        raise ValueError("timeout_seconds must be greater than 0")

    if kind == "bash":
        blocked = get_blocking_message(code)
        if blocked is not None:
            return CallToolResult(
                content=[],
                structuredContent={"error": blocked},
                isError=True,
            )

    if background:
        token = token or uuid.uuid4().hex
        bg = register_process(token, kind, code)
        process = await spawn_process(
            kind,
            code,
            cwd=cwd,
            default_cwd=default_cwd,
            stdin=stdin,
            env=env,
            bash_path=bash_path,
        )
        bg.process = process
        bg.task = asyncio.create_task(
            stream(
                process,
                bg,
                stdin=stdin,
                timeout_seconds=timeout_seconds,
                max_output_bytes=max_output_bytes,
            )
        )

        async def _collect_result(task: asyncio.Task) -> None:
            try:
                result = await task
                bg.result = result.structuredContent or {}
            except asyncio.CancelledError:
                bg.error = "cancelled"
                raise
            except Exception as error:
                bg.error = str(error)
            finally:
                bg.done = True
                try:
                    if on_background_done is not None:
                        await on_background_done(
                            bg.result,
                            bg.error,
                            process.pid if bg.process else None,
                        )
                except Exception:
                    pass

        asyncio.create_task(_collect_result(bg.task))
        return CallToolResult(
            content=[],
            structuredContent={
                "token": token,
                "background": True,
                "pid": process.pid,
            },
            isError=False,
        )

    process = await spawn_process(
        kind,
        code,
        cwd=cwd,
        default_cwd=default_cwd,
        stdin=stdin,
        env=env,
        bash_path=bash_path,
    )
    return await communicate(
        process,
        stdin=stdin,
        timeout_seconds=timeout_seconds,
        max_output_bytes=max_output_bytes,
    )
