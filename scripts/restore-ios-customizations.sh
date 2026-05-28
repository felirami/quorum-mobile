#!/usr/bin/env bash
# Restore iOS customizations captured by snapshot-ios-customizations.sh.
# Run AFTER `expo prebuild` if it ran. Idempotent — safe to run twice.

set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SNAPSHOT="$ROOT/.ios-snapshot"

if [ ! -d "$SNAPSHOT" ]; then
    echo "No snapshot at $SNAPSHOT — nothing to restore."
    echo "Run scripts/snapshot-ios-customizations.sh before prebuild."
    exit 1
fi

# 1. NSE target source directory.
rm -rf "$ROOT/ios/QuorumNotificationService"
cp -R "$SNAPSHOT/QuorumNotificationService" "$ROOT/ios/QuorumNotificationService"
echo "Restored: ios/QuorumNotificationService/"

# 2. Main app entitlements (App Group on the Quorum target).
cp "$SNAPSHOT/Quorum.entitlements" "$ROOT/ios/Quorum/Quorum.entitlements"
echo "Restored: ios/Quorum/Quorum.entitlements"

# 3. project.pbxproj. This is the critical one — contains the NSE
#    target definition, Embed Foundation Extensions build phase, App
#    Group capability on both targets, and objectVersion = 56.
#    NOTE: if prebuild's project.pbxproj has expo-managed changes
#    (new pod refs, autolinking updates) we'd lose them by overwriting.
#    Diff first and merge manually if you suspect that.
if ! diff -q "$ROOT/ios/Quorum.xcodeproj/project.pbxproj" "$SNAPSHOT/project.pbxproj" >/dev/null 2>&1; then
    echo "WARNING: project.pbxproj differs from snapshot."
    echo "  current: $ROOT/ios/Quorum.xcodeproj/project.pbxproj"
    echo "  snapshot: $SNAPSHOT/project.pbxproj"
    echo "Review the diff and apply changes manually:"
    echo "  diff -u $SNAPSHOT/project.pbxproj $ROOT/ios/Quorum.xcodeproj/project.pbxproj | less"
    echo "Restoring the snapshot version anyway — re-apply prebuild changes by hand if needed."
fi
cp "$SNAPSHOT/project.pbxproj" "$ROOT/ios/Quorum.xcodeproj/project.pbxproj"
echo "Restored: ios/Quorum.xcodeproj/project.pbxproj"

# 4. Info.plist — likely already correct since app.json drives it, but
#    diff and warn rather than blindly overwrite (could lose new
#    expo-config-managed entries).
if ! diff -q "$ROOT/ios/Quorum/Info.plist" "$SNAPSHOT/Info.plist" >/dev/null 2>&1; then
    echo "INFO: ios/Quorum/Info.plist differs from snapshot — NOT overwriting."
    echo "Manually diff if you suspect prebuild dropped a custom key:"
    echo "  diff -u $SNAPSHOT/Info.plist $ROOT/ios/Quorum/Info.plist"
fi

echo
echo "Restore complete. Open Xcode and verify:"
echo "  - QuorumNotificationService target builds"
echo "  - Both targets show 'App Groups' capability with group.com.quilibrium.quorum-mobile.shared"
echo "  - File → Project Settings → Project Format reads 'Xcode 14.0-compatible'"
