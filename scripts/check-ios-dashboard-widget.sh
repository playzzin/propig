#!/usr/bin/env bash
set -euo pipefail

if [[ $# != 1 || ! -d "$1" ]]; then
  echo "Usage: $0 <simulator/App.app>" >&2
  exit 2
fi

app_id=com.propig.app
widget_id=com.propig.app.TodayWidget
group=group.com.propig.app.widgets
device=${IOS_SIMULATOR_UDID:-}
if [[ -z "$device" ]]; then
  device=$(xcrun simctl list devices available --json | python3 -c '
import json, re, sys
devices = [
    (device["state"] == "Booted", tuple(map(int, re.findall(r"\d+", runtime))), device["udid"])
    for runtime, entries in json.load(sys.stdin)["devices"].items() if ".iOS-" in runtime
    for device in entries if device["name"].startswith("iPhone")
]
if not devices:
    sys.exit("Install an iPhone simulator runtime for the selected Xcode.")
print(max(devices)[2])
')
fi

xcrun simctl bootstatus "$device" -b
xcrun simctl install "$device" "$1"
installed=$(xcrun simctl get_app_container "$device" "$app_id" app)
group_container=$(xcrun simctl get_app_container "$device" "$app_id" "$group")
[[ -d "$group_container" ]] || { echo 'The installed app has no shared App Group container.' >&2; exit 1; }

python3 - "$installed" "$widget_id" "$group" <<'PY'
import plistlib
import re
import subprocess
import sys
import tempfile
from pathlib import Path

app = Path(sys.argv[1])
widget_id, group = sys.argv[2:]

def info(bundle):
    return plistlib.loads((bundle / "Info.plist").read_bytes())

def check_simulated_group(bundle):
    executable = bundle / info(bundle)["CFBundleExecutable"]
    with tempfile.TemporaryDirectory() as temp:
        # Section offsets from otool are relative to a single Mach-O slice.
        arches = subprocess.check_output(["xcrun", "lipo", "-archs", executable], text=True).split()
        if len(arches) > 1:
            thin = Path(temp) / "executable"
            subprocess.run(["xcrun", "lipo", executable, "-thin", arches[0], "-output", thin], check=True)
            executable = thin
        loads = subprocess.check_output(["xcrun", "otool", "-l", executable], text=True)
        section = re.search(r"sectname __entitlements\s+segname __TEXT\s+addr \S+\s+size (\S+)\s+offset (\d+)", loads)
        if section is None:
            sys.exit(f"{bundle.name} has no simulator entitlement section.")
        with executable.open("rb") as binary:
            binary.seek(int(section[2]))
            entitlements = plistlib.loads(binary.read(int(section[1], 0)).rstrip(b"\0"))
        if group not in entitlements.get("com.apple.security.application-groups", []):
            sys.exit(f"{bundle.name} is missing its widget App Group.")

app_info = info(app)
extensions = [path for path in (app / "PlugIns").glob("*.appex") if info(path)["CFBundleIdentifier"] == widget_id]
if len(extensions) != 1:
    sys.exit(f"The installed app must embed one {widget_id} extension.")
widget = extensions[0]
widget_info = info(widget)
if widget_info["NSExtension"]["NSExtensionPointIdentifier"] != "com.apple.widgetkit-extension":
    sys.exit("The installed extension does not declare WidgetKit.")
if any(widget_info[key] != app_info[key] for key in ("CFBundleVersion", "CFBundleShortVersionString")):
    sys.exit("App and widget bundle versions differ.")
if not any("geuttun" in entry["CFBundleURLSchemes"] for entry in app_info.get("CFBundleURLTypes", [])):
    sys.exit("The installed app does not handle the widget URL.")
check_simulated_group(app)
check_simulated_group(widget)
print("Installed the WidgetKit extension and verified both shared-group entitlements.")
PY

xcrun simctl launch "$device" "$app_id"
if extension_data=$(xcrun simctl get_app_container "$device" "$widget_id" data 2>/dev/null) && [[ -d "$extension_data" ]]; then
  echo 'CoreSimulator resolved the installed WidgetKit extension container.'
fi
xcrun simctl terminate "$device" "$app_id"
xcrun simctl openurl "$device" 'geuttun://dashboard'
echo 'The iPhone simulator dispatched the dashboard widget URL from a cold start.'
