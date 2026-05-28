# Do not run `expo prebuild` on this project

This repository commits `ios/` and `android/` directories as the source
of truth for the native projects. EAS reads them directly. There is
**no routine need to run `npx expo prebuild`**, and doing so risks
deleting manual customizations that aren't declared in `app.json`.

## What `prebuild` would damage

These items live only in the committed `ios/` directory and are NOT
expressible via `app.json` or any Expo config plugin we currently use.
A `prebuild --clean` deletes them. A plain `prebuild` may corrupt them
during its (unreliable) merge.

| Item | Location | Notes |
|---|---|---|
| Notification Service Extension target | `ios/QuorumNotificationService/`, `Quorum.xcodeproj/project.pbxproj` references | Added manually in Xcode. Lock-screen DM sender / space-name rewriting depends on this. |
| NSE entitlements | `ios/QuorumNotificationService/QuorumNotificationService.entitlements` | App Group `group.com.quilibrium.quorum-mobile.shared`. |
| Embed Foundation Extensions build phase | `Quorum.xcodeproj/project.pbxproj` | The phase that copies the NSE `.appex` into the app bundle. |
| `objectVersion = 56` | `Quorum.xcodeproj/project.pbxproj` line 6 | Pinned so EAS's older `xcodeproj` gem can parse the project. Xcode 16 will re-stamp to 70 if saved. Use File → Project Settings → Project Format = "Xcode 14.0-compatible" to keep Xcode honest. |

These are encoded in `app.json` and *would* be restored by prebuild,
but listed for completeness:

| Item | `app.json` path |
|---|---|
| Main app App Group entitlement | `expo.ios.entitlements["com.apple.security.application-groups"]` |
| `UIBackgroundModes`, BG-task identifiers, usage strings | `expo.ios.infoPlist.*` |
| Android `POST_NOTIFICATIONS` permission | `expo.android.permissions` |

The rebuilt `Channel.xcframework` and Android `jniLibs/` live under
`modules/quorum-crypto/` (not `ios/`) so they are not affected by
prebuild.

## If you absolutely must prebuild

1. Snapshot first:
   ```sh
   npm run prebuild:snapshot
   ```
   Writes a copy of the at-risk files to `.ios-snapshot/`.

2. Run prebuild without `--clean` whenever possible:
   ```sh
   npx expo prebuild --no-install
   ```

3. Restore:
   ```sh
   npm run prebuild:restore
   ```
   The restore script overwrites `project.pbxproj` with the snapshot
   version but **warns** if there are differences — Expo's prebuild may
   have added new Pod references or autolinking entries that you'd lose
   by overwriting. Diff manually if so:
   ```sh
   diff -u .ios-snapshot/project.pbxproj ios/Quorum.xcodeproj/project.pbxproj
   ```

4. Open Xcode and verify:
   - `QuorumNotificationService` target builds.
   - Both targets show **App Groups** capability with
     `group.com.quilibrium.quorum-mobile.shared` checked.
   - **File → Project Settings → Project Format** reads
     "Xcode 14.0-compatible".

## Why not a config plugin?

A custom config plugin that programmatically adds the NSE target on
every prebuild would be the proper durable answer. Writing one
correctly (mutating `project.pbxproj` via `@expo/config-plugins`'
`IOSConfig.Xcodeproj` helpers, plus entitlement injection, plus
Embed-Extensions build-phase wiring) is on the order of a day of
focused work that hasn't been done. The community plugin
`@bacons/apple-targets` does this generically and is a reasonable
adoption path if prebuild becomes a real workflow.

For now, the cheaper and more reliable answer is to treat the
committed `ios/` as canonical and **not run prebuild**.

## Guard

The `prebuild` npm script in `package.json` is intentionally aliased to
print the warning above and exit 1. `npm run prebuild` therefore fails
loudly. Note that `npx expo prebuild` invoked directly bypasses npm
and the guard — there's no clean way to intercept it short of a Git
pre-commit hook on `project.pbxproj`. Discipline matters.
