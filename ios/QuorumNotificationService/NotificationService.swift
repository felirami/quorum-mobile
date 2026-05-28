//
//  NotificationService.swift
//  QuorumNotificationService
//
//  Reads a catalog the main app maintains in our shared App Group
//  container and rewrites incoming push titles before the lock screen
//  displays them — so the user sees "Alice" or "#general" instead of
//  the generic "New message" the server has to send.
//
//  Iteration 1 scope: title rewrite only, no body decryption. Body
//  decryption would require coordinating Triple/Double Ratchet state
//  with the main app — see push design notes. The push payload from
//  the server includes only identifiers (inbox_address / hub_address),
//  no ciphertext, no sender identity, no metadata leak beyond what
//  Apple already sees.
//
//  Failure mode: if the App Group can't be read, the catalog is
//  missing, or a lookup misses, we deliver whatever the server sent
//  (typically "New message"). Never crashes — the contentHandler is
//  always called.

import UserNotifications

private struct CatalogDM: Decodable {
    let display_name: String
}

private struct CatalogSpace: Decodable {
    let name: String
}

private struct Catalog: Decodable {
    let version: Int
    let dms: [String: CatalogDM]?
    let spaces: [String: CatalogSpace]?
    /// Mirrors getApiConfig().baseUrl from the JS side. Used by the
    /// hub-log suppression classifier so it talks to the same API
    /// endpoint the main app does (auto-syncs with the dev/prod toggle).
    let api_base_url: String?
}

class NotificationService: UNNotificationServiceExtension {

    // App Group identifier — must match the entitlement on both this
    // extension target and the main Quorum target, AND the constant in
    // modules/quorum-crypto/ios/QuorumCryptoModule.swift's
    // getAppGroupPath. Update all three if it ever changes.
    private static let appGroupId = "group.com.quilibrium.quorum-mobile.shared"
    private static let catalogFilename = "notification-catalog.json"

    var contentHandler: ((UNNotificationContent) -> Void)?
    var bestAttemptContent: UNMutableNotificationContent?

    override func didReceive(
        _ request: UNNotificationRequest,
        withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void
    ) {
        self.contentHandler = contentHandler
        self.bestAttemptContent = (request.content.mutableCopy() as? UNMutableNotificationContent)

        guard let bestAttemptContent = bestAttemptContent else {
            contentHandler(request.content)
            return
        }

        let userInfo = request.content.userInfo
        guard let payload = extractDataPayload(userInfo),
              let type = payload["type"] as? String else {
            contentHandler(bestAttemptContent)
            return
        }

        // Global mute. Persisted in MMKV (mirrored into App Group) by
        // notificationPrefs.ts. When off, suppress ALL push types
        // regardless of routing — the user opted out of every
        // notification this app would produce. Replace with empty
        // content so iOS shows nothing.
        if isGloballyMuted() {
            contentHandler(UNMutableNotificationContent())
            return
        }

        // Load the catalog once — it carries both the title-rewrite
        // entries and the api_base_url the suppression classifier
        // needs to talk to the server.
        let catalog = loadCatalog()

        // Hub-log control-message suppression: decrypt the entry
        // locally (via the App Group MMKV mirror the main app
        // maintains) and, if it's an update-profile / edit-message /
        // remove-message, suppress the visible notification. iOS
        // doesn't let an NSE truly *drop* a notification — the best
        // we can do is replace the content with empty fields and no
        // sound, which leaves no banner / sound / badge change.
        // Falls back to the catalog-rewrite path on any failure.
        if type == "hub-log",
           let hubAddr = payload["hub_address"] as? String,
           let seqVal = payload["seq"],
           let apiBaseStr = catalog?.api_base_url,
           let apiBaseURL = URL(string: apiBaseStr) {
            let seq: UInt64
            if let n = seqVal as? UInt64 {
                seq = n
            } else if let n = seqVal as? NSNumber {
                seq = n.uint64Value
            } else if let s = seqVal as? String, let n = UInt64(s) {
                seq = n
            } else {
                seq = 0
            }
            if seq > 0 && shouldSuppressHubLogPush(apiBase: apiBaseURL, hubAddress: hubAddr, seq: seq) {
                let silent = UNMutableNotificationContent()
                // Empty content — no banner, no sound, no badge increment.
                // The push will still appear in Notification Center but
                // won't surface to the user as an active interruption.
                contentHandler(silent)
                return
            }
        }

        if let catalog = catalog {
            switch type {
            case "inbox":
                if let inboxAddr = payload["inbox_address"] as? String,
                   let entry = catalog.dms?[inboxAddr] {
                    bestAttemptContent.title = entry.display_name
                    if bestAttemptContent.body.isEmpty {
                        bestAttemptContent.body = "New message"
                    }
                }
            case "hub-log":
                if let hubAddr = payload["hub_address"] as? String,
                   let entry = catalog.spaces?[hubAddr] {
                    bestAttemptContent.title = entry.name
                    if bestAttemptContent.body.isEmpty {
                        bestAttemptContent.body = "New message"
                    }
                }
            case "farcaster":
                // Farcaster poller server-side already writes a
                // friendly title/body. Leave untouched.
                break
            default:
                break
            }
        }

        contentHandler(bestAttemptContent)
    }

    override func serviceExtensionTimeWillExpire() {
        if let contentHandler = contentHandler, let bestAttemptContent = bestAttemptContent {
            contentHandler(bestAttemptContent)
        }
    }

    // MARK: - Catalog loading

    private func loadCatalog() -> Catalog? {
        guard let containerURL = FileManager.default
                .containerURL(forSecurityApplicationGroupIdentifier: Self.appGroupId)
        else { return nil }
        let fileURL = containerURL.appendingPathComponent(Self.catalogFilename)
        guard let data = try? Data(contentsOf: fileURL) else { return nil }
        return try? JSONDecoder().decode(Catalog.self, from: data)
    }

    /// Expo nests our `data` payload under `body` inside `aps`; raw
    /// APNs pushes put it at the userInfo root. Try both shapes.
    private func extractDataPayload(_ userInfo: [AnyHashable: Any]) -> [String: Any]? {
        if let body = userInfo["body"] as? [String: Any] {
            return body
        }
        if let data = userInfo["data"] as? [String: Any] {
            return data
        }
        var direct: [String: Any] = [:]
        for (k, v) in userInfo {
            if let key = k as? String, key != "aps" {
                direct[key] = v
            }
        }
        return direct.isEmpty ? nil : direct
    }
}
