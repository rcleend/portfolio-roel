#!/bin/sh
# One lock turn: the whole e2e suite, then the cold first pull-back at 0, 1 and 10 s after ready on desktop and phone,
# each at its starting tier and the lowest, on the final build.
cd "$(dirname "$0")/../.." || exit 1
L=.shots/flights/logs
echo "### e2e $(date +%H:%M:%S)"
E2E_PORT=4731 pnpm e2e --reporter=line > $L/e2e-final.log 2>&1
echo "exit $? $(date +%H:%M:%S)"
for leave in 0 1000 10000; do
  for spec in "desktop|--tv" "desktop-low|--query &quality=low" "phone|--device phone --tv" "phone-low|--device phone --query &quality=low"; do
    name=${spec%%|*}; args=${spec#*|}
    echo "### first $name leave $leave $(date +%H:%M:%S)"
    node scripts/perf/flights.mjs --dist .shots/flights/dist-final --leave $leave --path first $args > "$L/final-first-$name-$leave.log" 2>&1
    echo "exit $? $(date +%H:%M:%S)"
  done
done
