## TODO configure server level command + options for shell execution mode?

=> i.e. shell command path + args + maybe even shell specific overrides for config file location? so you could have minimal agent config and the agent isn't using your user config! i.e. in fish the ls function dumps ANSI color codes.. I'd want to get rid of those for agents

NOTE this would be for shell mode only (commandline passed) and not for argv (exec mode)

## NOTES

```sh

echo '{ "jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {} }'  \
    | ~/repos/github/g0t4/mcp-server-commands/.venv/bin/mcp-server-commands | jq

cat ~/.local/state/mcp-servers/mcp-server-commands.log
# [2026-03-31T08:32:55.070Z] INFO: ToolRequest: {"method":"tools/call","params":{"name":"run_bash","arguments":{"command_line":"system_profiler SPUSBDataType SPThunderboltDataType -json"}}}

# build requests with gui form, then copy/paste
uv run mcp-server-commands

# manual session w/ back to back requests:
~/repos/github/g0t4/mcp-server-commands/.venv/bin/mcp-server-commands --verbose
# => paste request and hit return (new line) to "submit"
#    entire message must be on one line
```
