#!/bin/zsh
# The last runs: the touch pad's way to the game's link, the cuts measured after a landing, the efficiency cores.
cd /Users/roel/.treehouse/portfolio-roel-2d3035/1/portfolio-roel
N=.shots/flights/nogpu
SW="--disable-gpu --enable-unsafe-swiftshader"
visit() { label=$1; shift; $N/opt-run.sh $label 240 node scripts/perf/nogpu.mjs --dist $N/dist-fixed --label $label --early-leave --moments 9999 --wait-cap 60 --out $N/raw/$label.json "$@"; echo "$label done $(date +%T)"; }
for name in "$@"; do
  case $name in
    touch) $N/opt-run.sh opt-d-reach-touch-pad 120 node scripts/perf/nogpuReach.mjs --dist $N/dist-fixed --label opt-d-reach-touch-pad --device phone --game-only --args "$SW" --shots $N/shots --out $N/raw/opt-d-reach-touch-pad.json; echo "opt-d-reach-touch-pad done $(date +%T)";;
    cuts) visit opt-c-cuts-after-landing --reduce-after-landing --pc --shots $N/shots;;
    ecores) visit opt-b-ecores --ecores --dpr 0.5 --shots $N/shots;;
  esac
done
echo "batch done"
