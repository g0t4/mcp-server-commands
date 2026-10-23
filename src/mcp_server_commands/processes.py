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
import tempfile
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable

from mcp.types import CallToolResult

from mcp_server_commands.blocking import get_blocking_message

DEFAULT_TIMEOUT_SECONDS = 30.0
DEFAULT_MAX_OUTPUT_BYTES = 16 * 1024


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
    stdout_bytes: int = 0
    stderr_bytes: int = 0
    max_output_bytes: int = DEFAULT_MAX_OUTPUT_BYTES
    captures: dict[str, OutputCapture] = field(default_factory=dict)


_processes: dict[str, BackgroundProcess] = {}


def register_process(token: str, kind: str, code: str) -> BackgroundProcess:
    bg = BackgroundProcess(token=token, kind=kind, code=code)
    _processes[token] = bg
    return bg


def get_process(token: str) -> BackgroundProcess | None:
    return _processes.get(token)


async def stop_process(token: str) -> bool:
    """Kill a background process, escalating SIGTERM -> SIGKILL after 2s.

    Returns False if the process is already gone.
    """
    bg = _processes.get(token)
    if bg is None or bg.process is None or bg.process.returncode is not None:
        return False
    try:
        os.killpg(bg.process.pid, signal.SIGTERM)
    except (ProcessLookupError, PermissionError):
        return False

    # Escalate to SIGKILL if the process is still alive after a grace period,
    # so a stuck process that ignores SIGTERM is still stopped.
    async def _escalate() -> None:
        await asyncio.sleep(2.0)
        if bg.process is not None and bg.process.returncode is None:
            try:
                os.killpg(bg.process.pid, signal.SIGKILL)
            except (ProcessLookupError, PermissionError):
                pass

    asyncio.create_task(_escalate())
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


class OutputCapture:
    """Keep small output inline; spill the complete byte stream on overflow."""

    def __init__(self, name: str, limit: int):
        self.name, self.limit = name, limit
        self.data = bytearray()
        self.total_bytes = 0
        self.file = None
        self.path: str | None = None

    def write(self, data: bytes) -> None:
        self.total_bytes += len(data)
        if self.file is None and self.total_bytes > self.limit:
            self.file = tempfile.NamedTemporaryFile(prefix=f"mcp-command-{self.name}-", suffix=".log", delete=False)
            self.path = self.file.name
            self.file.write(self.data)
            self.data.clear()
        if self.file is not None:
            self.file.write(data)
            self.file.flush()  # Polling agents may inspect the file while still running.
        else:
            self.data.extend(data)

    def fields(self) -> dict:
        if self.path is not None:
            return {self.name: "", self.name + "_file": self.path,
                    self.name + "_bytes": self.total_bytes, self.name + "_truncated": True}
        return {self.name: self.data.decode("utf-8", errors="replace")}

    def close(self) -> None:
        if self.file is not None:
            self.file.close()


OUTPUT_FILE_NOTE = "Oversized output was saved to files. Use grep, rg or sed to read selected sections."


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
    output_captures: dict[str, OutputCapture] | None = None,
) -> CallToolResult:
    captures = output_captures or {name: OutputCapture(name, max_output_bytes) for name in ("stdout", "stderr")}
    if output_captures is None:
        try:
            captures["stdout"].write(stdout)
            captures["stderr"].write(stderr)
        finally:
            for capture in captures.values():
                capture.close()
    structured = {"exit_code": process.returncode}
    for capture in captures.values():
        structured.update(capture.fields())
    if any(capture.path for capture in captures.values()):
        structured["output_note"] = OUTPUT_FILE_NOTE
    if timed_out:
        structured["timed_out"] = True
    sig = _signal_name(process.returncode)
    if sig:
        structured["signal"] = sig
    return CallToolResult(
        content=[],
        structuredContent=structured,
        isError=process.returncode != 0 or timed_out,
    )


def _signal_name(returncode: int | None) -> str | None:
    """Map a negative returncode to a signal name (e.g. -9 -> SIGKILL)."""
    if returncode is None or returncode >= 0:
        return None
    try:
        return signal.Signals(-returncode).name
    except ValueError:
        return None


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

    bg.max_output_bytes = max_output_bytes
    bg.captures = {name: OutputCapture(name, max_output_bytes) for name in ("stdout", "stderr")}

    async def _read_stream(stream: asyncio.StreamReader | None, name: str) -> None:
        capture = bg.captures[name]
        if stream is None:
            return
        try:
            while chunk := await stream.read(8192):
                capture.write(chunk)
                setattr(bg, name + "_bytes", capture.total_bytes)
                if capture.path:
                    setattr(bg, name + "_buffer", "")
                else:
                    setattr(bg, name + "_buffer", getattr(bg, name + "_buffer") + chunk.decode("utf-8", errors="replace"))
        finally:
            capture.close()

    stdout_task = asyncio.create_task(_read_stream(process.stdout, "stdout"))
    stderr_task = asyncio.create_task(_read_stream(process.stderr, "stderr"))

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
    return _build_result(process, b"", b"", timed_out, max_output_bytes, bg.captures)


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
