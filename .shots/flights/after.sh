#!/bin/sh
# The after-matrix: every run on the fixed build (dist), one at a time. Logs under .shots/flights/logs/after-*.log
cd "$(dirname "$0")/../.." || exit 1
L=.shots/flights/logs
SG='{"slowGpu":48,"slowBake":48}'
# Nothing else measuring: wait (up to ten minutes) while another checkout's browsers or tests run, and say what the machine's load was.
quiet() { n=0; while pgrep -f 'ms-playwright|playwright/lib|vitest' >/dev/null 2>&1 && [ $n -lt 120 ]; do sleep 5; n=$((n+1)); done; [ $n -ge 120 ] && echo "NOISY: others still running after ten minutes"; echo "load $(sysctl -n vm.loadavg) $(pmset -g batt | head -1)"; }
run() { name=$1; shift; echo "### $name: $*" >> "$L/after-$name.log"; quiet >> "$L/after-$name.log"; node scripts/perf/flights.mjs "$@" >> "$L/after-$name.log" 2>&1; }
rm -f $L/after-*.log
for leave in 0 1000 10000; do
  path=first; [ "$leave" = 0 ] && path=all
  run desktop --leave $leave --path $path --tv
  run desktop-low --leave $leave --path $path --query '&quality=low'
  run phone --device phone --leave $leave --path $path --tv
  run phone-low --device phone --leave $leave --path $path --query '&quality=low'
  run slow-desktop --leave $leave --path $path --config "$SG" --tv
  run slow-phone --device phone --leave $leave --path $path --config "$SG" --tv
done
run desktop --level 6000 --tv
run phone --device phone --level 6000 --tv
run slow-phone --device phone --level 6000 --config "$SG" --tv
# WebKit (Playwright's, 60 Hz) and a display that hands out thirty frames a second
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
