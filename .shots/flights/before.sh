#!/bin/sh
# The same on the build before the fixes (.shots/flights/dist-base), for what the first pass did not cover:
# WebKit and a 30-a-second display. Logs under .shots/flights/logs/before-*.log
cd "$(dirname "$0")/../.." || exit 1
L=.shots/flights/logs
D=.shots/flights/dist-base
SG='{"slowGpu":48,"slowBake":48}'
# Nothing else measuring: wait (up to ten minutes) while another checkout's browsers or tests run, and say what the machine's load was.
quiet() { n=0; while pgrep -f 'ms-playwright|playwright/lib|vitest' >/dev/null 2>&1 && [ $n -lt 120 ]; do sleep 5; n=$((n+1)); done; [ $n -ge 120 ] && echo "NOISY: others still running after ten minutes"; echo "load $(sysctl -n vm.loadavg) $(pmset -g batt | head -1)"; }
run() { name=$1; shift; echo "### $name: $*" >> "$L/before-$name.log"; quiet >> "$L/before-$name.log"; node scripts/perf/flights.mjs --dist $D "$@" >> "$L/before-$name.log" 2>&1; }
rm -f $L/before-*.log
run desktop --leave 0 --path all --tv
run desktop --leave 1000 --tv
run desktop --leave 10000 --tv
run desktop --level 6000 --tv
run phone --device phone --leave 0 --path all --tv
run phone --device phone --level 6000 --tv
run slow-phone --device phone --leave 0 --path all --config "$SG" --tv
run slow-phone --device phone --level 6000 --config "$SG" --tv
run webkit --browser webkit --leave 0 --path all
run webkit --browser webkit --device phone --leave 0 --path all
run webkit30 --browser webkit --raf 30 --leave 0 --path all
run webkit30 --browser webkit --raf 30 --device phone --leave 0 --path all
run webkit30 --browser webkit --raf 30 --device phone --leave 10000
run chromium30 --device phone --raf 30 --leave 0 --path all --tv
run chromium30 --device phone --raf 30 --leave 10000 --tv
run chromium30 --raf 30 --leave 0 --path all
run chromium30 --device phone --raf 30 --leave 0 --config "$SG"
# A minute and more at the TV on a 30-a-second display: what the governor does.
run chromium30-long --device phone --raf 30 --leave 135000
echo done >> $L/before-done.log
