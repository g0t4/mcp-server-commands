## Tools

Tools are for LLMs to request. Claude Sonnet 3.5 intelligently uses `run_process`. And, initial testing shows promising results with [Groq Desktop with MCP](https://github.com/groq/groq-desktop-beta) and `llama4` models.

Currently, just one command to rule them all!

- `run_process` - run a command, i.e. `hostname` or `ls -al` or `echo "hello world"` etc
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

- `run_process` - generate a prompt message with the command output

* FYI this was mostly a learning exercise... I see this as a user requested tool call. That's a fancy way to say, it's a template for running a command and passing the outputs to the model!

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

Groq Desktop (beta, macOS) uses `~/Library/Application Support/groq-desktop-app/settings.json`

### Use the published npm package

Published to npm as [mcp-server-commands](https://www.npmjs.com/package/mcp-server-commands) using this [workflow](https://github.com/g0t4/mcp-server-commands/actions)

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

Make sure to run `npm run build`

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

## Local Models

- Most models are trained such that they don't think they can run commands for you.
  - Sometimes, they use tools w/o hesitation... other times, I have to coax them.
  - Use a system prompt or prompt template to instruct that they should follow user requests. Including to use `run_processs` without double checking.
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
uvx mcpo --port 3010 --api-key "supersecret" -- npx mcp-server-commands

# uvx runs mcpo => mcpo run npx => npx runs mcp-server-commands
# then, mcpo bridges STDIO <=> HTTP
```

> [!WARNING]
> I briefly used `mcpo` with `open-webui`, make sure to vet it for security concerns.

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
