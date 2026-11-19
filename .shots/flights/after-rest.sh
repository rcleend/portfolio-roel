#!/bin/sh
# The after-matrix but for its six leave-0 rows (after.sh has the whole of it): each row waits until no other
# checkout measures (foreign.py wait) and says whether one did while it ran (foreign.py watch). Appends to after-*.log.
cd "$(dirname "$0")/../.." || exit 1
L=.shots/flights/logs
SG='{"slowGpu":48,"slowBake":48}'
run() {
  name=$1; shift
  log="$L/after-$name.log"
  echo "### $name: $*" >> "$log"
  python3 .shots/flights/foreign.py wait >> "$log"
  echo "load $(sysctl -n vm.loadavg) $(date +%H:%M:%S) $(pmset -g batt | head -1)" >> "$log"
  node scripts/perf/flights.mjs "$@" >> "$log" 2>&1 &
  pid=$!
  python3 .shots/flights/foreign.py watch $pid >> "$log"
  wait $pid
}
rm -f $L/after-done.log
for leave in 1000 10000; do
  run desktop --leave $leave --path first --tv
  run desktop-low --leave $leave --path first --query '&quality=low'
  run phone --device phone --leave $leave --path first --tv
  run phone-low --device phone --leave $leave --path first --query '&quality=low'
  run slow-desktop --leave $leave --path first --config "$SG" --tv
  run slow-phone --device phone --leave $leave --path first --config "$SG" --tv
done
run desktop --level 6000 --tv
run phone --device phone --level 6000 --tv
run slow-phone --device phone --level 6000 --config "$SG" --tv
run webkit --browser webkit --leave 0 --path all
run webkit --browser webkit --leave 1000
run webkit --browser webkit --device phone --leave 0 --path all
run webkit30 --browser webkit --raf 30 --leave 0 --path all
run webkit30 --browser webkit --raf 30 --device phone --leave 0 --path all
run webkit30 --browser webkit --raf 30 --device phone --leave 10000
run chromium30 --device phone --raf 30 --leave 0 --path all --tv
run chromium30 --device phone --raf 30 --leave 10000 --tv
run chromium30 --raf 30 --leave 0 --path all
run chromium30 --device phone --raf 30 --leave 0 --config "$SG"
echo done >> $L/after-done.log
