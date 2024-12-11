# mcp-server-commands

An MCP server to run commands.

> [!WARNING]
> Be careful what you ask this server to run!
> In Claude Desktop app, use `Approve Once` (not `Allow for This Chat`) so you can review each command, use `Deny` if you don't trust the command.
> Permissions are dictated by the user that runs the server.
> DO NOT run with `sudo`.

## Tools

Tools are for LLMs to request, i.e. Claude Desktop app. Claude Sonnet 3.5 intelligently uses both tools, I was pleasantly surprised.

- `run_command` - run a command, i.e. `hostname` or `ls -al` or `echo "hello world"` etc
  - Returns STDOUT and STDERR as text
- `run_script` - run a script! (i.e. `fish`, `bash`, `zsh`, `python`)
  - Let your LLM run the code it writes!
  - script is passed over STDIN
  - `run_script` == `run_command` + script over STDIN
  - Claude has been pretty creative with this, i.e. using `cat` as the interpreter to create new files!

## Prompts

Prompts are for users to include in chat history, i.e. via `Zed`'s slash commands (in its AI Chat panel)

- `run_command` - generate a prompt message with the command output

## Development

Install dependencies:
```bash
npm install
```

Build the server:
```bash
npm run build
```

For development with auto-rebuild:
```bash
npm run watch
```

## Installation

To use with Claude Desktop, add the server config:

On MacOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
On Windows: `%APPDATA%/Claude/claude_desktop_config.json`

### Use the published npm package

```json
{
  "mcpServers": {
    "mcp-server-commands": {
      "command": "npx",
      "args": ["mcp-server-commands"]
    }
  }
}
```

### Use a local build (repo checkout)

```json
{
  "mcpServers": {
    "mcp-server-commands": {
      // works b/c of shebang in index.js
      "command": "/path/to/mcp-server-commands/build/index.js"
    }
  }
}
```

### Logging

Claude Desktop app writes logs to `~/Library/Logs/Claude/mcp-server-mcp-server-commands.log`

By default, only important messages are logged (i.e. errors).
If you want to see more messages, add `--verbose` to the `args` when configuring the server.

By the way, logs are written to `STDERR` because that is what Claude Desktop routes to the log files.
In the future, I expect well formatted log messages to be written over the `STDIO` transport to the MCP client (note: not Claude Desktop app).

### Debugging

Since MCP servers communicate over stdio, debugging can be challenging. We recommend using the [MCP Inspector](https://github.com/modelcontextprotocol/inspector), which is available as a package script:

```bash
npm run inspector
```

The Inspector will provide a URL to access debugging tools in your browser.

## TODOs

- Every time Claude runs a python script, `python` is used as the interpreter. Which fails every time.
    - Thankfully, Claude retries with `python3` and uses that for the rest of the chat. 
        - Hence the idea to have some memory concept across chats! Very selective memory and very minimal.
        - I was thinking of adding a tool for this server alone, one to write to and another to read from this cmdline memory... and then otherwise instruct Claude to judiciously use the memory (i.e. never if possible)
        - And, don't put any constraints on the memory other than a list of strings. Claude can do all that on his own (i.e. a line with `pythoh3` alone should be sufficient, in fact I could do some testing with that alone and see how Claude does)
    - Another example would be `uname` on a Windows machine. 
    - These different scenarios aren't necessarily mission critical to fix but they offer an opportunity to improve the experience.
    - The solution may not be generalizable too and might be specific to commmand that fails, i.e. if I pass the OS name in the ListTools response, that will likely fix that issue.
    - i.e. routinely `python` is used and then `python3`
    - Or, should I have some static mappings of common commands that fail and when they do, use the fallback? And find a way to tell the LLM? Or,
    - Or would some sort of command lookup mechanism be useful? i.e. python3 instead of python
- Add windows tests, linux tests and macOS tests for nuances of each. i.e. pwsh, pwsh-core, cmd.exe on Windows.
- Add a server side request to score risk of a tool request (specific to run_command/run_script?) - this wouldn't be a tool the LLM uses, but rather the client.
    - Claude makes tool request, client passes it to server for scoring, server returns risk, client decides to prompt (or not) and then client sends tool request to server...
    - Or, have client use another LLM score it?
    - I chimed in about this on this discussion: https://github.com/orgs/modelcontextprotocol/discussions/69 
    - Also, some tools might be able to be marked safe in their spec, i.e. getting date/time, fetching a web page... inherently mostly "safe"
    - The fewer prompts the user sees, the most likely that the user will actually read the requested tool use. Otherwise, next next next prompt fatigue kicks in regardless of risk

