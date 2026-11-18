#!/bin/sh
# Turns 3, 4 and 5 one after another, each a lock turn of its own (quiet.py run); a wait that hits the lock's bound
# (exit 3) is asked again, three times in all; a minute between turns so a waiting worker can take one.
cd "$(dirname "$0")/../.." || exit 1
L=.shots/flights/logs
turn() {
  log=$1; what=$2; script=$3
  for attempt in 1 2 3; do
    echo "### attempt $attempt $(date +%H:%M:%S)" >> $L/$log
    python3 .shots/flights/quiet.py run 15 "$what" -- sh $script >> $L/$log 2>&1
    code=$?
    [ $code -eq 3 ] || break
  done
  echo "### $log exit $code $(date +%H:%M:%S)" >> $L/$log
  sleep 65
}
rm -f $L/rest-after-turn2.log $L/final-flights-turn.log $L/final-first-turn.log
turn rest-after-turn2.log "rebuild, rest costs per view (desktop, phone, each tier and lowest), bundle report, readout shots" .shots/flights/rest-after-turn.sh
turn final-flights-turn.log "flights from a room at rest, desktop and phone, final build" .shots/flights/final-flights-turn.sh
turn final-first-turn.log "whole e2e suite, then the cold first pull-backs, final build" .shots/flights/final-first-turn.sh
