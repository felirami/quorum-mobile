#!/usr/bin/env bash
# Snapshot iOS customizations that would be wiped by `expo prebuild --clean`.
#
# What's at risk and why prebuild can damage it:
#   - QuorumNotificationService target — added manually in Xcode, not
#     declared in app.json. project.pbxproj references would vanish on
#     a regen. The source files themselves live under
#     ios/QuorumNotificationService/ which a clean prebuild deletes.
#   - QuorumNotificationService.entitlements — App Group entitlement on
#     the NSE target. Standalone file under ios/QuorumNotificationService/.
#   - Quorum.entitlements — main app's App Group. Already encoded in
#     app.json (`expo.ios.entitlements`), so a routine prebuild restores
#     it, but a `prebuild --clean` could still drop the file briefly.
#   - project.pbxproj objectVersion = 56 — pinned to keep EAS's older
#     xcodeproj gem happy. Xcode 16 will re-stamp to 70 if it touches.
#   - Channel.xcframework — the rebuilt binary lives under
#     modules/quorum-crypto/ios/Frameworks/ (NOT ios/), so it's not
#     at risk from prebuild. Listed here for completeness.
#
# Run BEFORE any prebuild. Restore with restore-ios-customizations.sh.

set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SNAPSHOT="$ROOT/.ios-snapshot"

if [ -d "$SNAPSHOT" ]; then
    echo "Snapshot already exists at $SNAPSHOT — refusing to overwrite."
    echo "Delete it manually if you want to take a fresh snapshot."
    exit 1
fi

mkdir -p "$SNAPSHOT"

# 1. NSE target source directory (Swift, plist, entitlements).
cp -R "$ROOT/ios/QuorumNotificationService" "$SNAPSHOT/QuorumNotificationService"

# 2. Main app entitlements (app.json should restore this, but capture anyway).
cp "$ROOT/ios/Quorum/Quorum.entitlements" "$SNAPSHOT/Quorum.entitlements"

# 3. project.pbxproj — captures objectVersion pinning + NSE target +
#    Embed Foundation Extensions build phase + App Group capability
#    references on both targets.
cp "$ROOT/ios/Quorum.xcodeproj/project.pbxproj" "$SNAPSHOT/project.pbxproj"

# 4. Info.plist customizations (most are already in app.json; capture
#    actual file for diff'ing after prebuild).
cp "$ROOT/ios/Quorum/Info.plist" "$SNAPSHOT/Info.plist"

echo "Snapshot written to $SNAPSHOT"
echo "Run scripts/restore-ios-customizations.sh after prebuild to restore."
