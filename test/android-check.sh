#!/usr/bin/env bash
# Installs the release APK on the emulator, opens it and checks that the ABS
# admin desk shows, then uninstalls it. Leaves a screenshot and the screen's
# text for the build record.
set -u
APK="${1:?apk path}"
PKG="uk.co.absmotsauto.admin"
fail() { echo "FAIL: $*"; adb logcat -d -t 200 > logcat.txt 2>/dev/null; exit 1; }

adb wait-for-device
until [ "$(adb shell getprop sys.boot_completed | tr -d '\r')" = "1" ]; do sleep 2; done
adb shell input keyevent 82 >/dev/null 2>&1 || true
# A slow CI emulator's own launcher can stall and pop an "isn't responding"
# box over everything; hide system error boxes so the app's screen is read.
adb shell settings put global hide_error_dialogs 1 >/dev/null 2>&1 || true
dismiss_system_boxes() {
  if [ -f ui.xml ] && grep -q "isn't responding" ui.xml; then
    adb shell am broadcast -a android.intent.action.CLOSE_SYSTEM_DIALOGS >/dev/null 2>&1 || true
    bounds=$(grep -o 'text="Wait"[^>]*bounds="[^"]*"' ui.xml | grep -o 'bounds="[^"]*"' | head -1)
    if [ -n "$bounds" ]; then
      set -- $(echo "$bounds" | tr -c '0-9' ' ')
      adb shell input tap $(( ($1 + $3) / 2 )) $(( ($2 + $4) / 2 )) >/dev/null 2>&1 || true
    fi
  fi
}

echo "Installing $(du -h "$APK" | cut -f1) APK"
adb install -r "$APK" || fail "the APK would not install"
adb shell pm list packages | grep -q "$PKG" || fail "the app is not listed after install"
echo "Installed: $(adb shell dumpsys package $PKG | grep -m1 versionName | tr -d ' \r')"
adb shell pm grant "$PKG" android.permission.POST_NOTIFICATIONS >/dev/null 2>&1 || true

adb logcat -c
adb shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1 || fail "the app would not open"

found=""
for i in $(seq 1 45); do
  sleep 3
  adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1 && adb pull /sdcard/ui.xml ui.xml >/dev/null 2>&1
  if [ -f ui.xml ] && grep -qi "sign in" ui.xml && grep -qi "workshop" ui.xml; then found=1; break; fi
  dismiss_system_boxes
done
adb exec-out screencap -p > android-screen.png
[ -n "$found" ] || fail "the ABS sign-in did not appear within about 2 minutes"
echo "Screen shows: $(grep -o 'text="[^"]*"' ui.xml | sed 's/text="//;s/"$//' | grep -v '^$' | head -12 | tr '\n' '|')"

adb logcat -d > logcat.txt
if grep -q "FATAL EXCEPTION" logcat.txt; then fail "the app crashed"; fi
adb shell dumpsys activity activities | grep -q "$PKG/.MainActivity" || fail "the app is not in front"
echo "Running in front, no crash"

adb uninstall "$PKG" | grep -q Success || fail "the app did not uninstall"
echo "Uninstalled cleanly"
echo "PASS: the Android app opens the ABS admin desk"
