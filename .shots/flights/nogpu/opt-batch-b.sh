#!/bin/zsh
# Option B: frame time against pixels on the software renderer. Each run leaves the TV the moment the room is ready
# (the hurried bake: about half a minute), then measures the room at rest, a level at the TV, and the flights.
# (`nogpu.mjs --quick` leaves ten seconds into a level instead, and that wait did not end in 385 s: see NOTES.md.)
cd /Users/roel/.treehouse/portfolio-roel-2d3035/1/portfolio-roel
N=.shots/flights/nogpu
run() { label=$1; shift; $N/opt-run.sh $label 330 node scripts/perf/nogpu.mjs --dist $N/dist-fixed --label $label --early-leave --moments 9999 --wait-cap 150 --out $N/raw/$label.json "$@"; echo "$label done $(date +%T)"; }
for name in "$@"; do
  case $name in
    dsf05) run opt-b-dsf05 --viewport 1440x900 --dsf 0.5 --shots $N/shots;;
    told05) run opt-b-told05 --dpr 0.5 --shots $N/shots;;
    told025) run opt-b-told025 --dpr 0.25 --shots $N/shots;;
    told035) run opt-b-told035 --dpr 0.35 --shots $N/shots;;
    720x450) run opt-b-720x450 --viewport 720x450;;
    dsf1) run opt-b-dsf1 --viewport 1440x900 --dsf 1;;
    ecores) run opt-b-ecores --ecores --dpr ${ECORES_DPR:-0.5} --shots $N/shots;;
    cuts) run opt-c-cuts --reduced-motion --pc --shots $N/shots;;
  esac
done
echo "batch done"
