"""Unified MCP server exposing run_bash, run_xonsh, and shared status/stop tools."""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
from typing import Any

from mcp.server.fastmcp import Context, FastMCP
from mcp.types import CallToolResult, Notification, Tool as MCPTool

from mcp_server_commands.mcp_logging import LogContext
from mcp_server_commands.processes import (
    DEFAULT_TIMEOUT_SECONDS,
    execute,
    get_process,
    stop_process,
)

_log = LogContext("mcp-server-commands")
_verbose = False

# pydantic happily deletes types without a strict model, so keep this annotated.
_Notification = Notification[dict[str, Any], str]


def _token_from_context(ctx: Context | None) -> str | None:
    if ctx is None:
        return None
    try:
        meta = ctx.request_context.meta
    except ValueError:
        # Not inside a live request (e.g. tests calling call_tool directly).
        return None
    if meta is None:
        return None
    progress = meta.progressToken
    return None if progress is None else str(progress)


async def _on_background_done(
    ctx: Context,
    result: dict | None,
    error: str | None,
    pid: int | None = None,
) -> None:
    progress_token = _token_from_context(ctx)
    if error is not None:
        message = f"FAILED: Background process failed with error: {error}"
    else:
        message = "DONE: Background process completed"

    params: dict[str, Any] = {
        "progressToken": progress_token,
        "message": message,
        "result": result,
        "error": error,
        "pid": pid,
    }
    # Avoid vim.NIL for null/None values.
    for key in ("result", "error", "pid"):
        if params.get(key) is None:
            del params[key]

    notification = _Notification(method="background/done", params=params)
    await ctx.request_context.session.send_notification(notification)


def _strip_titles(node: Any) -> Any:
    """Recursively drop Pydantic's auto-generated ``title`` keys."""
    if isinstance(node, dict):
        node.pop("title", None)
        for child in node.values():
            _strip_titles(child)
    elif isinstance(node, list):
        for child in node:
            _strip_titles(child)
    return node


class NoRedundantTitlesFastMCP(FastMCP):
    """FastMCP that omits Pydantic's auto-generated ``title`` keys."""

    async def list_tools(self) -> list[MCPTool]:
        tools = await super().list_tools()
        for tool in tools:
            tool.inputSchema = _strip_titles(tool.inputSchema)
        return tools


def create_server(workdir: str | None = None, bash_path: str | None = None) -> FastMCP:
    _log.configure_python_logging()

    server = NoRedundantTitlesFastMCP(
        "mcp-server-commands",
        instructions=(
            "Run commands through a shell. Use run_bash for bash semantics "
            "(pipes, heredocs, shell features) and run_xonsh for Python and "
            "Python+shell interop. Each call is isolated."
        ),
    )

    @server.tool(
        name="run_bash",
        description=(
            "Run a bash command line in a fresh process. Bash semantics "
            "(pipes, heredocs, globbing). Returns structured stdout, stderr, "
            "exit status and timeout metadata. Output is returned in full. "
            "Use background=True to return immediately with a TOKEN; then use "
            "process_status to poll and process_stop to stop it."
        ),
    )
    async def run_bash(
        command_line: str,
        cwd: str | None = None,
        stdin_text: str | None = None,
        timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS,
        background: bool = False,
        ctx: Context | None = None,
    ) -> CallToolResult:
        token = _token_from_context(ctx)
        on_done = None
        if background and ctx is not None:
            on_done = lambda result, error, pid: _on_background_done(
                ctx, result, error, pid
            )
        return await execute(
            "bash",
            command_line,
            cwd=cwd,
            default_cwd=workdir,
            stdin=stdin_text,
            timeout_seconds=timeout_seconds,
            background=background,
            token=token,
            bash_path=bash_path,
            on_background_done=on_done,
        )

    @server.tool(
        name="run_xonsh",
        description=(
            "Run Xonsh source in a fresh process. Xonsh accepts shell-like "
            "commands and ordinary Python in the same program. Returns "
            "structured stdout, stderr, exit status and timeout metadata. "
            "Output is returned in full. Use background=True to return immediately with a TOKEN; "
            "then use process_status to poll and process_stop to stop it."
        ),
    )
    async def run_xonsh(
        code: str,
        cwd: str | None = None,
        stdin: str | None = None,
        env: dict[str, str | None] | None = None,
        timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS,
        background: bool = False,
        ctx: Context | None = None,
    ) -> CallToolResult:
        token = _token_from_context(ctx)
        on_done = None
        if background and ctx is not None:
            on_done = lambda result, error, pid: _on_background_done(
                ctx, result, error, pid
            )
        return await execute(
            "xonsh",
            code,
            cwd=cwd,
            default_cwd=workdir,
            stdin=stdin,
            env=env,
            timeout_seconds=timeout_seconds,
            background=background,
            token=token,
            on_background_done=on_done,
        )

    @server.tool(
        name="process_status",
        description=(
            "Check the status of a background process by token (from run_bash "
            "or run_xonsh with background=True). Reports done (true/false) plus "
            "the result or error. While running, returns any newly accumulated "
            "stdout/stderr since the last poll (buffers are drained)."
        ),
    )
    async def process_status(token: str) -> CallToolResult:
        bg = get_process(token)
        if bg is None:
            return CallToolResult(
                content=[],
                structuredContent={"error": f"Unknown token: {token}"},
                isError=True,
            )
        pid = bg.process.pid if bg.process else None
        if not bg.done:
            structured: dict[str, Any] = {
                "token": token,
                "done": False,
                "pid": pid,
            }
            if bg.stdout_buffer:
                structured["stdout"] = bg.stdout_buffer
                bg.stdout_buffer = ""
            if bg.stderr_buffer:
                structured["stderr"] = bg.stderr_buffer
                bg.stderr_buffer = ""
            return CallToolResult(
                content=[], structuredContent=structured, isError=False
            )
        if bg.error:
            return CallToolResult(
                content=[],
                structuredContent={
                    "token": token,
                    "done": True,
                    "error": bg.error,
                    "pid": pid,
                },
                isError=True,
            )
        return CallToolResult(
            content=[],
            structuredContent={
                "token": token,
                "done": True,
                "result": bg.result or {},
                "pid": pid,
            },
            isError=False,
        )

    @server.tool(
        name="process_stop",
        description=(
            "Stop a background process by token (from run_bash or run_xonsh "
            "with background=True). Sends SIGTERM, escalating to SIGKILL."
        ),
    )
    async def process_stop(token: str) -> CallToolResult:
        if get_process(token) is None:
            return CallToolResult(
                content=[],
                structuredContent={"error": f"Unknown token: {token}"},
                isError=True,
            )
        # Idempotent: stopping an already-finished process is not an error.
        stopped = await stop_process(token)
        return CallToolResult(
            content=[],
            structuredContent={"token": token, "stopped": stopped},
            isError=False,
        )

    return server


def _bash_error(bash_path: str) -> str | None:
    """Return an error message if bash can't be run, else None."""
    try:
        result = subprocess.run(
            [bash_path, "--version"], capture_output=True, check=False
        )
    except OSError as error:
        return f"could not run bash: {error}"
    if result.returncode != 0:
        return f"bash exited with status {result.returncode}"
    return None


def main() -> None:
    parser = argparse.ArgumentParser(
        description="MCP server exposing unified bash and xonsh execution"
    )
    parser.add_argument(
        "--transport",
        choices=("stdio", "streamable-http"),
        default="stdio",
    )
    parser.add_argument(
        "--workdir",
        default=os.environ.get("MCP_SERVER_COMMANDS_WORKDIR"),
        help=(
            "Default working directory when no cwd is provided. Falls back to "
            "the MCP_SERVER_COMMANDS_WORKDIR environment variable."
        ),
    )
    parser.add_argument(
        "--bash",
        default=os.environ.get("MCP_SERVER_COMMANDS_BASH"),
        help="Path to the bash interpreter (defaults to 'bash' on PATH).",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Enable verbose logging for debugging.",
    )
    args = parser.parse_args()
    global _verbose
    _verbose = args.verbose
    bash = args.bash or "bash"
    problem = _bash_error(bash)
    if problem:
        print(
            f'run_bash requires bash, but "{bash}" is not usable ({problem}).\n'
            "Provide the path to bash via the --bash argument or the "
            "MCP_SERVER_COMMANDS_BASH env var, then restart the server.",
            file=sys.stderr,
        )
        raise SystemExit(1)
    create_server(workdir=args.workdir, bash_path=bash).run(transport=args.transport)


if __name__ == "__main__":
    main()
