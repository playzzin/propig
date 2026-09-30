#!/usr/bin/env bash
# Linux/WSL isolated QA dependencies only. Does not touch app node_modules or credentials.
set -euo pipefail
here="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
runtime="${PROPIG_TOOLS:-$HOME/.local/share/propig-tools}"
mkdir -p "$runtime"
cp "$here/toolchain-package.json" "$runtime/package.json"
cp "$here/toolchain-package-lock.json" "$runtime/package-lock.json"
npm ci --prefix "$runtime" --ignore-scripts
printf 'QA runtime installed: %s\n' "$runtime"
printf 'Run: LD_LIBRARY_PATH="%s/lib" node "%s/browser-check.mjs"\n' "$runtime" "$here"
printf 'Chromium and OS shared libraries are separate prerequisites. This script does not install OS packages.\n'
