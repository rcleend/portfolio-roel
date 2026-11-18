#!/bin/sh
# The room chunk's bytes with and without the second stage: a4dceac (first stage + the PR as then), 93e3446 (the same
# plus the second stage, before the PR's later commits), and HEAD. Each tree unpacked, built with the manifest, reported.
cd "$(dirname "$0")/../.." || exit 1
root=$(pwd)
for rev in a4dceac 93e3446; do
  d=.shots/flights/tree-$rev
  rm -rf $d && mkdir -p $d && git archive $rev | tar -x -C $d && ln -s "$root/node_modules" $d/node_modules
  (cd $d && npx vite build --manifest > build.log 2>&1 && node scripts/bundle-report.mjs > report.log 2>&1; echo "$rev: exit $?")
  grep -E "│ (room|index|entryJs|posterWall) " $d/report.log | head -4
done
