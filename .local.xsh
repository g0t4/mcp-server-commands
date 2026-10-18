"""Repo-local Xonsh config: npm run abbreviations (ported from .config.fish)."""

import json
from pathlib import Path

from wes_local_config import local_abbr


# Reminder abbreviation for a single integration test example.
local_abbr(
    "run_only_one_test",
    "npm run test:watch:integration-all -- --testNamePattern 'should be killed and not be a test level timeout'",
)


# Generate run_<script> abbreviations for every package.json script, so the
# build/test/watch steps are easy to locate as run_clean, run_build, run_watch,
# etc. This mirrors the .config.fish convention of run_SCRIPT => npm run SCRIPT.
_here = Path(__file__).resolve().parent
_package_json = _here / "package.json"
if _package_json.is_file():
    _package_scripts = json.loads(_package_json.read_text()).get("scripts", {})
    for _script_name in _package_scripts:
        local_abbr(f"run_{_script_name}", f"npm run {_script_name}")
