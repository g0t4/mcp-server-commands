"""Block dangerous commands before they run.

Currently blocks recursive ``ls -R`` (which can scan huge trees such as
``node_modules``). Applied to the ``run_bash`` tool.
"""

from __future__ import annotations

BLOCKED_RECURSIVE_LS = (
    "Command blocked: recursive ls is disallowed because it may scan node_modules."
)

# Normalize whitespace so `ls   -R` is caught just like `ls -R`.
_BLOCKED = {"ls -R", "bash -lc ls -R"}


def get_blocking_message(command: str) -> str | None:
    """Return a block message if ``command`` should not run, else None."""
    normalized = " ".join(command.strip().split())
    if normalized in _BLOCKED:
        return BLOCKED_RECURSIVE_LS
    return None
