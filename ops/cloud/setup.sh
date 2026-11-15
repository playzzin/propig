#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd -P)"
cd "$repo_root"
if [[ "$(uname -s)" != Linux ]]; then
  echo 'This installer is for the Linux cloud checkout. Preserve Windows dependencies.' >&2
  exit 1
fi
case "$repo_root" in
  /workspace/*) ;;
  *) echo 'Use a cloud checkout under /workspace; do not reinstall a Windows or WSL checkout.' >&2; exit 1 ;;
esac
case "$(stat -f -c %T "$repo_root")" in
  9p|drvfs|ntfs|ntfs3|fuseblk)
    echo 'Windows-backed filesystems are not supported by the cloud installer.' >&2
    exit 1
    ;;
esac
if (: > /dev/tcp/127.0.0.1/3002) 2>/dev/null; then
  echo 'Port 3002 is in use. Stop the task-owned development server before reinstalling dependencies.' >&2
  exit 1
fi

tools_dir="$repo_root/.codex/cloud-tools"
node_bin="$tools_dir/node22/node_modules/.bin"
mkdir -p "$tools_dir"
export npm_config_cache="$tools_dir/npm-cache"
if [[ ! -x "$node_bin/node" || ! -x "$node_bin/npm" ]] \
  || [[ "$("$node_bin/node" --version)" != v22.23.5 ]] \
  || [[ "$(PATH="$node_bin:$PATH" "$node_bin/npm" --version)" != 10.9.8 ]]; then
  npm install --prefix "$tools_dir/node22" --no-audit --no-fund --save-exact node@22.23.5 npm@10.9.8
fi
export PATH="$node_bin:$PATH"
node -e 'if (process.versions.node.split(".")[0] !== "22" || require("./functions/package.json").engines.node !== "22") throw Error("Review the project Node requirement before installing")'
npm ci --no-audit --no-fund
npm ci --prefix functions --no-audit --no-fund
printf 'Cloud dependencies ready: Node %s, npm %s\n' "$(node --version)" "$(npm --version)"
printf 'Start with: bash ops/cloud/dev.sh\n'
