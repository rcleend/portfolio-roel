#!/bin/zsh
# Options D and the rest: the flat television forced on the software-WebGL browser, what a mouse and a finger reach
# there, two more pixel counts, the long wait looked at, and the efficiency cores.
cd /Users/roel/.treehouse/portfolio-roel-2d3035/1/portfolio-roel
N=.shots/flights/nogpu
SW="--disable-gpu --enable-unsafe-swiftshader"
visit() { label=$1; shift; $N/opt-run.sh $label 330 node scripts/perf/nogpu.mjs --dist $N/dist-fixed --label $label --early-leave --moments 9999 --wait-cap 150 --out $N/raw/$label.json "$@"; echo "$label done $(date +%T)"; }
for name in "$@"; do
  case $name in
    flat) $N/opt-run.sh opt-d-flat 150 node scripts/perf/nogpuFlat.mjs --dist $N/dist-fixed --label opt-d-flat --args "$SW" --query '&host=flat' --shots $N/shots --out $N/raw/opt-d-flat.json; echo "opt-d-flat done $(date +%T)";;
    mouse) $N/opt-run.sh opt-d-reach-mouse 200 node scripts/perf/nogpuReach.mjs --dist $N/dist-fixed --label opt-d-reach-mouse --args "$SW" --shots $N/shots --out $N/raw/opt-d-reach-mouse.json; echo "opt-d-reach-mouse done $(date +%T)";;
    touch) $N/opt-run.sh opt-d-reach-touch 200 node scripts/perf/nogpuReach.mjs --dist $N/dist-fixed --label opt-d-reach-touch --device phone --args "$SW" --shots $N/shots --out $N/raw/opt-d-reach-touch.json; echo "opt-d-reach-touch done $(date +%T)";;
    told035) visit opt-b-told035 --dpr 0.35 --shots $N/shots;;
    told0625) visit opt-b-told0625 --dpr 0.625 --shots $N/shots;;
    ecores) visit opt-b-ecores --ecores --dpr ${ECORES_DPR:-0.5} --shots $N/shots;;
    cuts) visit opt-c-cuts --reduce-after-landing --pc --shots $N/shots;;
    late) $N/opt-run.sh opt-a-late-leave 330 node scripts/perf/nogpu.mjs --dist $N/dist-fixed --label opt-a-late-leave --early-leave --real-click --leave-after 10 --moments 2,60,150 --wait-cap 160 --shots $N/shots --out $N/raw/opt-a-late-leave.json; echo "opt-a-late-leave done $(date +%T)";;
  esac
done
echo "batch done"
