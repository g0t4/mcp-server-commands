## VERIFY CANCEL WORKS and IS APPROPRIATE

I added cancel by killing processes, is that the best way? is it working?
- see e2e test with python script
- verify the integration test too

## Background processes

- Currently I use a custom approach to background tasks. Partly because I want the agent to be fully aware of what runs foreground vs background so they can opt in to run async and get notified on completion
- Use MCP `progressToken` to check status
- Use `pid` to kill => assumes local process... which is fine for now... I can avoid adding a special tool to `kill_process` (for now)
  Honestly I'd like the MCP client to still have task mgmt but allow the agent to decide when tasks run in background...
  and then client can provide a single tool for `get_status`(progressToken) to check done/progress and then `kill_task`(`progressToken`) to stop/kill the tool call
  that way I don't need a status/kill tool for every background-able tool (which would be alot)
  TBD if this works, I think it will
  for now I do expose `process_status` though I am tempted to take it away b/c agents can't help but think they need to poll it...

## OLDER
- TODO remove tree-sitter deps if I don't use it for command parsing/blocking (i.e. ls -R) and then get rid of node version 22 engine constraint

## Reject specific commands / arg combos

- i.e `ls -R`, `grep -R`... and their ilk => fail and have suggestions instead... that way they never get to use a crappy command
   - might want to have a way to modify default shell's startup and inject a script with customizations
     i.e. that can hide `ls`/`grep`/etc commands

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

## Observations from other tools

- When using `codex` from OpenAI:
  - used `nl` to number lines! interesting
  - tool wise had this schema:

    ```json
    {
        "name": "shell",
        "description": "Runs a shell command, and returns its output.",
        "strict": false,
        "parameters": {
            "type": "object",
            "properties": {
                "command": {
                    "type": "array",
                    "items": {
                        "type": "string"
                    }
                },
                "workdir": {
                    "type": "string",
                    "description": "The working directory for the command."
                },
                "timeout": {
                    "type": "number",
                    "description": "The maximum time to wait for the command to complete in milliseconds."
                }
            },
            "required": [
                "command"
            ],
            "additionalProperties": false
        }
    }
    ```
