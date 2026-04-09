# abbr run_clean "npm run clean"
# abbr run_build "npm run build"
# abbr run_watch "npm run watch"

# * make abbrs for npm run script keys! I like it!
#  this can become a common convention to easily locate build steps
#  run_SCRIPT i.e. run_build, run_watch, etc
# Reminder abbreviation for a single integration test example
abbr "run_only_one_test" "npm run test:watch:integration-all -- --testNamePattern 'should be killed and not be a test level timeout'"

set my_dir (dirname (status --current-filename))
set npm_scripts (cat $my_dir/package.json | jq ".scripts | keys | .[]" -r)
for s in $npm_scripts
    abbr "run_$s" "npm run $s"
end
