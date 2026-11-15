#!/usr/bin/env bash
set -euo pipefail

# Use the CLI belonging to the locked playwright-core package. `npx playwright`
# can download a different version and install an incompatible Chromium build.
node node_modules/playwright-core/cli.js install --with-deps chromium
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH="$(node -e "process.stdout.write(require('playwright-core').chromium.executablePath())")"
export PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
export CHROME_PATH="$PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH"
test -x "$CHROME_PATH"

log_file="${RUNNER_TEMP:-/tmp}/propig-browser.log"
node scripts/serve-static-export.mjs > "$log_file" 2>&1 &
server_pid=$!
trap 'kill "$server_pid" 2>/dev/null || true' EXIT
for attempt in $(seq 1 90); do
  if ! kill -0 "$server_pid" 2>/dev/null; then cat "$log_file"; exit 1; fi
  if curl --fail --silent --max-time 5 http://127.0.0.1:3002/__propig_static_health >/dev/null; then break; fi
  if [ "$attempt" -eq 90 ]; then cat "$log_file"; exit 1; fi
  sleep 2
done
node -e "fetch('http://127.0.0.1:3002/__propig_static_health').then(r=>r.json()).then(v=>{if(v.kind!=='propig-static-export'||v.apiProxy!==false)throw Error('Wrong QA server')}).catch(e=>{console.error(e);process.exitCode=1})"
BASE_URL=http://127.0.0.1:3002 npm run verify:release-browser
