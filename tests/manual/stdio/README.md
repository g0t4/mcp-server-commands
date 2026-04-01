## NOTES

```sh

echo '{ "jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {} }'  \
    | npx ~/repos/github/g0t4/mcp-server-commands/build/index.js | jq

cat ~/.local/share/mcp-server-commands/commands.log
# [2026-03-31T08:32:55.070Z] INFO: ToolRequest: {"method":"tools/call","params":{"name":"run_process","arguments":{"command_line":"system_profiler SPUSBDataType SPThunderboltDataType -json"}}}

# build requests with gui form, then copy/paste
npm run inspector

# manual session w/ back to back requests:
node ~/repos/github/g0t4/mcp-server-commands/build/index.js --verbose
# => paste request and hit return (new line) to "submit"
#    entire message must be on one line
```

