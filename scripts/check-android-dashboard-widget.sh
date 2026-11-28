#!/usr/bin/env bash
set -euo pipefail

if [[ $# != 2 || ! -f "$1" || ! -f "$2" ]]; then
  echo "Usage: $0 <app-debug.apk> <app-debug-androidTest.apk>" >&2
  exit 2
fi

device=(adb -e)
if [[ -n "${ANDROID_SERIAL:-}" ]]; then device=(adb -s "$ANDROID_SERIAL"); fi
if [[ "$("${device[@]}" shell getprop ro.kernel.qemu | tr -d '\r')" != 1 &&
      "$("${device[@]}" shell getprop ro.boot.qemu | tr -d '\r')" != 1 ]]; then
  echo 'A booted Android emulator is required for the widget host test.' >&2
  exit 1
fi

package=com.propig.app
"${device[@]}" install -r -t "$1"
"${device[@]}" install -r -t "$2"
"${device[@]}" shell am start -W -n "$package/.MainActivity"

# The test uses a real AppWidgetHost in the instrumented app on a disposable emulator.
user_id=$("${device[@]}" shell am get-current-user | tr -d '\r')
"${device[@]}" shell appwidget grantbind --package "$package" --user "$user_id"
trap '"${device[@]}" shell appwidget revokebind --package "$package" --user "$user_id"' EXIT
result=$("${device[@]}" shell am instrument -w \
  -e class "$package.DashboardWidgetHostTest" \
  "$package.test/androidx.test.runner.AndroidJUnitRunner" | tr -d '\r')
echo "$result"
# am instrument can return zero even when the test failed or never ran.
grep -Fxq 'OK (1 test)' <<< "$result"
