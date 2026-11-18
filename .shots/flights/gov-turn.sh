#!/bin/sh
# One lock turn: the governor on the overloaded phone stand-in, before (the first stage's build) and after (the
# final build), every transition; then the healthy phone and a display capped at thirty on the final build.
cd "$(dirname "$0")/../.." || exit 1
L=.shots/flights/logs
SG='{"slowGpu":48,"slowBake":48}'
B=.shots/flights/nogpu/dist-fixed
A=.shots/flights/dist-final
run() {
  name=$1; shift
  echo "### $name $(date +%H:%M:%S) $(pmset -g batt | head -1): $*"
  node scripts/perf/flights.mjs "$@" > $L/gov-$name.log 2>&1
  echo "exit $? $(date +%H:%M:%S)"
}
sh .shots/flights/probe-turn.sh
run before-slow-phone --dist $B --device phone --leave 0 --path all --config "$SG" --tv
run after-slow-phone --dist $A --device phone --leave 0 --path all --config "$SG" --tv
run after-phone --dist $A --device phone --leave 0 --path all --tv
run after-phone30 --dist $A --device phone --raf 30 --leave 0 --path all --tv
echo "### capture $(date +%H:%M:%S)"
rm -rf .shots/flights/capture
node scripts/perf/rest.mjs --dist $A --query '&debug=perf' --states room,radio-afloat --seconds 3 --settle 2 --capture .shots/flights/capture --label capture > $L/capture.log 2>&1
echo "exit $? $(date +%H:%M:%S)"
