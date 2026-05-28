# Notification Service Extension — one-time Xcode setup

These steps add the iOS Notification Service Extension target so the
existing source files in this directory get built and shipped with the
app. After this is done once, regular `expo prebuild` runs preserve the
target — you only redo this if you `prebuild --clean` (which wipes the
`ios/` directory).

## 1. Open the workspace

```sh
open ios/Quorum.xcworkspace
```

## 2. Add a new target

1. File → New → Target
2. iOS tab → "Notification Service Extension"
3. Product Name: **QuorumNotificationService**
4. Bundle Identifier: **com.quilibrium.quorum-mobile.NotificationService**
5. Language: Swift
6. Embed in Application: Quorum
7. Click Finish, then "Activate" if Xcode prompts about the scheme.

Xcode generates a fresh `NotificationService.swift` and `Info.plist` in a
new directory. **Delete those generated files** (move to trash) and in
the project navigator drag the existing files from
`ios/QuorumNotificationService/` into the new target group:

- `NotificationService.swift`
- `Info.plist`
- `QuorumNotificationService.entitlements`

When prompted, ensure they're added to the QuorumNotificationService
target only (uncheck Quorum).

## 3. Wire the entitlements file

1. Select the QuorumNotificationService target → Signing & Capabilities.
2. Add Capability → "App Groups".
3. Add the group `group.com.quilibrium.quorum-mobile.shared`.
4. Confirm "Code Signing Entitlements" build setting points at
   `QuorumNotificationService/QuorumNotificationService.entitlements`
   (Build Settings → search "Code Signing Entitlements").

## 4. Wire the main app's App Group capability

1. Select the Quorum target → Signing & Capabilities.
2. Add Capability → "App Groups".
3. Add the same group `group.com.quilibrium.quorum-mobile.shared`.
4. Confirm "Code Signing Entitlements" still points at
   `Quorum/Quorum.entitlements` (already updated to include the group).

## 5. Build & verify

1. Build target QuorumNotificationService (⌘B with the scheme selected)
   to confirm Swift compiles.
2. Build the main Quorum target. Run on a real device — silent pushes
   and NSE invocations don't fire on the simulator.
3. Send yourself a DM. Lock screen should show the sender's display
   name in the title (instead of "New message"). For a space message,
   the title shows the space name.

## What's plumbed already

- `services/notifications/sharedKeystore.ts` writes the catalog
  (`<appGroup>/notification-catalog.json`) on every push registration
  and stays current via the `writeNotificationCatalog()` call inside
  `registerPushTokenWithQuorum`.
- `modules/quorum-crypto/ios/QuorumCryptoModule.swift` exposes
  `getAppGroupPath()` so JS can find the App Group container without
  hardcoding paths.
- Server-side push payloads include `inbox_address` (for DMs) and
  `hub_address` (for spaces) plus `_mutableContent: true` so iOS
  invokes the NSE before display.

## Failure modes

- App Group isn't enabled on either target: `getAppGroupPath()` returns
  null, no catalog gets written, the NSE falls through to "New message".
  You'll see this if step 3 or 4 was skipped.
- The catalog hasn't been written yet (first launch, before any push
  registration has run): NSE falls through. Trigger by foregrounding
  the authenticated app once.
- Push payload is over 4KB: APNs would drop it; ours are tiny so this
  shouldn't happen, but the server-side `pushPayloadSizeBudget` guard
  exists as belt-and-suspenders.
