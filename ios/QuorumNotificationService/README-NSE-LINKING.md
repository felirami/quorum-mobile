# NSE Linking — required steps

The NSE Swift code (`HubLogClassifier.swift`, the `shouldSuppressHubLogPush`
call in `NotificationService.swift`) needs MMKV + Channel.xcframework
+ the uniffi `channel.swift` linked into the `QuorumNotificationService`
target. The Podfile and a new `QuorumChannelFFI.podspec` are already
set up — running `pod install` should wire everything in.

## Quick path (recommended)

```sh
cd ios
pod install
```

After `pod install`:

1. `Pods/QuorumChannelFFI/...` should exist.
2. The `QuorumNotificationService` target in `Pods.xcodeproj` should
   have `Pods-QuorumNotificationService.a` (or framework) linked.
3. The NSE's `baseConfigurationReference` in `Quorum.xcodeproj` should
   point at `Pods-QuorumNotificationService.debug.xcconfig` /
   `.release.xcconfig`.

Then open `Quorum.xcworkspace` in Xcode (NOT `.xcodeproj` — pods are
in the workspace) and build the `QuorumNotificationService` scheme.

## If `pod install` fails

Most common cause: CocoaPods can't find `QuorumChannelFFI` because the
sibling QuorumCrypto pod was already installed before this change.
Force a clean resolve:

```sh
cd ios
rm -rf Pods Podfile.lock
pod install
```

If that still fails, verify `modules/quorum-crypto/ios/QuorumChannelFFI.podspec`
exists and that `pod 'QuorumChannelFFI', :path => '../modules/quorum-crypto'`
appears in both the `Quorum` target and the `QuorumNotificationService`
target in `ios/Podfile`.

## What was changed (so you know what to look at)

- **NEW** `modules/quorum-crypto/ios/QuorumChannelFFI.podspec` — minimal
  pod with MMKV + Channel.xcframework + `Bindings/channel.swift`. No
  Expo dependency, safe for extension targets.
- **MODIFIED** `modules/quorum-crypto/ios/QuorumCrypto.podspec` — no
  longer vendors the framework directly; depends on `QuorumChannelFFI`
  instead. Avoids duplicate symbols when both pods are present.
- **MODIFIED** `ios/Podfile` — explicit `pod 'QuorumChannelFFI'` in
  both `Quorum` and new `QuorumNotificationService` target blocks.
- **NEW** `ios/QuorumNotificationService/HubLogClassifier.swift` — the
  classifier. Lives in the synchronized group folder so it's
  automatically a member of the NSE target.
- **MODIFIED** `ios/QuorumNotificationService/NotificationService.swift`
  — checks `shouldSuppressHubLogPush` for `hub-log` pushes carrying
  a `seq`.

## Add `QUORUM_API_URL` to the NSE's Info.plist

The classifier reads this key for the REST endpoint base URL. Open
`ios/QuorumNotificationService/Info.plist` and add a string entry
matching the same key/value used by the main app. Without it the
classifier returns nil and the notification falls through to the
catalog-rewrite path (i.e. shown as normal).

## Verifying it works

After it builds:

1. Run the main app, ensure you're a member of a space.
2. From a *different* device (or simulator), trigger an
   `update-profile` message in that space.
3. On the test device, observe whether the lock-screen notification
   appears.
4. Expected: no banner / no sound / no badge bump. The push still
   appears in Notification Center silently (iOS does not allow true
   suppression from an NSE).

## What this depends on (already merged)

- App Group MMKV mirror: the main app writes `quorum-encryption` and
  `quorum-spaces` MMKV state into the App Group container so the
  NSE can read it. See:
  - `modules/quorum-crypto/ios/QuorumCryptoModule.swift:1869`
    (`encryptionMMKVAppGroupMirror`)
  - `services/storage/mirroredMMKV.ts` (JS-side mirror helper)
- Server-side `seq` in push payload + `GET /hub/:hub_address/log`
  endpoint (in `~/src/quilibrium/quorum/quorum-api`).
- Shared classifier reference implementation in
  `services/notifications/hubLogClassifier.ts` (TS) — used by Android
  and a useful reference for any Swift-side bug-fixing.

## Known caveats / things to double-check

- `HubLogClassifier.swift` is a **draft** written without an Xcode
  build loop. Specifically scrutinize:
  - The MMKV record shape under `spaces:<spaceId>` — written by
    `services/config/spaceStorage.ts`. If the field names differ
    (`keys.hub.address` etc) the lookup will fail silently and the
    classifier returns nil.
  - The encryption state shape under `enc_state:<convId>:<inboxId>`
    — currently unwrapping a `{state, template, evals}` nested
    object when present; verify against the actual JSON the JS side
    writes.
  - The TR envelope shape passed to `tripleRatchetDecrypt`.
- iOS doesn't let an NSE truly drop a notification. We replace
  content with an empty `UNMutableNotificationContent`. The user
  won't see a banner but the push *will* appear in Notification
  Center. If that bothers users, file a radar with Apple.
- The NSE has a ~30-second execution budget. The classifier uses a
  10-second URL fetch timeout, which leaves ample margin. If the
  REST endpoint is consistently slow, drop the timeout further.
