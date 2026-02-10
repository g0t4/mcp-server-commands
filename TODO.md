## 

- `start_job`
   - assumptions:
       - agent exits => jobs are killed
   - perhaps take one arg that takes all the same args as runProcess and then I can create siblings to this with any async specific args
   - `max_runtime` - cap to say 1 hour or 1 day max? i.e. a dev web server you could otherwise forget about
   - TODOs
      - review `docker run` docs for ideas for other args that are essential (don't get carried away)
         - https://docs.docker.com/engine/containers/run/
      - PRN allow passing job id? so they can be named i.e. `web` and `db` etc? instead of generated ID? would that make it easier for agent to target jobs?
- Conditional Tools?
    - Only available w/ at least one job running?
       - OR, *enter_job_manager_mode* where these tools become available!
           that would allow fine grained tools w/o wasted tokens on most requests that would be unrelated
           I like the idea of modes with different tool sets and constraints
    - common args:
       - `jobids` - `1` or `1,4,5` or `ALL`
    - `list_jobs`
       - if I go with log files on disk, show the path to the log file(s) per job
    - `stop_job`
       - `jobids` 
       - `signal` to stop
       - `timeout` after which it'll be killed
    - `read_job_logs`
       - `jobids`
       - `query` (regex)
       - `since`
       - `max_lines`
       - TODO, could I just use actual files and let the agent read those files like normal w/ ripgrep/sed/etc? why have a special tool when logs can and should go to disk!!
    - `restart_job` - continuity to stop and start again, i.e. bouncing a web server after making changes (though ideally you'd be using hot reload capable web servers, though that is not always possible!)
       - `jobids`
    - `reset_job_logs` - think rotate logs in journalctl
       - `jobids` - use `all` to reset all

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
