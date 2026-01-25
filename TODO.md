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
