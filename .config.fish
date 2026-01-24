# abbr run_clean "npm run clean"
# abbr run_build "npm run build"
# abbr run_watch "npm run watch"

# * make abbrs for npm run script keys! I like it!
#  this can become a common convention to easily locate build steps 
#  run_SCRIPT i.e. run_build, run_watch, etc

set -l script_entries (jq -r '.scripts | to_entries[] | "\(.key)\t\(.value)"' package.json)

for entry in $script_entries
    set -l parts (string split (printf '\t') $entry)
    set -l key $parts[1]
    set -l cmd $parts[2]

    abbr "run_$key" "$cmd"
end | string split "\t"
