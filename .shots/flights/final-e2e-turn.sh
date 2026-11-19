#!/bin/sh
cd "$(dirname "$0")/../.." || exit 1
echo "### e2e $(date +%H:%M:%S) $(git rev-parse --short HEAD)"
E2E_PORT=4731 pnpm e2e --reporter=line > .shots/flights/logs/e2e-final2.log 2>&1
echo "exit $? $(date +%H:%M:%S)"
