#!/bin/sh
# One lock turn: every flight from a room nine seconds at rest, desktop then phone, on the final build.
cd "$(dirname "$0")/../.." || exit 1
L=.shots/flights/logs
for device in desktop phone; do
  echo "### final $device from rest, $(date +%H:%M:%S), $(pmset -g batt | head -1)"
  node scripts/perf/flights.mjs --dist .shots/flights/dist-final --device $device --leave 10000 --rest 9000 --path all > "$L/final-rest-flights-$device.log" 2>&1
  echo "exit $? $(date +%H:%M:%S)"
done
