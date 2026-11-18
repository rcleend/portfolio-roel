#!/bin/sh
# Rows of the after-matrix another checkout's measurement ran through, made again: appended to after-*.log as
# "(re-run)". Each waits for a quiet machine and says whether it had it to itself.
cd "$(dirname "$0")/../.." || exit 1
L=.shots/flights/logs
SG='{"slowGpu":48,"slowBake":48}'
run() {
  name=$1; shift
  log="$L/after-$name.log"
  echo "### $name (re-run): $*" >> "$log"
  python3 .shots/flights/foreign.py wait >> "$log"
  echo "load $(sysctl -n vm.loadavg) $(date +%H:%M:%S) $(pmset -g batt | head -1)" >> "$log"
  node scripts/perf/flights.mjs "$@" >> "$log" 2>&1 &
  pid=$!
  case "$*" in *webkit*) kind=webkit;; *) kind=;; esac
  python3 .shots/flights/foreign.py watch $pid $kind >> "$log"
  wait $pid
}
run desktop --leave 1000 --path first --tv
run desktop-low --leave 1000 --path first --query '&quality=low'
run phone --device phone --leave 1000 --path first --tv
run phone-low --device phone --leave 1000 --path first --query '&quality=low'
run slow-desktop --leave 1000 --path first --config "$SG" --tv
run desktop-low --leave 10000 --path first --query '&quality=low'
run phone --device phone --leave 10000 --path first --tv
run phone-low --device phone --leave 10000 --path first --query '&quality=low'
run slow-desktop --leave 10000 --path first --config "$SG" --tv
run slow-phone --device phone --leave 10000 --path first --config "$SG" --tv
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
run chromium30 --raf 30 --leave 0 --path all
echo done > $L/after-rerun-done.log
