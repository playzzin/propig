#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"
node_bin="$repo_root/.codex/cloud-tools/node22/node_modules/.bin"
if [[ -x "$node_bin/node" ]]; then
  export PATH="$node_bin:$PATH"
fi
if [[ "$(node -p 'process.versions.node.split(".")[0]')" != 22 ]] || [[ ! -d node_modules/next ]]; then
  echo 'Run bash ops/cloud/setup.sh before starting this cloud checkout.' >&2
  exit 1
fi
exec node ops/cloud/start-dev.mjs
