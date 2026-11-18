#!/bin/sh
# One lock turn: build the current tree to .shots/flights/dist-final, then rest.mjs at rest per view on desktop and
# phone, each at its starting tier and the lowest (the "after" of rest-before-*.json). Run inside quiet.py run.
cd "$(dirname "$0")/../.." || exit 1
L=.shots/flights/logs
D=.shots/flights/dist-final
echo "### build $(date +%H:%M:%S) $(git rev-parse --short HEAD)"
rm -rf $D && npx vite build --outDir $D --emptyOutDir > $L/build-final.log 2>&1 || { echo build failed; tail -20 $L/build-final.log; exit 1; }
echo "### built $(date +%H:%M:%S)"
for spec in "desktop|--device desktop" "desktop-low|--device desktop --query &quality=low" "phone|--device phone" "phone-low|--device phone --query &quality=low"; do
  name=${spec%%|*}; args=${spec#*|}
  echo "### rest after $name $(date +%H:%M:%S) $(pmset -g batt | head -1)"
  node scripts/perf/rest.mjs --dist $D --label "after $name" --json $L/rest-after-$name.json $args > $L/rest-after-$name.log 2>&1
  echo "exit $? $(date +%H:%M:%S)"
done
echo "### bundle report $(date +%H:%M:%S)"
pnpm report:bundle > $L/bundle.log 2>&1
echo "exit $? $(date +%H:%M:%S)"
echo "### bundle delta $(date +%H:%M:%S)"
sh .shots/flights/bundle-delta.sh > $L/bundle-delta.log 2>&1
echo "exit $? $(date +%H:%M:%S)"
echo "### readout shots $(date +%H:%M:%S)"
node .shots/flights/readout-shot.mjs .shots/flights/dist-final .shots/flights/look/readout > $L/readout.log 2>&1
echo "exit $? $(date +%H:%M:%S)"
