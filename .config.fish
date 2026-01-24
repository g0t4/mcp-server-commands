# abbr run_clean "npm run clean"
# abbr run_build "npm run build"
# abbr run_watch "npm run watch"

# * make abbrs for npm run script keys! I like it!
#  this can become a common convention to easily locate build steps 
#  run_SCRIPT i.e. run_build, run_watch, etc
set npm_scripts (cat package.json | jq ".scripts | keys | .[]" -r)
for s in $npm_scripts
    abbr "run_$s" "npm run $s"
end
