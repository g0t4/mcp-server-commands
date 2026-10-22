## `run_bash` tool

The `run_bash` tool runs processes on the host machine via **`command_line`** (string) — executed through the system's default shell (just like typing into `bash`/`fish`/`pwsh`/etc). Shell features like pipes, redirects, and variable expansion all work.

If you want your model to use specific shell(s) on a system, I would list them in your system prompt. Or, maybe in your tool instructions, though models tend to pay better attention to examples in a system prompt.

Let me know if you encounter problems!

## Unified server

The server is a single FastMCP server in `src/mcp_server_commands/` that merges
`run_bash` and `run_xonsh` into one server with **shared** `process_status` and
`process_stop` tools (token-based). It replaced the old TypeScript server.

The Python SDK is pinned to `mcp>=1.9,<2` because mcp 2.x renamed `FastMCP` to
`MCPServer` and switched several field names to snake_case (`structured_content`,
`is_error`, etc.). The v1 line still receives critical fixes, so this pin is
intentional. When migrating to 2.x, the changes are mechanical: import renames,
snake_case accessors, and dict access for `ctx.request_context.meta`'s
`progress_token`.

## Tools

Command stdout and stderr are returned in full, without a byte limiter, for both
foreground and background execution. This preserves large payloads such as image
data URIs. There is no `max_output_bytes` parameter.

Tools are for LLMs to request. Claude Sonnet 3.5 intelligently uses `run_bash`. And, initial testing shows promising results with [Groq Desktop with MCP](https://github.com/groq/groq-desktop-beta) and `llama4` models.

Currently, just one command to rule them all!

- `run_bash` - run a command, i.e. `hostname` or `ls -al` or `echo "hello world"` etc
  - Returns `STDOUT` and `STDERR` as text
  - Optional `stdin` parameter means your LLM can
    - pass scripts over `STDIN` to commands like `fish`, `bash`, `zsh`, `python`
    - create files with `cat >> foo/bar.txt` from the text in `stdin`

> [!WARNING]
> Be careful what you ask this server to run!
> In Claude Desktop app, use `Approve Once` (not `Allow for This Chat`) so you can review each command, use `Deny` if you don't trust the command.
> Permissions are dictated by the user that runs the server.
> DO NOT run with `sudo`.

## Video walkthrough

<a href="https://youtu.be/0-VPu1Pc18w"><img src="https://img.youtube.com/vi/0-VPu1Pc18w/maxresdefault.jpg" width="480" alt="YouTube Thumbnail"></a>

## Prompts

Prompts are for users to include in chat history, i.e. via `Zed`'s slash commands (in its AI Chat panel)

- `run_bash` - generate a prompt message with the command output

* FYI this was mostly a learning exercise... I see this as a user requested tool call. That's a fancy way to say, it's a template for running a command and passing the outputs to the model!

## Development

Install dependencies:
```bash
uv sync --dev
```

Run the tests:
```bash
uv run pytest tests/ -q
```

Run the server:
```bash
uv run mcp-server-commands
```

## Installation

To use with Claude Desktop, add the server config:

On MacOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
On Windows: `%APPDATA%/Claude/claude_desktop_config.json`

Groq Desktop (beta, macOS) uses `~/Library/Application Support/groq-desktop-app/settings.json`

### Run with uvx

Run via `uvx`:

```json
{
  "mcpServers": {
    "mcp-server-commands": {
      "command": "uvx",
      "args": ["mcp-server-commands"]
    }
  }
}
```

### Use a local checkout

Make sure to run `uv sync --dev` first.

```json
{
  "mcpServers": {
    "mcp-server-commands": {
      "command": "/path/to/mcp-server-commands/.venv/bin/mcp-server-commands"
    }
  }
}
```

### Set a default working directory

By default, tool calls that don't supply a `cwd` run in the directory the server
was launched from. If you'd rather point the server at a fixed default directory,
pass `--workdir PATH` (or `--workdir=PATH`). A tool call's own `cwd` always takes
precedence over this default.

```json
{
  "mcpServers": {
    "mcp-server-commands": {
      "command": "uvx",
      "args": ["mcp-server-commands", "--workdir", "/path/to/your/project"]
    }
  }
}
```

### Configure the bash interpreter

`run_bash` runs commands through a real bash shell. On startup the server
verifies bash is usable and exits with guidance if it isn't. To point the
server at a specific bash, pass `--bash PATH` (or `--bash=PATH`), or set the
`MCP_SERVER_COMMANDS_BASH` env var. Otherwise it defaults to `bash` on PATH.

```json
{
  "mcpServers": {
    "mcp-server-commands": {
      "command": "uvx",
      "args": ["mcp-server-commands", "--bash", "/bin/bash"]
    }
  }
}
```

## Local Models

- Most models are trained such that they don't think they can run commands for you.
  - Sometimes, they use tools w/o hesitation... other times, I have to coax them.
  - Use a system prompt or prompt template to instruct that they should follow user requests. Including to use `run_bash` without double checking.
- Ollama is a great way to run a model locally (w/ Open-WebUI)

```sh
# NOTE: make sure to review variants and sizes, so the model fits in your VRAM to perform well!

# Probably the best so far is [OpenHands LM](https://www.all-hands.dev/blog/introducing-openhands-lm-32b----a-strong-open-coding-agent-model)
ollama pull https://huggingface.co/lmstudio-community/openhands-lm-32b-v0.1-GGUF

# https://ollama.com/library/devstral
ollama pull devstral

# Qwen2.5-Coder has tool use but you have to coax it
ollama pull qwen2.5-coder
```

### HTTP / OpenAPI

The server is implemented with the `STDIO` transport.
For `HTTP`, use [`mcpo`](https://github.com/open-webui/mcpo) for an `OpenAPI` compatible web server interface.
This works with [`Open-WebUI`](https://github.com/open-webui/open-webui)

```bash
uvx mcpo --port 3010 --api-key "supersecret" -- uv run mcp-server-commands

# uvx runs mcpo => mcpo runs `uv run mcp-server-commands`
# then, mcpo bridges STDIO <=> HTTP
```

> [!WARNING]
> I briefly used `mcpo` with `open-webui`, make sure to vet it for security concerns.

### Logging

The server writes logs to `$XDG_STATE_HOME/mcp-servers/mcp-server-commands.log`
(default `~/.local/state/mcp-servers/mcp-server-commands.log`).

By default, only important messages are logged (i.e. errors).
If you want to see more messages, add `--verbose` to the `args` when configuring the server.

### Debugging

Since MCP servers communicate over stdio, debugging can be challenging. We recommend using the [MCP Inspector](https://github.com/modelcontextprotocol/inspector), which is available as a package script:

```bash
uv run mcp-server-commands
```

The Inspector will provide a URL to access debugging tools in your browser.
