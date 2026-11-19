#!/bin/sh
cd "$(dirname "$0")/../.." || exit 1
cp .shots/flights/probe-asks.spec.ts e2e/zz-probe.spec.ts
E2E_PORT=4731 npx playwright test e2e/zz-probe.spec.ts -g "room view from load" --reporter=line > .shots/flights/logs/probe-room.log 2>&1
echo "probe exit $?"
rm -f e2e/zz-probe.spec.ts
