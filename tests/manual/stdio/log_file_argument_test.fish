#!/usr/bin/env fish
# Test that the server respects the --logFile CLI argument and creates the log file.

# Create a temporary file path for the log output. `mktemp` will create the file,
# we will delete it afterwards.
set tmp_log (mktemp /tmp/mcp-log.XXXXXX)

set request '{ "jsonrpc": "2.0", "id": 1, "method": "tools/list" }'

# Run the server, passing the temporary log location via the new CLI flag.
echo $request \
    | npx ~/repos/github/g0t4/mcp-server-commands/build/index.js -- --logFile=$tmp_log --verbose \
    | jq

# Verify that the log file was created at the path we supplied and contains data.
if test -f $tmp_log
    # Ensure the file is not empty.
    # Use `stat` compatible with both GNU and BSD/macOS.
    set size (stat -c %s $tmp_log 2>/dev/null || stat -f %z $tmp_log)
    if test $size -gt 0
        echo "Log file successfully created at $tmp_log with $size bytes"
        echo "--- Log file content ---"
        cat $tmp_log
        echo "--- End of log file ---"
    else
        echo "ERROR: Log file $tmp_log is empty" >&2
        exit 1
    end
else
    echo "ERROR: Log file was not created at $tmp_log" >&2
    exit 1
end
