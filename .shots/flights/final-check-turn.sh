#!/bin/sh
# One lock turn: pnpm check, then e2e/flights.spec.ts six times over (its rate of failure on the development server).
cd "$(dirname "$0")/../.." || exit 1
L=.shots/flights/logs
echo "### check $(date +%H:%M:%S)"
pnpm check > $L/check-final.log 2>&1
echo "exit $? $(date +%H:%M:%S)"
echo "### flights.spec x6 $(date +%H:%M:%S)"
E2E_PORT=4731 npx playwright test e2e/flights.spec.ts --project=frames --repeat-each=6 --workers=1 --reporter=line > $L/flights-spec-x6.log 2>&1
echo "exit $? $(date +%H:%M:%S)"
echo "### generated-room and the TV test x3 $(date +%H:%M:%S)"
E2E_PORT=4731 npx playwright test e2e/generated-room.spec.ts e2e/room.spec.ts --project=chromium --repeat-each=3 --reporter=line > $L/generated-room-x3.log 2>&1
echo "exit $? $(date +%H:%M:%S)"
