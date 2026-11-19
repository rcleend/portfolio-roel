#!/bin/zsh
# opt-run.sh <label> <seconds> <command…>: waits until no other checkout measures (twice at most), runs the command
# with a time limit while watching for other measurements, and leaves everything in raw/<label>.log.
cd /Users/roel/.treehouse/portfolio-roel-2d3035/1/portfolio-roel
N=.shots/flights/nogpu
label=$1; cap=$2; shift 2
{
  w=$(python3 .shots/flights/foreign.py wait); echo "$w"
  case "$w" in NOISY*) w=$(python3 .shots/flights/foreign.py wait); echo "again: $w";; esac
  echo "start $(date +%T) load $(sysctl -n vm.loadavg)"
  perl -e 'alarm shift; exec @ARGV' $cap "$@" &
  pid=$!
  python3 .shots/flights/foreign.py watch $pid > $N/raw/$label.foreign 2>&1 &
  wait $pid; echo "exit $?"
  wait
  cat $N/raw/$label.foreign; rm -f $N/raw/$label.foreign
  echo "end $(date +%T) load $(sysctl -n vm.loadavg)"
} > $N/raw/$label.log 2>&1
