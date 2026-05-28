import ExpoModulesCore
import CommonCrypto
import MMKV
import AVFoundation
import CallKit
// The uniffi-generated channel.swift bindings (decryptInboxMessage,
// tripleRatchetDecrypt, TripleRatchetStateAndMetadata, CryptoError,
// etc.) used to live in this same pod's source_files. They're now
// in QuorumChannelFFI so the NSE can link them without ExpoModulesCore.
import QuorumChannelFFI

// MARK: - CallKit Provider Delegate

/// Handles CXProvider delegate callbacks and bridges them back to the Expo
/// module via a closure so the module can emit JS events.
class QuorumCallKitDelegate: NSObject, CXProviderDelegate {
    var onCallAction: (([String: Any]) -> Void)?
    /// Reverse mapping from CallKit UUID → original JS callId string
    var uuidToCallId: [UUID: String] = [:]

    private func jsCallId(for uuid: UUID) -> String {
        return uuidToCallId[uuid] ?? uuid.uuidString
    }

    func providerDidReset(_ provider: CXProvider) {
        // Provider was reset — no active calls remain
        uuidToCallId.removeAll()
    }

    func provider(_ provider: CXProvider, perform action: CXAnswerCallAction) {
        // User tapped "Accept" on the native call UI
        onCallAction?([
            "action": "answer",
            "callId": jsCallId(for: action.callUUID)
        ])
        action.fulfill()
    }

    func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
        // User tapped "Decline" or ended via native UI
        let callId = jsCallId(for: action.callUUID)
        onCallAction?([
            "action": "end",
            "callId": callId
        ])
        uuidToCallId.removeValue(forKey: action.callUUID)
        action.fulfill()
    }

    func provider(_ provider: CXProvider, perform action: CXSetMutedCallAction) {
        onCallAction?([
            "action": "setMuted",
            "callId": jsCallId(for: action.callUUID),
            "muted": action.isMuted
        ])
        action.fulfill()
    }

    func provider(_ provider: CXProvider, perform action: CXSetHeldCallAction) {
        onCallAction?([
            "action": "setHeld",
            "callId": jsCallId(for: action.callUUID),
            "held": action.isOnHold
        ])
        action.fulfill()
    }

    func provider(_ provider: CXProvider, didActivate audioSession: AVAudioSession) {
        // CallKit activated the audio session — WebRTC should start using it
        print("[CallKit] audio session activated")
    }

    func provider(_ provider: CXProvider, didDeactivate audioSession: AVAudioSession) {
        print("[CallKit] audio session deactivated")
    }
}

public class QuorumCryptoModule: Module {
    // Background queue for crypto operations to avoid blocking UI thread
    private let cryptoQueue = DispatchQueue(label: "com.quorum.crypto", qos: .userInitiated)

    // MARK: - CallKit

    /// Singleton CXProvider shared across all call operations
    private lazy var callKitProvider: CXProvider = {
        let config = CXProviderConfiguration()
        config.supportsVideo = true
        config.maximumCallGroups = 1
        config.supportedHandleTypes = [.generic]
        config.iconTemplateImageData = nil // TODO: set app icon if desired
        let provider = CXProvider(configuration: config)
        provider.setDelegate(callKitDelegate, queue: DispatchQueue.main)
        return provider
    }()

    private let callKitDelegate = QuorumCallKitDelegate()
    private let callController = CXCallController()

    /// Maps string callIds from JS to UUIDs used by CallKit
    private var callIdToUUID: [String: UUID] = [:]

    private func uuidForCallId(_ callId: String) -> UUID {
        if let existing = callIdToUUID[callId] {
            return existing
        }
        let uuid = UUID()
        callIdToUUID[callId] = uuid
        // Also populate the reverse mapping on the delegate
        callKitDelegate.uuidToCallId[uuid] = callId
        return uuid
    }

    private func removeCallId(_ callId: String) {
        if let uuid = callIdToUUID[callId] {
            callKitDelegate.uuidToCallId.removeValue(forKey: uuid)
        }
        callIdToUUID.removeValue(forKey: callId)
    }

    // MMKV initialization. On iOS the SDK requires `+[MMKV initializeMMKV:]`
    // to be called before any MMKV instance is created. `react-native-mmkv`
    // does this when its first JS MMKV is instantiated, but this native
    // module can be invoked (e.g. by processing an incoming message)
    // BEFORE any JS MMKV exists — which crashes with
    // "MMKV not initialized properly". Initialize ourselves, idempotently.
    private static let mmkvInitLock = NSLock()
    private static var mmkvInitialized = false
    private static func ensureMMKVInitialized() {
        mmkvInitLock.lock()
        defer { mmkvInitLock.unlock() }
        if mmkvInitialized { return }
        // Match react-native-mmkv's default root directory
        // (<Library>/mmkv) so we share the same storage location.
        let paths = NSSearchPathForDirectoriesInDomains(.libraryDirectory, .userDomainMask, true)
        let libraryPath = paths.first ?? NSTemporaryDirectory()
        let mmkvPath = (libraryPath as NSString).appendingPathComponent("mmkv")
        MMKV.initialize(rootDir: mmkvPath)
        mmkvInitialized = true
    }

    public func definition() -> ModuleDefinition {
        Name("QuorumCrypto")

        // Declare events that can be sent from native to JS
        Events("onCallAction")

        // MARK: - App Group container path
        //
        // Returns the absolute path to our shared App Group container.
        // The Notification Service Extension lives in a separate process
        // sandbox and can't read the app's normal Documents directory;
        // the App Group container is the only filesystem location both
        // sides can touch. JS uses this path to write a keys.json
        // snapshot that the NSE reads on push receipt to decrypt
        // envelopes locally.
        //
        // Returns nil if the App Group entitlement isn't configured
        // (e.g. on a debug build before prebuild has been re-run with
        // the config plugin) so JS can fall back gracefully.
        Function("getAppGroupPath") { () -> String? in
            let groupId = "group.com.quilibrium.quorum-mobile.shared"
            return FileManager.default
                .containerURL(forSecurityApplicationGroupIdentifier: groupId)?
                .path
        }

        // MARK: - CallKit Integration (iOS only)
        //
        // These functions allow JS to report calls to CallKit so the
        // native iOS call UI is displayed (lock screen, Do Not Disturb
        // integration, audio route management).

        AsyncFunction("reportIncomingCall") { (callId: String, callerName: String, hasVideo: Bool, promise: Promise) in
            // Wire up the delegate to emit events back to JS
            self.callKitDelegate.onCallAction = { [weak self] body in
                self?.sendEvent("onCallAction", body)
            }

            let uuid = self.uuidForCallId(callId)
            let update = CXCallUpdate()
            update.remoteHandle = CXHandle(type: .generic, value: callId)
            update.localizedCallerName = callerName
            update.hasVideo = hasVideo
            update.supportsGrouping = false
            update.supportsUngrouping = false
            update.supportsHolding = false
            update.supportsDTMF = false

            self.callKitProvider.reportNewIncomingCall(with: uuid, update: update) { error in
                if let error = error {
                    print("[CallKit] reportNewIncomingCall error: \(error)")
                    self.removeCallId(callId)
                    promise.reject("CALLKIT_ERROR", error.localizedDescription)
                } else {
                    print("[CallKit] incoming call reported: \(callId)")
                    promise.resolve(true)
                }
            }
        }

        AsyncFunction("reportOutgoingCall") { (callId: String, calleeName: String, hasVideo: Bool, promise: Promise) in
            self.callKitDelegate.onCallAction = { [weak self] body in
                self?.sendEvent("onCallAction", body)
            }

            let uuid = self.uuidForCallId(callId)
            let handle = CXHandle(type: .generic, value: callId)
            let startAction = CXStartCallAction(call: uuid, handle: handle)
            startAction.isVideo = hasVideo
            startAction.contactIdentifier = calleeName

            let transaction = CXTransaction(action: startAction)
            self.callController.request(transaction) { error in
                if let error = error {
                    print("[CallKit] reportOutgoingCall error: \(error)")
                    self.removeCallId(callId)
                    promise.reject("CALLKIT_ERROR", error.localizedDescription)
                } else {
                    // Tell the provider the call is connecting
                    self.callKitProvider.reportOutgoingCall(with: uuid, startedConnectingAt: Date())
                    print("[CallKit] outgoing call reported: \(callId)")
                    promise.resolve(true)
                }
            }
        }

        AsyncFunction("reportOutgoingCallConnected") { (callId: String, promise: Promise) in
            guard let uuid = self.callIdToUUID[callId] else {
                promise.resolve(false)
                return
            }
            self.callKitProvider.reportOutgoingCall(with: uuid, connectedAt: Date())
            print("[CallKit] outgoing call connected: \(callId)")
            promise.resolve(true)
        }

        AsyncFunction("reportCallConnected") { (callId: String, promise: Promise) in
            guard let uuid = self.callIdToUUID[callId] else {
                promise.resolve(false)
                return
            }
            // For incoming calls that are now connected, we just update
            // the call with connectedAt. For outgoing calls this is a
            // duplicate but harmless.
            self.callKitProvider.reportOutgoingCall(with: uuid, connectedAt: Date())
            print("[CallKit] call connected: \(callId)")
            promise.resolve(true)
        }

        AsyncFunction("reportCallEnded") { (callId: String, promise: Promise) in
            guard let uuid = self.callIdToUUID[callId] else {
                promise.resolve(false)
                return
            }
            // Use CXEndCallAction via the call controller so CallKit
            // properly transitions the call to ended state.
            let endAction = CXEndCallAction(call: uuid)
            let transaction = CXTransaction(action: endAction)
            self.callController.request(transaction) { error in
                if let error = error {
                    print("[CallKit] reportCallEnded transaction error: \(error)")
                    // Fallback: report directly to provider
                    self.callKitProvider.reportCall(with: uuid, endedAt: Date(), reason: .remoteEnded)
                }
                self.removeCallId(callId)
                promise.resolve(true)
            }
        }

        // Audio session pre-warmup for WebRTC calls.
        // Configures AVAudioSession for PlayAndRecord with VoiceChat mode
        // BEFORE WebRTC's internal VoiceProcessingIO tries to initialize.
        // Without this, VoiceProcessingIO's RPC to mediaserverd can timeout
        // and abort() the process on iOS simulator.
        AsyncFunction("prepareAudioSession") { (promise: Promise) in
            DispatchQueue.main.async {
                let session = AVAudioSession.sharedInstance()
                do {
                    try session.setCategory(
                        .playAndRecord,
                        mode: .voiceChat,
                        options: [.defaultToSpeaker, .allowBluetooth]
                    )
                    try session.setActive(true)
                    promise.resolve(true)
                } catch {
                    print("[Audio] prepareAudioSession error: \(error)")
                    promise.resolve(false)
                }
            }
        }

        // Pair to prepareAudioSession — called from SpaceCallContext.cleanup
        // so post-call notifications/media don't stay locked into the call's
        // playAndRecord/voiceChat profile. notifyOthersOnDeactivation lets
        // other audio sessions resume cleanly (e.g. Spotify, navigation).
        AsyncFunction("releaseAudioSession") { (promise: Promise) in
            DispatchQueue.main.async {
                let session = AVAudioSession.sharedInstance()
                do {
                    try session.setActive(false, options: [.notifyOthersOnDeactivation])
                    promise.resolve(true)
                } catch {
                    print("[Audio] releaseAudioSession error: \(error)")
                    promise.resolve(false)
                }
            }
        }

        // Toggle the loudspeaker output during an active call.
        //
        // ON:  overrideOutputAudioPort(.speaker) — explicit, forces the
        //      route to the loudspeaker regardless of session options.
        //
        // OFF: just calling overrideOutputAudioPort(.none) is NOT
        //      enough. prepareAudioSession sets the category with
        //      `.defaultToSpeaker`, which means the *default* route is
        //      already the speaker — clearing the override reverts to
        //      that default, leaving audio on the speaker. To actually
        //      route to the earpiece we have to re-set the category
        //      without `.defaultToSpeaker` first, then clear the
        //      override. Bluetooth / headphone routes still take
        //      precedence over both branches via .allowBluetooth.
        //
        // We don't bother re-adding `.defaultToSpeaker` when toggling
        // back ON because the explicit `.speaker` override is
        // sufficient — and skipping it avoids an extra audible
        // re-routing blip on the on→off→on path.
        // iOS-side no-ops for the foreground-service API. On iOS the
        // OS keeps a backgrounded call alive automatically via the
        // `audio` and `voip` UIBackgroundModes plus the active
        // AVAudioSession — no equivalent of Android's foreground
        // service exists or is required. Exposed so JS can call these
        // unconditionally without Platform checks.
        AsyncFunction("startCallService") { (_: String, _: String, _: Bool, promise: Promise) in
            promise.resolve(true)
        }

        AsyncFunction("stopCallService") { (promise: Promise) in
            promise.resolve(true)
        }

        AsyncFunction("setSpeakerphoneEnabled") { (enabled: Bool, promise: Promise) in
            DispatchQueue.main.async {
                let session = AVAudioSession.sharedInstance()
                do {
                    if enabled {
                        try session.overrideOutputAudioPort(.speaker)
                    } else {
                        try session.setCategory(
                            .playAndRecord,
                            mode: .voiceChat,
                            options: [.allowBluetooth]
                        )
                        try session.overrideOutputAudioPort(.none)
                    }
                    promise.resolve(true)
                } catch {
                    print("[Audio] setSpeakerphoneEnabled(\(enabled)) error: \(error)")
                    promise.resolve(false)
                }
            }
        }

        // Key Generation
        AsyncFunction("generateX448") { (promise: Promise) in
            self.cryptoQueue.async {
                let result = generateX448()
                promise.resolve(result)
            }
        }

        AsyncFunction("generateEd448") { (promise: Promise) in
            self.cryptoQueue.async {
                let result = generateEd448()
                promise.resolve(result)
            }
        }

        AsyncFunction("getPublicKeyX448") { (privateKey: String, promise: Promise) in
            self.cryptoQueue.async {
                guard !privateKey.isEmpty else {
                    promise.resolve("error: empty private key")
                    return
                }
                let result = getPubkeyX448(key: privateKey)
                promise.resolve(result)
            }
        }

        AsyncFunction("getPublicKeyEd448") { (privateKey: String, promise: Promise) in
            self.cryptoQueue.async {
                guard !privateKey.isEmpty else {
                    promise.resolve("error: empty private key")
                    return
                }
                let result = getPubkeyEd448(key: privateKey)
                promise.resolve(result)
            }
        }

        // Signing
        AsyncFunction("signEd448") { (privateKey: String, message: String, promise: Promise) in
            self.cryptoQueue.async {
                guard !privateKey.isEmpty else {
                    promise.resolve("error: empty private key")
                    return
                }
                let result = signEd448(key: privateKey, message: message)
                promise.resolve(result)
            }
        }

        AsyncFunction("verifyEd448") { (publicKey: String, message: String, signature: String, promise: Promise) in
            self.cryptoQueue.async {
                guard !publicKey.isEmpty, !signature.isEmpty else {
                    promise.resolve("error: empty public key or signature")
                    return
                }
                let result = verifyEd448(publicKey: publicKey, message: message, signature: signature)
                promise.resolve(result)
            }
        }

        // Inbox Message Encryption
        AsyncFunction("encryptInboxMessage") { (input: String, promise: Promise) in
            self.cryptoQueue.async {
                guard !input.isEmpty else {
                    promise.resolve("error: empty input")
                    return
                }
                let result = encryptInboxMessage(input: input)
                promise.resolve(result)
            }
        }

        AsyncFunction("decryptInboxMessage") { (input: String, promise: Promise) in
            self.cryptoQueue.async {
                guard !input.isEmpty else {
                    promise.resolve("error: empty input")
                    return
                }
                let result = decryptInboxMessage(input: input)
                promise.resolve(result)
            }
        }

        // X3DH Key Agreement
        AsyncFunction("senderX3dh") { (input: String, promise: Promise) in
            self.cryptoQueue.async {
                guard let data = input.data(using: .utf8),
                      let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                      let sendingIdentityPrivateKey = json["sending_identity_private_key"] as? [Int],
                      let sendingEphemeralPrivateKey = json["sending_ephemeral_private_key"] as? [Int],
                      let receivingIdentityKey = json["receiving_identity_key"] as? [Int],
                      let receivingSignedPreKey = json["receiving_signed_pre_key"] as? [Int],
                      let sessionKeyLength = json["session_key_length"] as? Int else {
                    promise.resolve("invalid input")
                    return
                }
                // Validate key lengths
                guard !sendingIdentityPrivateKey.isEmpty,
                      !sendingEphemeralPrivateKey.isEmpty,
                      !receivingIdentityKey.isEmpty,
                      !receivingSignedPreKey.isEmpty,
                      sessionKeyLength > 0 else {
                    promise.resolve("error: invalid key lengths")
                    return
                }
                let result = senderX3dh(
                    sendingIdentityPrivateKey: sendingIdentityPrivateKey.map { UInt8($0) },
                    sendingEphemeralPrivateKey: sendingEphemeralPrivateKey.map { UInt8($0) },
                    receivingIdentityKey: receivingIdentityKey.map { UInt8($0) },
                    receivingSignedPreKey: receivingSignedPreKey.map { UInt8($0) },
                    sessionKeyLength: UInt64(sessionKeyLength)
                )
                promise.resolve(result)
            }
        }

        AsyncFunction("receiverX3dh") { (input: String, promise: Promise) in
            self.cryptoQueue.async {
                guard let data = input.data(using: .utf8),
                      let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                      let sendingIdentityPrivateKey = json["sending_identity_private_key"] as? [Int],
                      let sendingSignedPrivateKey = json["sending_signed_private_key"] as? [Int],
                      let receivingIdentityKey = json["receiving_identity_key"] as? [Int],
                      let receivingEphemeralKey = json["receiving_ephemeral_key"] as? [Int],
                      let sessionKeyLength = json["session_key_length"] as? Int else {
                    promise.resolve("invalid input")
                    return
                }
                // Validate key lengths
                guard !sendingIdentityPrivateKey.isEmpty,
                      !sendingSignedPrivateKey.isEmpty,
                      !receivingIdentityKey.isEmpty,
                      !receivingEphemeralKey.isEmpty,
                      sessionKeyLength > 0 else {
                    promise.resolve("error: invalid key lengths")
                    return
                }
                let result = receiverX3dh(
                    sendingIdentityPrivateKey: sendingIdentityPrivateKey.map { UInt8($0) },
                    sendingSignedPrivateKey: sendingSignedPrivateKey.map { UInt8($0) },
                    receivingIdentityKey: receivingIdentityKey.map { UInt8($0) },
                    receivingEphemeralKey: receivingEphemeralKey.map { UInt8($0) },
                    sessionKeyLength: UInt64(sessionKeyLength)
                )
                promise.resolve(result)
            }
        }

        // Double Ratchet
        AsyncFunction("newDoubleRatchet") { (input: String, promise: Promise) in
            self.cryptoQueue.async {
                guard let data = input.data(using: .utf8),
                      let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                      let sessionKey = json["session_key"] as? [Int],
                      let sendingHeaderKey = json["sending_header_key"] as? [Int],
                      let nextReceivingHeaderKey = json["next_receiving_header_key"] as? [Int],
                      let isSender = json["is_sender"] as? Bool,
                      let sendingEphemeralPrivateKey = json["sending_ephemeral_private_key"] as? [Int],
                      let receivingEphemeralKey = json["receiving_ephemeral_key"] as? [Int] else {
                    promise.resolve("invalid input")
                    return
                }
                // Validate key lengths
                guard !sessionKey.isEmpty,
                      !sendingHeaderKey.isEmpty,
                      !nextReceivingHeaderKey.isEmpty,
                      !sendingEphemeralPrivateKey.isEmpty,
                      !receivingEphemeralKey.isEmpty else {
                    promise.resolve("error: invalid key lengths")
                    return
                }
                let result = newDoubleRatchet(
                    sessionKey: sessionKey.map { UInt8($0) },
                    sendingHeaderKey: sendingHeaderKey.map { UInt8($0) },
                    nextReceivingHeaderKey: nextReceivingHeaderKey.map { UInt8($0) },
                    isSender: isSender,
                    sendingEphemeralPrivateKey: sendingEphemeralPrivateKey.map { UInt8($0) },
                    receivingEphemeralKey: receivingEphemeralKey.map { UInt8($0) }
                )
                promise.resolve(result)
            }
        }

        AsyncFunction("doubleRatchetEncrypt") { (input: String, promise: Promise) in
            self.cryptoQueue.async {
                guard let data = input.data(using: .utf8),
                      let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                      let ratchetState = json["ratchet_state"] as? String,
                      let message = json["message"] as? [Int] else {
                    promise.resolve("{\"ratchet_state\":\"\",\"envelope\":\"invalid input\"}")
                    return
                }
                // Validate ratchet state is not empty
                guard !ratchetState.isEmpty else {
                    promise.resolve("{\"ratchet_state\":\"\",\"envelope\":\"error: empty ratchet state\"}")
                    return
                }
                let stateAndMessage = DoubleRatchetStateAndMessage(
                    ratchetState: ratchetState,
                    message: message.map { UInt8($0) }
                )
                do {
                    let result = try doubleRatchetEncrypt(ratchetStateAndMessage: stateAndMessage)
                    promise.resolve(self.serializeStateAndEnvelope(ratchetState: result.ratchetState, envelope: result.envelope))
                } catch let error as CryptoError {
                    promise.resolve("{\"ratchet_state\":\"\",\"envelope\":\"\",\"error\":\"\(self.cryptoErrorMessage(error))\"}")
                } catch {
                    promise.resolve("{\"ratchet_state\":\"\",\"envelope\":\"\",\"error\":\"encryption failed: \(error.localizedDescription)\"}")
                }
            }
        }

        AsyncFunction("doubleRatchetDecrypt") { (input: String, promise: Promise) in
            self.cryptoQueue.async {
                guard let data = input.data(using: .utf8),
                      let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                      let ratchetState = json["ratchet_state"] as? String,
                      let envelope = json["envelope"] as? String else {
                    promise.resolve("{\"ratchet_state\":\"\",\"message\":[]}")
                    return
                }
                // Validate ratchet state and envelope are not empty
                guard !ratchetState.isEmpty else {
                    promise.resolve("{\"ratchet_state\":\"\",\"message\":[],\"error\":\"empty ratchet state\"}")
                    return
                }
                guard !envelope.isEmpty else {
                    promise.resolve("{\"ratchet_state\":\"\",\"message\":[],\"error\":\"empty envelope\"}")
                    return
                }
                let stateAndEnvelope = DoubleRatchetStateAndEnvelope(
                    ratchetState: ratchetState,
                    envelope: envelope
                )
                do {
                    let result = try doubleRatchetDecrypt(ratchetStateAndEnvelope: stateAndEnvelope)
                    promise.resolve(self.serializeStateAndMessage(ratchetState: result.ratchetState, message: result.message))
                } catch let error as CryptoError {
                    promise.resolve("{\"ratchet_state\":\"\",\"message\":[],\"error\":\"\(self.cryptoErrorMessage(error))\"}")
                } catch {
                    promise.resolve("{\"ratchet_state\":\"\",\"message\":[],\"error\":\"decryption failed: \(error.localizedDescription)\"}")
                }
            }
        }

        // Triple Ratchet
        AsyncFunction("newTripleRatchet") { (input: String, promise: Promise) in
            self.cryptoQueue.async {
                guard let data = input.data(using: .utf8),
                      let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                      let peers = json["peers"] as? [[Int]],
                      let peerKey = json["peer_key"] as? [Int],
                      let identityKey = json["identity_key"] as? [Int],
                      let signedPreKey = json["signed_pre_key"] as? [Int],
                      let threshold = json["threshold"] as? Int,
                      let asyncDkgRatchet = json["async_dkg_ratchet"] as? Bool else {
                    promise.resolve("{\"ratchet_state\":\"\",\"metadata\":{}}")
                    return
                }
                // Validate inputs
                guard !peers.isEmpty,
                      !peerKey.isEmpty,
                      !identityKey.isEmpty,
                      !signedPreKey.isEmpty,
                      threshold > 0 else {
                    promise.resolve("{\"ratchet_state\":\"\",\"metadata\":{},\"error\":\"invalid inputs\"}")
                    return
                }
                let result = newTripleRatchet(
                    peers: peers.map { $0.map { UInt8($0) } },
                    peerKey: peerKey.map { UInt8($0) },
                    identityKey: identityKey.map { UInt8($0) },
                    signedPreKey: signedPreKey.map { UInt8($0) },
                    threshold: UInt64(threshold),
                    asyncDkgRatchet: asyncDkgRatchet
                )
                promise.resolve(self.serializeTripleRatchetStateAndMetadata(result))
            }
        }

        AsyncFunction("tripleRatchetInitRound1") { (input: String, promise: Promise) in
            self.cryptoQueue.async {
                guard let stateAndMetadata = self.parseTripleRatchetStateAndMetadata(input) else {
                    promise.resolve("{\"ratchet_state\":\"\",\"metadata\":{}}")
                    return
                }
                guard !stateAndMetadata.ratchetState.isEmpty else {
                    promise.resolve("{\"ratchet_state\":\"\",\"metadata\":{},\"error\":\"empty ratchet state\"}")
                    return
                }
                do {
                    let result = try tripleRatchetInitRound1(ratchetStateAndMetadata: stateAndMetadata)
                    promise.resolve(self.serializeTripleRatchetStateAndMetadata(result))
                } catch let error as CryptoError {
                    promise.resolve("{\"ratchet_state\":\"\",\"metadata\":{},\"error\":\"\(self.cryptoErrorMessage(error))\"}")
                } catch {
                    promise.resolve("{\"ratchet_state\":\"\",\"metadata\":{},\"error\":\"init round 1 failed: \(error.localizedDescription)\"}")
                }
            }
        }

        AsyncFunction("tripleRatchetInitRound2") { (input: String, promise: Promise) in
            self.cryptoQueue.async {
                guard let stateAndMetadata = self.parseTripleRatchetStateAndMetadata(input) else {
                    promise.resolve("{\"ratchet_state\":\"\",\"metadata\":{}}")
                    return
                }
                guard !stateAndMetadata.ratchetState.isEmpty else {
                    promise.resolve("{\"ratchet_state\":\"\",\"metadata\":{},\"error\":\"empty ratchet state\"}")
                    return
                }
                do {
                    let result = try tripleRatchetInitRound2(ratchetStateAndMetadata: stateAndMetadata)
                    promise.resolve(self.serializeTripleRatchetStateAndMetadata(result))
                } catch let error as CryptoError {
                    promise.resolve("{\"ratchet_state\":\"\",\"metadata\":{},\"error\":\"\(self.cryptoErrorMessage(error))\"}")
                } catch {
                    promise.resolve("{\"ratchet_state\":\"\",\"metadata\":{},\"error\":\"init round 2 failed: \(error.localizedDescription)\"}")
                }
            }
        }

        AsyncFunction("tripleRatchetInitRound3") { (input: String, promise: Promise) in
            self.cryptoQueue.async {
                guard let stateAndMetadata = self.parseTripleRatchetStateAndMetadata(input) else {
                    promise.resolve("{\"ratchet_state\":\"\",\"metadata\":{}}")
                    return
                }
                guard !stateAndMetadata.ratchetState.isEmpty else {
                    promise.resolve("{\"ratchet_state\":\"\",\"metadata\":{},\"error\":\"empty ratchet state\"}")
                    return
                }
                do {
                    let result = try tripleRatchetInitRound3(ratchetStateAndMetadata: stateAndMetadata)
                    promise.resolve(self.serializeTripleRatchetStateAndMetadata(result))
                } catch let error as CryptoError {
                    promise.resolve("{\"ratchet_state\":\"\",\"metadata\":{},\"error\":\"\(self.cryptoErrorMessage(error))\"}")
                } catch {
                    promise.resolve("{\"ratchet_state\":\"\",\"metadata\":{},\"error\":\"init round 3 failed: \(error.localizedDescription)\"}")
                }
            }
        }

        AsyncFunction("tripleRatchetInitRound4") { (input: String, promise: Promise) in
            self.cryptoQueue.async {
                guard let stateAndMetadata = self.parseTripleRatchetStateAndMetadata(input) else {
                    promise.resolve("{\"ratchet_state\":\"\",\"metadata\":{}}")
                    return
                }
                guard !stateAndMetadata.ratchetState.isEmpty else {
                    promise.resolve("{\"ratchet_state\":\"\",\"metadata\":{},\"error\":\"empty ratchet state\"}")
                    return
                }
                do {
                    let result = try tripleRatchetInitRound4(ratchetStateAndMetadata: stateAndMetadata)
                    promise.resolve(self.serializeTripleRatchetStateAndMetadata(result))
                } catch let error as CryptoError {
                    promise.resolve("{\"ratchet_state\":\"\",\"metadata\":{},\"error\":\"\(self.cryptoErrorMessage(error))\"}")
                } catch {
                    promise.resolve("{\"ratchet_state\":\"\",\"metadata\":{},\"error\":\"init round 4 failed: \(error.localizedDescription)\"}")
                }
            }
        }

        AsyncFunction("tripleRatchetEncrypt") { (input: String, promise: Promise) in
            self.cryptoQueue.async {
                guard let data = input.data(using: .utf8),
                      let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                      let ratchetState = json["ratchet_state"] as? String,
                      let message = json["message"] as? [Int] else {
                    promise.resolve("{\"ratchet_state\":\"\",\"envelope\":\"\"}")
                    return
                }
                guard !ratchetState.isEmpty else {
                    promise.resolve("{\"ratchet_state\":\"\",\"envelope\":\"\",\"error\":\"empty ratchet state\"}")
                    return
                }
                let stateAndMessage = TripleRatchetStateAndMessage(
                    ratchetState: ratchetState,
                    message: message.map { UInt8($0) }
                )
                do {
                    let result = try tripleRatchetEncrypt(ratchetStateAndMessage: stateAndMessage)
                    promise.resolve(self.serializeStateAndEnvelope(ratchetState: result.ratchetState, envelope: result.envelope))
                } catch let error as CryptoError {
                    promise.resolve("{\"ratchet_state\":\"\",\"envelope\":\"\",\"error\":\"\(self.cryptoErrorMessage(error))\"}")
                } catch {
                    promise.resolve("{\"ratchet_state\":\"\",\"envelope\":\"\",\"error\":\"encryption failed: \(error.localizedDescription)\"}")
                }
            }
        }

        AsyncFunction("tripleRatchetDecrypt") { (input: String, promise: Promise) in
            self.cryptoQueue.async {
                guard let data = input.data(using: .utf8),
                      let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                      let ratchetState = json["ratchet_state"] as? String,
                      let envelope = json["envelope"] as? String else {
                    promise.resolve("{\"ratchet_state\":\"\",\"message\":[]}")
                    return
                }
                guard !ratchetState.isEmpty else {
                    promise.resolve("{\"ratchet_state\":\"\",\"message\":[],\"error\":\"empty ratchet state\"}")
                    return
                }
                guard !envelope.isEmpty else {
                    promise.resolve("{\"ratchet_state\":\"\",\"message\":[],\"error\":\"empty envelope\"}")
                    return
                }
                let stateAndEnvelope = TripleRatchetStateAndEnvelope(
                    ratchetState: ratchetState,
                    envelope: envelope
                )
                do {
                    let result = try tripleRatchetDecrypt(ratchetStateAndEnvelope: stateAndEnvelope)
                    promise.resolve(self.serializeStateAndMessage(ratchetState: result.ratchetState, message: result.message))
                } catch let error as CryptoError {
                    promise.resolve("{\"ratchet_state\":\"\",\"message\":[],\"error\":\"\(self.cryptoErrorMessage(error))\"}")
                } catch {
                    promise.resolve("{\"ratchet_state\":\"\",\"message\":[],\"error\":\"decryption failed: \(error.localizedDescription)\"}")
                }
            }
        }

        // Batch Unseal Envelopes - processes multiple sealed messages in one native call
        // Eliminates N JS-native bridge crossings for N messages
        AsyncFunction("batchUnsealEnvelopes") { (input: String, promise: Promise) in
            self.cryptoQueue.async {
                guard let data = input.data(using: .utf8),
                      let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                      let hubPrivateKey = json["hub_private_key"] as? [Int],
                      let messages = json["messages"] as? [[String: Any]] else {
                    promise.resolve("{\"results\":[]}")
                    return
                }

                // Derive X448 private key ONCE for the whole batch
                let x448PrivateKey: [UInt8]
                if let configPrivateKey = json["config_private_key"] as? [Int], !configPrivateKey.isEmpty {
                    x448PrivateKey = configPrivateKey.map { UInt8($0) }
                } else {
                    // SHA-512 of hub private key, take first 56 bytes for X448
                    let hubKeyBytes = hubPrivateKey.map { UInt8($0) }
                    var sha512Hash = [UInt8](repeating: 0, count: Int(CC_SHA512_DIGEST_LENGTH))
                    let hubKeyData = Data(hubKeyBytes)
                    _ = hubKeyData.withUnsafeBytes { ptr in
                        CC_SHA512(ptr.baseAddress, CC_LONG(hubKeyData.count), &sha512Hash)
                    }
                    x448PrivateKey = Array(sha512Hash.prefix(56))
                }

                var results: [[String: Any]] = []

                for msg in messages {
                    guard let ephemeralPubKeyHex = msg["ephemeral_public_key"] as? String,
                          let envelope = msg["envelope"] as? String else {
                        results.append(["error": "invalid message format"])
                        continue
                    }

                    // Parse ephemeral public key from hex
                    let ephemeralPubKey = self.hexStringToBytes(ephemeralPubKeyHex)

                    // Parse envelope JSON (contains ciphertext, initialization_vector, associated_data)
                    guard let envelopeData = envelope.data(using: .utf8),
                          let envelopeJson = try? JSONSerialization.jsonObject(with: envelopeData) as? [String: Any] else {
                        results.append(["error": "invalid envelope JSON"])
                        continue
                    }

                    // Build decryptInboxMessage input JSON. Byte fields
                    // go as base64 strings now — see Rust
                    // deserialize_bytes_b64_or_array. Avoids the
                    // `.map { Int($0) }` allocation churn (boxed Int
                    // per byte) that built up under batches.
                    let decryptInput: [String: Any] = [
                        "inbox_private_key": self.bytesToBase64(x448PrivateKey),
                        "ephemeral_public_key": self.bytesToBase64(ephemeralPubKey),
                        "ciphertext": envelopeJson
                    ]

                    guard let inputData = try? JSONSerialization.data(withJSONObject: decryptInput),
                          let inputString = String(data: inputData, encoding: .utf8) else {
                        results.append(["error": "failed to build decrypt input"])
                        continue
                    }

                    // Call Rust decryptInboxMessage
                    let decryptResult = decryptInboxMessage(input: inputString)

                    // Rust returns decrypted bytes as base64 now. Errors
                    // are still plain-text strings — a base64 decode
                    // failure plus an "error"/"invalid"/"failed" token
                    // in the result identifies an error response.
                    if let plaintextData = self.decryptInboxBytes(decryptResult),
                       let plaintext = String(data: plaintextData, encoding: .utf8) {
                        results.append(["plaintext": self.sanitizeForJSON(plaintext)])
                    } else if decryptResult.contains("error") || decryptResult.contains("invalid") || decryptResult.contains("failed") {
                        results.append(["error": decryptResult])
                    } else {
                        results.append(["error": "unexpected decrypt result format: \(decryptResult.prefix(100))"])
                    }
                }

                let output: [String: Any] = ["results": results]
                if let outputData = try? JSONSerialization.data(withJSONObject: output),
                   let outputString = String(data: outputData, encoding: .utf8) {
                    promise.resolve(outputString)
                } else {
                    promise.resolve("{\"results\":[]}")
                }
            }
        }

        // Batch Process Messages - entire message processing loop in one native call
        // Handles unseal + TR/DR decrypt for all messages in a batch
        AsyncFunction("batchProcessMessages") { (input: String, promise: Promise) in
            self.cryptoQueue.async {
                guard let data = input.data(using: .utf8),
                      let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                    promise.resolve("{\"space_results\":[],\"dm_results\":[]}")
                    return
                }

                let userAddress = json["user_address"] as? String ?? ""
                let spaceGroupsArr = json["space_groups"] as? [[String: Any]] ?? []
                let dmGroupsArr = json["dm_groups"] as? [[String: Any]] ?? []

                var spaceResults: [[String: Any]] = []
                var dmResults: [[String: Any]] = []

                // ====== SPACE GROUPS ======
                for group in spaceGroupsArr {
                    guard let spaceId = group["space_id"] as? String,
                          let hubPrivateKey = group["hub_private_key"] as? [Int],
                          let messagesArr = group["messages"] as? [[String: Any]] else {
                        continue
                    }

                    let sentFingerprints = group["sent_envelope_fingerprints"] as? [String] ?? []
                    let sentFingerprintSet = Set(sentFingerprints)

                    // Derive X448 private key ONCE for the whole group
                    let x448PrivateKey: [UInt8]
                    if let configPrivateKey = group["config_private_key"] as? [Int], !configPrivateKey.isEmpty {
                        x448PrivateKey = configPrivateKey.map { UInt8($0) }
                    } else {
                        let hubKeyBytes = hubPrivateKey.map { UInt8($0) }
                        var sha512Hash = [UInt8](repeating: 0, count: Int(CC_SHA512_DIGEST_LENGTH))
                        let hubKeyData = Data(hubKeyBytes)
                        hubKeyData.withUnsafeBytes { ptr in
                            CC_SHA512(ptr.baseAddress, CC_LONG(hubKeyData.count), &sha512Hash)
                        }
                        x448PrivateKey = Array(sha512Hash.prefix(56))
                    }

                    // Get TR state - evolves sequentially through messages
                    var currentTRState = group["tr_state"] as? String ?? ""
                    let trFallbackState = group["tr_fallback_state"] as? String
                    let trStateIsNested = group["tr_state_is_nested"] as? Bool ?? false
                    var anyTRStateUpdated = false

                    var messageResults: [[String: Any]] = []

                    for msg in messagesArr {
                        let timestamp = msg["timestamp"] as? Int ?? 0

                        guard let ephemeralPubKeyHex = msg["ephemeral_public_key"] as? String,
                              let envelope = msg["envelope"] as? String else {
                            messageResults.append([
                                "status": "unseal_failed",
                                "timestamp": timestamp
                            ])
                            continue
                        }

                        // Step 1: Unseal the envelope
                        let ephemeralPubKey = self.hexStringToBytes(ephemeralPubKeyHex)

                        guard let envelopeData = envelope.data(using: .utf8),
                              let envelopeJson = try? JSONSerialization.jsonObject(with: envelopeData) as? [String: Any] else {
                            messageResults.append([
                                "status": "unseal_failed",
                                "timestamp": timestamp
                            ])
                            continue
                        }

                        let decryptInput: [String: Any] = [
                            "inbox_private_key": self.bytesToBase64(x448PrivateKey),
                            "ephemeral_public_key": self.bytesToBase64(ephemeralPubKey),
                            "ciphertext": envelopeJson
                        ]

                        guard let inputData = try? JSONSerialization.data(withJSONObject: decryptInput),
                              let inputString = String(data: inputData, encoding: .utf8) else {
                            messageResults.append([
                                "status": "unseal_failed",
                                "timestamp": timestamp
                            ])
                            continue
                        }

                        let decryptResult = decryptInboxMessage(input: inputString)

                        // Base64-encoded bytes from the Rust binding.
                        guard let plaintextData = self.decryptInboxBytes(decryptResult),
                              let unsealedPayload = String(data: plaintextData, encoding: .utf8) else {
                            messageResults.append([
                                "status": "unseal_failed",
                                "timestamp": timestamp
                            ])
                            continue
                        }

                        // Step 2: Parse the unsealed payload
                        guard let payloadData = unsealedPayload.data(using: .utf8),
                              let payload = try? JSONSerialization.jsonObject(with: payloadData) as? [String: Any],
                              let payloadType = payload["type"] as? String else {
                            messageResults.append([
                                "status": "unseal_failed",
                                "timestamp": timestamp
                            ])
                            continue
                        }

                        // Step 3: Handle control messages - return as-is for JS to process
                        if payloadType == "control" {
                            messageResults.append([
                                "status": "control",
                                "control_payload": self.sanitizeForJSON(unsealedPayload),
                                "timestamp": timestamp
                            ])
                            continue
                        }

                        guard payloadType == "message" else {
                            messageResults.append([
                                "status": "decrypt_failed",
                                "timestamp": timestamp
                            ])
                            continue
                        }

                        // Step 4: Check if already plaintext (envelope-only encryption, no TR)
                        if let msgObj = payload["message"] as? [String: Any],
                           msgObj["messageId"] != nil && msgObj["channelId"] != nil && msgObj["content"] != nil {
                            // Check self-echo by senderId
                            if let content = msgObj["content"] as? [String: Any],
                               let senderId = content["senderId"] as? String,
                               senderId == userAddress {
                                messageResults.append([
                                    "status": "self_echo",
                                    "timestamp": timestamp
                                ])
                                continue
                            }
                            // Return as plaintext
                            if let msgData = try? JSONSerialization.data(withJSONObject: msgObj),
                               let msgStr = String(data: msgData, encoding: .utf8) {
                                messageResults.append([
                                    "status": "plaintext",
                                    "decrypted_message": self.sanitizeForJSON(msgStr),
                                    "timestamp": timestamp
                                ])
                            } else {
                                messageResults.append([
                                    "status": "decrypt_failed",
                                    "timestamp": timestamp
                                ])
                            }
                            continue
                        }

                        // Step 5: TR-encrypted message - get envelope string
                        let trEnvelope: String
                        if let msgStr = payload["message"] as? String {
                            trEnvelope = msgStr
                        } else if let msgObj = payload["message"] {
                            if let msgData = try? JSONSerialization.data(withJSONObject: msgObj),
                               let msgStr = String(data: msgData, encoding: .utf8) {
                                trEnvelope = msgStr
                            } else {
                                messageResults.append([
                                    "status": "decrypt_failed",
                                    "timestamp": timestamp
                                ])
                                continue
                            }
                        } else {
                            messageResults.append([
                                "status": "decrypt_failed",
                                "timestamp": timestamp
                            ])
                            continue
                        }

                        // Check self-echo via fingerprint (first 100 chars)
                        let fingerprint = String(trEnvelope.prefix(100))
                        if sentFingerprintSet.contains(fingerprint) {
                            messageResults.append([
                                "status": "self_echo",
                                "timestamp": timestamp
                            ])
                            continue
                        }

                        // Step 6: TR decrypt - try primary state first, then fallback
                        if currentTRState.isEmpty {
                            messageResults.append([
                                "status": "decrypt_failed",
                                "timestamp": timestamp
                            ])
                            continue
                        }

                        var usedFallback = false
                        var trDecryptResult: TripleRatchetStateAndMessage?

                        // Try primary state
                        do {
                            let stateAndEnvelope = TripleRatchetStateAndEnvelope(
                                ratchetState: currentTRState,
                                envelope: trEnvelope
                            )
                            let result = try tripleRatchetDecrypt(ratchetStateAndEnvelope: stateAndEnvelope)
                            // Validate result
                            if result.ratchetState.contains("invalid") || result.ratchetState.contains("error") || result.message.isEmpty {
                                throw NSError(domain: "CryptoError", code: -1)
                            }
                            trDecryptResult = result
                        } catch {
                            // Try fallback state
                            if let fallback = trFallbackState, !fallback.isEmpty {
                                do {
                                    let fallbackStateAndEnvelope = TripleRatchetStateAndEnvelope(
                                        ratchetState: fallback,
                                        envelope: trEnvelope
                                    )
                                    let fallbackResult = try tripleRatchetDecrypt(ratchetStateAndEnvelope: fallbackStateAndEnvelope)
                                    // Validate fallback result
                                    let lowerState = fallbackResult.ratchetState.lowercased()
                                    if lowerState.contains("invalid") || lowerState.contains("error") || lowerState.contains("crypto error") || fallbackResult.message.isEmpty {
                                        throw NSError(domain: "CryptoError", code: -1)
                                    }
                                    trDecryptResult = fallbackResult
                                    usedFallback = true
                                } catch {
                                    // Both primary and fallback failed
                                    trDecryptResult = nil
                                }
                            }
                        }

                        guard let decResult = trDecryptResult, !decResult.message.isEmpty else {
                            messageResults.append([
                                "status": "decrypt_failed",
                                "timestamp": timestamp
                            ])
                            continue
                        }

                        // Update TR state for next message (only if not fallback)
                        if !usedFallback {
                            let newState = decResult.ratchetState
                            if !newState.contains("invalid") && newState.hasPrefix("{") {
                                currentTRState = newState
                                anyTRStateUpdated = true
                            }
                        }

                        // Decode decrypted bytes to string
                        let decryptedBytes = Data(decResult.message)
                        guard let decryptedText = String(data: decryptedBytes, encoding: .utf8) else {
                            messageResults.append([
                                "status": "decrypt_failed",
                                "timestamp": timestamp
                            ])
                            continue
                        }

                        // Check self-echo by senderId in decrypted message
                        if let decMsgData = decryptedText.data(using: .utf8),
                           let decMsg = try? JSONSerialization.jsonObject(with: decMsgData) as? [String: Any],
                           let content = decMsg["content"] as? [String: Any],
                           let senderId = content["senderId"] as? String,
                           senderId == userAddress {
                            messageResults.append([
                                "status": "self_echo",
                                "timestamp": timestamp
                            ])
                            continue
                        }

                        messageResults.append([
                            "status": "decrypted",
                            "decrypted_message": self.sanitizeForJSON(decryptedText),
                            "used_fallback": usedFallback,
                            "timestamp": timestamp
                        ])
                    }

                    // Write updated TR state to MMKV
                    if anyTRStateUpdated {
                        let spaceConversationId = "\(spaceId)/\(spaceId)"
                        let existingStates = self.readAllEncryptionStates(spaceConversationId)
                        if let first = existingStates.first {
                            // Check if the state was nested (had template/evals wrapper)
                            if trStateIsNested {
                                // Read original to preserve template/evals
                                if let origJson = self.readEncryptionState(spaceConversationId, first.inboxId),
                                   let origData = origJson.data(using: .utf8),
                                   let origObj = try? JSONSerialization.jsonObject(with: origData) as? [String: Any] {
                                    // The inner state has template/evals at the outer level
                                    var wrapperObj: [String: Any] = origObj
                                    wrapperObj["state"] = self.sanitizeForJSON(currentTRState)
                                    wrapperObj["timestamp"] = Int(Date().timeIntervalSince1970 * 1000)
                                    if let wrapperData = try? JSONSerialization.data(withJSONObject: wrapperObj),
                                       let wrapperJson = String(data: wrapperData, encoding: .utf8) {
                                        self.writeEncryptionState(
                                            conversationId: spaceConversationId,
                                            inboxId: first.inboxId,
                                            stateJson: wrapperJson,
                                            updateLatest: false
                                        )
                                    }
                                }
                            } else {
                                self.writeEncryptionState(
                                    conversationId: spaceConversationId,
                                    inboxId: first.inboxId,
                                    stateJson: self.buildEncryptionStateJson(
                                        state: currentTRState,
                                        conversationId: spaceConversationId,
                                        inboxId: first.inboxId,
                                        sentAccept: false,
                                        sendingInbox: nil,
                                        tag: nil
                                    ),
                                    updateLatest: false
                                )
                            }
                        }
                    }

                    let groupResult: [String: Any] = [
                        "space_id": spaceId,
                        "messages": messageResults
                    ]
                    spaceResults.append(groupResult)
                }

                // ====== DM GROUPS ======
                for group in dmGroupsArr {
                    guard let conversationId = group["conversation_id"] as? String,
                          let messageType = group["message_type"] as? String,
                          let messagesArr = group["messages"] as? [[String: Any]] else {
                        continue
                    }

                    let drStatesArr = group["dr_states"] as? [[String: Any]] ?? []
                    let identityPrivateKey = group["identity_private_key"] as? [Int] ?? []
                    let preKeyPrivateKey = group["pre_key_private_key"] as? [Int] ?? []
                    let deviceInboxEncPrivateKey = group["device_inbox_encryption_private_key"] as? [Int] ?? []

                    // Build mutable state map for trial decryption
                    var stateMap: [(conversationId: String, inboxId: String, state: String)] = drStatesArr.compactMap { s in
                        guard let cId = s["conversation_id"] as? String,
                              let iId = s["inbox_id"] as? String,
                              let st = s["state"] as? String else { return nil }
                        return (conversationId: cId, inboxId: iId, state: st)
                    }

                    var messageResults: [[String: Any]] = []
                    var newConversationInbox: String? = nil

                    for msg in messagesArr {
                        let timestamp = msg["timestamp"] as? Int ?? 0
                        let isDoubleRatchetEnvelope = msg["is_double_ratchet_envelope"] as? Bool ?? false
                        let isInitEnvelope = msg["is_init_envelope"] as? Bool ?? false

                        guard let encryptedContent = msg["encrypted_content"] as? String else {
                            messageResults.append([
                                "status": "decrypt_failed",
                                "timestamp": timestamp
                            ])
                            continue
                        }

                        // ====== INIT ENVELOPE HANDLING (device inbox) ======
                        if messageType == "device_inbox" && isInitEnvelope && !deviceInboxEncPrivateKey.isEmpty {
                            // Step 1: Parse sealed message
                            guard let sealedData = encryptedContent.data(using: .utf8),
                                  let sealed = try? JSONSerialization.jsonObject(with: sealedData) as? [String: Any],
                                  let sealedEphPubKeyHex = sealed["ephemeral_public_key"] as? String,
                                  let sealedEnvStr = sealed["envelope"] as? String else {
                                messageResults.append(["status": "unseal_failed", "timestamp": timestamp])
                                continue
                            }

                            // Step 2: Unseal with device inbox encryption key
                            let sealedEphPubKey = self.hexStringToBytes(sealedEphPubKeyHex)
                            guard let envData = sealedEnvStr.data(using: .utf8),
                                  let envJson = try? JSONSerialization.jsonObject(with: envData) as? [String: Any] else {
                                messageResults.append(["status": "unseal_failed", "timestamp": timestamp])
                                continue
                            }

                            let unsealInput: [String: Any] = [
                                "inbox_private_key": self.intArrayToBase64(deviceInboxEncPrivateKey),
                                "ephemeral_public_key": self.bytesToBase64(sealedEphPubKey),
                                "ciphertext": envJson
                            ]

                            guard let unsealInputData = try? JSONSerialization.data(withJSONObject: unsealInput),
                                  let unsealInputStr = String(data: unsealInputData, encoding: .utf8) else {
                                messageResults.append(["status": "unseal_failed", "timestamp": timestamp])
                                continue
                            }

                            let unsealResultStr = decryptInboxMessage(input: unsealInputStr)
                            // Base64-encoded bytes from the Rust binding.
                            guard let unsealedBytesData = self.decryptInboxBytes(unsealResultStr),
                                  let unsealedJsonStr = String(data: unsealedBytesData, encoding: .utf8),
                                  let unsealedJsonData = unsealedJsonStr.data(using: .utf8),
                                  let envelope = try? JSONSerialization.jsonObject(with: unsealedJsonData) as? [String: Any] else {
                                messageResults.append(["status": "unseal_failed", "timestamp": timestamp])
                                continue
                            }

                            // Step 3: Parse UnsealedEnvelope
                            guard let senderAddress = envelope["user_address"] as? String,
                                  let identityPubKeyHex = envelope["identity_public_key"] as? String,
                                  let drEnvelopeStr = envelope["message"] as? String,
                                  let returnInboxAddr = envelope["return_inbox_address"] as? String,
                                  let returnInboxEncKey = envelope["return_inbox_encryption_key"] as? String else {
                                messageResults.append(["status": "unseal_failed", "timestamp": timestamp])
                                continue
                            }

                            // CRITICAL: Use the sealed message's ephemeral_public_key (top-level), not envelope's
                            let ephemeralPubKeyHex = sealedEphPubKeyHex

                            let returnInboxPubKey = envelope["return_inbox_public_key"] as? String ?? ""
                            let displayName = envelope["display_name"] as? String
                            let userIcon = envelope["user_icon"] as? String
                            let initConversationId = "\(senderAddress)/\(senderAddress)"

                            // Unescape DR envelope if needed
                            var cleanEnvelope = drEnvelopeStr
                            if cleanEnvelope.contains("\\") {
                                cleanEnvelope = cleanEnvelope.replacingOccurrences(of: "\\\"", with: "\"")
                                    .replacingOccurrences(of: "\\\\", with: "\\")
                            }

                            // Step 4: Check ephemeral cache
                            var decryptedMessage: String? = nil
                            var finalRatchetState: String? = nil
                            var usedExistingState = false
                            var existingInboxId: String? = nil

                            if let cachedStateJson = self.readEphemeralCache(initConversationId, ephemeralPubKeyHex),
                               let cachedData = cachedStateJson.data(using: .utf8),
                               let cachedObj = try? JSONSerialization.jsonObject(with: cachedData) as? [String: Any],
                               let cachedState = cachedObj["state"] as? String, !cachedState.isEmpty {
                                let stateAndEnvelope = DoubleRatchetStateAndEnvelope(
                                    ratchetState: cachedState,
                                    envelope: cleanEnvelope
                                )
                                do {
                                    let result = try doubleRatchetDecrypt(ratchetStateAndEnvelope: stateAndEnvelope)
                                    let msgStr = String(bytes: result.message.map { $0 }, encoding: .utf8) ?? ""
                                    if !msgStr.starts(with: "Decryption failed:") && !msgStr.contains("aead::Error") && !result.message.isEmpty {
                                        decryptedMessage = String(data: Data(result.message), encoding: .utf8)
                                        finalRatchetState = result.ratchetState
                                        usedExistingState = true
                                        existingInboxId = cachedObj["inboxId"] as? String
                                    }
                                } catch { /* fall through */ }
                            }

                            // Step 5: Check existing states
                            if decryptedMessage == nil {
                                let existingStates = self.readAllEncryptionStates(initConversationId)
                                for es in existingStates {
                                    guard let esData = es.state.data(using: .utf8),
                                          let esObj = try? JSONSerialization.jsonObject(with: esData) as? [String: Any],
                                          let esState = esObj["state"] as? String, !esState.isEmpty else { continue }

                                    let stateAndEnvelope = DoubleRatchetStateAndEnvelope(
                                        ratchetState: esState,
                                        envelope: cleanEnvelope
                                    )
                                    do {
                                        let result = try doubleRatchetDecrypt(ratchetStateAndEnvelope: stateAndEnvelope)
                                        let msgStr = String(bytes: result.message.map { $0 }, encoding: .utf8) ?? ""
                                        if !msgStr.starts(with: "Decryption failed:") && !msgStr.contains("aead::Error") && !result.message.isEmpty {
                                            decryptedMessage = String(data: Data(result.message), encoding: .utf8)
                                            finalRatchetState = result.ratchetState
                                            usedExistingState = true
                                            existingInboxId = es.inboxId
                                            break
                                        }
                                    } catch { continue }
                                }
                            }

                            // Step 6: Fresh X3DH if no existing state worked
                            if decryptedMessage == nil && !identityPrivateKey.isEmpty && !preKeyPrivateKey.isEmpty {
                                let senderIdentityKey = self.hexStringToBytes(identityPubKeyHex)
                                let senderEphemeralKey = self.hexStringToBytes(ephemeralPubKeyHex)

                                // receiverX3DH
                                let x3dhResult = receiverX3dh(
                                    sendingIdentityPrivateKey: identityPrivateKey.map { UInt8($0) },
                                    sendingSignedPrivateKey: preKeyPrivateKey.map { UInt8($0) },
                                    receivingIdentityKey: senderIdentityKey.map { UInt8($0) },
                                    receivingEphemeralKey: senderEphemeralKey.map { UInt8($0) },
                                    sessionKeyLength: 96
                                )

                                // Decode session key from base64
                                if let sessionKeyBase64Data = Data(base64Encoded: x3dhResult.trimmingCharacters(in: CharacterSet(charactersIn: "\""))) {
                                    let sessionKeyBytes = Array(sessionKeyBase64Data)
                                    if sessionKeyBytes.count >= 96 {
                                        let sessionKey = Array(sessionKeyBytes[0..<32]).map { UInt8($0) }
                                        let sendingHeaderKey = Array(sessionKeyBytes[32..<64]).map { UInt8($0) }
                                        let receivingHeaderKey = Array(sessionKeyBytes[64..<96]).map { UInt8($0) }

                                        // newDoubleRatchet (is_sender = false)
                                        let ratchetState = newDoubleRatchet(
                                            sessionKey: sessionKey,
                                            sendingHeaderKey: sendingHeaderKey,
                                            nextReceivingHeaderKey: receivingHeaderKey,
                                            isSender: false,
                                            sendingEphemeralPrivateKey: preKeyPrivateKey.map { UInt8($0) },
                                            receivingEphemeralKey: senderEphemeralKey.map { UInt8($0) }
                                        )

                                        if !ratchetState.contains("invalid") && !ratchetState.contains("error") {
                                            // doubleRatchetDecrypt
                                            let stateAndEnvelope = DoubleRatchetStateAndEnvelope(
                                                ratchetState: ratchetState,
                                                envelope: cleanEnvelope
                                            )
                                            do {
                                                let result = try doubleRatchetDecrypt(ratchetStateAndEnvelope: stateAndEnvelope)
                                                let msgStr = String(bytes: result.message.map { $0 }, encoding: .utf8) ?? ""
                                                if !msgStr.starts(with: "Decryption failed:") && !msgStr.contains("aead::Error") && !result.message.isEmpty {
                                                    decryptedMessage = String(data: Data(result.message), encoding: .utf8)
                                                    finalRatchetState = result.ratchetState

                                                    // Step 7: Generate keypairs
                                                    let convEncKeypairJson = generateX448()
                                                    let convSignKeypairJson = generateEd448()

                                                    var convEncPub: [UInt8] = []
                                                    var convEncPriv: [UInt8] = []
                                                    var convSignPub: [UInt8] = []
                                                    var convSignPriv: [UInt8] = []

                                                    if let encData = convEncKeypairJson.data(using: .utf8),
                                                       let encKp = try? JSONSerialization.jsonObject(with: encData) as? [String: Any],
                                                       let pubArr = encKp["public_key"] as? [Int],
                                                       let privArr = encKp["private_key"] as? [Int] {
                                                        convEncPub = pubArr.map { UInt8($0) }
                                                        convEncPriv = privArr.map { UInt8($0) }
                                                    }
                                                    if let signData = convSignKeypairJson.data(using: .utf8),
                                                       let signKp = try? JSONSerialization.jsonObject(with: signData) as? [String: Any],
                                                       let pubArr = signKp["public_key"] as? [Int],
                                                       let privArr = signKp["private_key"] as? [Int] {
                                                        convSignPub = pubArr.map { UInt8($0) }
                                                        convSignPriv = privArr.map { UInt8($0) }
                                                    }

                                                    // Step 8: Derive address from Ed448 signing key
                                                    let convInboxAddress = self.deriveAddress(convSignPub)

                                                    // Step 9: Write all state to MMKV
                                                    let sendingInbox: [String: String] = [
                                                        "inbox_address": returnInboxAddr,
                                                        "inbox_encryption_key": returnInboxEncKey,
                                                        "inbox_public_key": "",
                                                        "inbox_private_key": ""
                                                    ]

                                                    let stateJson = self.buildEncryptionStateJson(
                                                        state: result.ratchetState,
                                                        conversationId: initConversationId,
                                                        inboxId: convInboxAddress,
                                                        sentAccept: false,
                                                        sendingInbox: sendingInbox,
                                                        tag: convInboxAddress
                                                    )

                                                    self.writeEncryptionState(
                                                        conversationId: initConversationId,
                                                        inboxId: convInboxAddress,
                                                        stateJson: stateJson,
                                                        updateLatest: true
                                                    )

                                                    // Ephemeral cache
                                                    self.writeEphemeralCache(
                                                        conversationId: initConversationId,
                                                        ephemeralKey: ephemeralPubKeyHex,
                                                        stateJson: stateJson
                                                    )

                                                    // Inbox mappings
                                                    self.writeInboxMapping(inboxId: convInboxAddress, conversationId: initConversationId)
                                                    self.writeInboxMapping(inboxId: returnInboxAddr, conversationId: initConversationId)

                                                    // Conversation inbox keypair
                                                    let keypairDict: [String: Any] = [
                                                        "conversationId": initConversationId,
                                                        "inboxAddress": convInboxAddress,
                                                        "encryptionPublicKey": convEncPub.map { Int($0) },
                                                        "encryptionPrivateKey": convEncPriv.map { Int($0) },
                                                        "signingPublicKey": convSignPub.map { Int($0) },
                                                        "signingPrivateKey": convSignPriv.map { Int($0) }
                                                    ]
                                                    self.writeConversationInboxKeypair(keypairDict)

                                                    newConversationInbox = convInboxAddress
                                                }
                                            } catch {
                                                // Decryption failed - likely for another device
                                            }
                                        }
                                    }
                                }
                            }

                            // If we used existing state, update it in MMKV
                            if usedExistingState, let rState = finalRatchetState, let iid = existingInboxId {
                                // Read existing state to preserve sendingInbox and other fields
                                if let existingJson = self.readEncryptionState(initConversationId, iid),
                                   let existingData = existingJson.data(using: .utf8),
                                   var existingObj = try? JSONSerialization.jsonObject(with: existingData) as? [String: Any] {
                                    existingObj["state"] = self.sanitizeForJSON(rState)
                                    existingObj["timestamp"] = Int(Date().timeIntervalSince1970 * 1000)
                                    if let updatedData = try? JSONSerialization.data(withJSONObject: existingObj),
                                       let updatedJson = String(data: updatedData, encoding: .utf8) {
                                        self.writeEncryptionState(
                                            conversationId: initConversationId,
                                            inboxId: iid,
                                            stateJson: updatedJson,
                                            updateLatest: false
                                        )
                                        // Also update ephemeral cache
                                        self.writeEphemeralCache(
                                            conversationId: initConversationId,
                                            ephemeralKey: ephemeralPubKeyHex,
                                            stateJson: updatedJson
                                        )
                                    }
                                }

                                // Get conversation inbox for return
                                let convKeypair = self.readConversationInboxKeypair(initConversationId)
                                newConversationInbox = convKeypair?["inboxAddress"] as? String
                            }

                            if let msg = decryptedMessage {
                                var resultDict: [String: Any] = [
                                    "status": "init_decrypted",
                                    "decrypted_message": self.sanitizeForJSON(msg),
                                    "conversation_id": initConversationId,
                                    "timestamp": timestamp
                                ]
                                if displayName != nil || userIcon != nil {
                                    var profile: [String: String] = [:]
                                    if let dn = displayName { profile["display_name"] = dn }
                                    if let ui = userIcon { profile["user_icon"] = ui }
                                    resultDict["user_profile"] = profile
                                }
                                var returnInbox: [String: String] = [
                                    "inbox_address": returnInboxAddr,
                                    "inbox_encryption_key": returnInboxEncKey
                                ]
                                if !returnInboxPubKey.isEmpty { returnInbox["inbox_public_key"] = returnInboxPubKey }
                                resultDict["return_inbox"] = returnInbox
                                messageResults.append(resultDict)
                            } else {
                                // Decryption failed - likely for another device
                                messageResults.append([
                                    "status": "decrypt_failed",
                                    "timestamp": timestamp
                                ])
                            }
                            continue
                        }

                        // ====== SUBSEQUENT DR MESSAGE (device inbox) ======
                        if messageType == "device_inbox" && isDoubleRatchetEnvelope {
                            guard let sealedData = encryptedContent.data(using: .utf8),
                                  let sealed = try? JSONSerialization.jsonObject(with: sealedData) as? [String: Any],
                                  let envelopeStr = sealed["envelope"] as? String else {
                                messageResults.append(["status": "decrypt_failed", "timestamp": timestamp])
                                continue
                            }

                            var decrypted = false
                            for i in 0..<stateMap.count {
                                let entry = stateMap[i]
                                if entry.state.isEmpty { continue }

                                let stateAndEnvelope = DoubleRatchetStateAndEnvelope(
                                    ratchetState: entry.state,
                                    envelope: envelopeStr
                                )
                                do {
                                    let result = try doubleRatchetDecrypt(ratchetStateAndEnvelope: stateAndEnvelope)
                                    let messageStr = String(bytes: result.message.map { $0 }, encoding: .utf8) ?? ""
                                    if messageStr.starts(with: "Decryption failed:") || messageStr.starts(with: "invalid") || messageStr.contains("aead::Error") {
                                        continue
                                    }
                                    if result.message.isEmpty { continue }

                                    stateMap[i] = (entry.conversationId, entry.inboxId, result.ratchetState)

                                    // Write updated DR state to MMKV
                                    if let existingJson = self.readEncryptionState(entry.conversationId, entry.inboxId),
                                       let existingData = existingJson.data(using: .utf8),
                                       var existingObj = try? JSONSerialization.jsonObject(with: existingData) as? [String: Any] {
                                        existingObj["state"] = self.sanitizeForJSON(result.ratchetState)
                                        existingObj["timestamp"] = Int(Date().timeIntervalSince1970 * 1000)
                                        if let updatedData = try? JSONSerialization.data(withJSONObject: existingObj),
                                           let updatedJson = String(data: updatedData, encoding: .utf8) {
                                            self.writeEncryptionState(
                                                conversationId: entry.conversationId,
                                                inboxId: entry.inboxId,
                                                stateJson: updatedJson,
                                                updateLatest: false
                                            )
                                        }
                                    }

                                    let decryptedText = String(data: Data(result.message), encoding: .utf8) ?? ""
                                    messageResults.append([
                                        "status": "decrypted",
                                        "decrypted_message": self.sanitizeForJSON(decryptedText),
                                        "used_state_inbox_id": entry.inboxId,
                                        "conversation_id": entry.conversationId,
                                        "timestamp": timestamp
                                    ])
                                    decrypted = true
                                    break
                                } catch {
                                    continue
                                }
                            }

                            if !decrypted {
                                messageResults.append(["status": "decrypt_failed", "timestamp": timestamp])
                            }
                        } else if messageType == "conversation_inbox" && isDoubleRatchetEnvelope {
                            // Conversation inbox: unseal first, then decrypt
                            guard let convPrivKey = group["conversation_inbox_private_key"] as? [Int],
                                  !convPrivKey.isEmpty else {
                                messageResults.append(["status": "unseal_failed", "timestamp": timestamp])
                                continue
                            }

                            guard let sealedData = encryptedContent.data(using: .utf8),
                                  let sealed = try? JSONSerialization.jsonObject(with: sealedData) as? [String: Any],
                                  let ephPubKeyHex = sealed["ephemeral_public_key"] as? String,
                                  let sealedEnvelope = sealed["envelope"] as? String else {
                                messageResults.append(["status": "unseal_failed", "timestamp": timestamp])
                                continue
                            }

                            let ephPubKey = self.hexStringToBytes(ephPubKeyHex)
                            guard let envelopeData = sealedEnvelope.data(using: .utf8),
                                  let envelopeJson = try? JSONSerialization.jsonObject(with: envelopeData) as? [String: Any] else {
                                messageResults.append(["status": "unseal_failed", "timestamp": timestamp])
                                continue
                            }

                            let unsealInput: [String: Any] = [
                                "inbox_private_key": self.intArrayToBase64(convPrivKey),
                                "ephemeral_public_key": self.bytesToBase64(ephPubKey),
                                "ciphertext": envelopeJson
                            ]

                            guard let unsealInputData = try? JSONSerialization.data(withJSONObject: unsealInput),
                                  let unsealInputStr = String(data: unsealInputData, encoding: .utf8) else {
                                messageResults.append(["status": "unseal_failed", "timestamp": timestamp])
                                continue
                            }

                            let unsealResult = decryptInboxMessage(input: unsealInputStr)
                            // Base64-encoded bytes from the Rust binding.
                            guard let unsealedBytesData = self.decryptInboxBytes(unsealResult),
                                  let unsealedStr = String(data: unsealedBytesData, encoding: .utf8) else {
                                messageResults.append(["status": "unseal_failed", "timestamp": timestamp])
                                continue
                            }

                            if let unsealedData = unsealedStr.data(using: .utf8),
                               let unsealedJson = try? JSONSerialization.jsonObject(with: unsealedData) as? [String: Any],
                               unsealedJson["protocol_identifier"] != nil {
                                var decrypted = false
                                for i in 0..<stateMap.count {
                                    let entry = stateMap[i]
                                    if entry.state.isEmpty { continue }

                                    let stateAndEnvelope = DoubleRatchetStateAndEnvelope(
                                        ratchetState: entry.state,
                                        envelope: unsealedStr
                                    )
                                    do {
                                        let result = try doubleRatchetDecrypt(ratchetStateAndEnvelope: stateAndEnvelope)
                                        let messageStr = String(bytes: result.message.map { $0 }, encoding: .utf8) ?? ""
                                        if messageStr.starts(with: "Decryption failed:") || messageStr.contains("aead::Error") || result.message.isEmpty {
                                            continue
                                        }

                                        stateMap[i] = (entry.conversationId, entry.inboxId, result.ratchetState)

                                        // Write updated DR state to MMKV
                                        if let existingJson = self.readEncryptionState(entry.conversationId, entry.inboxId),
                                           let existingData = existingJson.data(using: .utf8),
                                           var existingObj = try? JSONSerialization.jsonObject(with: existingData) as? [String: Any] {
                                            existingObj["state"] = self.sanitizeForJSON(result.ratchetState)
                                            existingObj["timestamp"] = Int(Date().timeIntervalSince1970 * 1000)
                                            if let updatedData = try? JSONSerialization.data(withJSONObject: existingObj),
                                               let updatedJson = String(data: updatedData, encoding: .utf8) {
                                                self.writeEncryptionState(
                                                    conversationId: entry.conversationId,
                                                    inboxId: entry.inboxId,
                                                    stateJson: updatedJson,
                                                    updateLatest: false
                                                )
                                            }
                                        }

                                        let decryptedText = String(data: Data(result.message), encoding: .utf8) ?? ""
                                        messageResults.append([
                                            "status": "decrypted",
                                            "decrypted_message": self.sanitizeForJSON(decryptedText),
                                            "used_state_inbox_id": entry.inboxId,
                                            "conversation_id": entry.conversationId,
                                            "timestamp": timestamp
                                        ])
                                        decrypted = true
                                        break
                                    } catch {
                                        continue
                                    }
                                }

                                if !decrypted {
                                    messageResults.append(["status": "decrypt_failed", "timestamp": timestamp])
                                }
                            } else {
                                messageResults.append([
                                    "status": "unseal_failed",
                                    "decrypted_message": self.sanitizeForJSON(unsealedStr),
                                    "timestamp": timestamp
                                ])
                            }
                        } else {
                            messageResults.append(["status": "no_state", "timestamp": timestamp])
                        }
                    }

                    var groupResultDict: [String: Any] = [
                        "conversation_id": conversationId,
                        "messages": messageResults
                    ]
                    if let nci = newConversationInbox {
                        groupResultDict["new_conversation_inbox"] = nci
                    }
                    dmResults.append(groupResultDict)
                }

                // Build output
                let output: [String: Any] = [
                    "space_results": spaceResults,
                    "dm_results": dmResults
                ]

                if let outputData = try? JSONSerialization.data(withJSONObject: output),
                   let outputString = String(data: outputData, encoding: .utf8) {
                    promise.resolve(outputString)
                } else {
                    promise.resolve("{\"space_results\":[],\"dm_results\":[]}")
                }
            }
        }

        // Triple Ratchet Resize - generates invite evals pool
        AsyncFunction("tripleRatchetResize") { (input: String, promise: Promise) in
            self.cryptoQueue.async {
                guard let data = input.data(using: .utf8),
                      let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                      let ratchetState = json["ratchet_state"] as? String,
                      let other = json["other"] as? String,
                      let id = json["id"] as? Int,
                      let total = json["total"] as? Int else {
                    promise.resolve("[[]]")
                    return
                }
                guard !ratchetState.isEmpty, !other.isEmpty, total > 0 else {
                    promise.resolve("[[]]")
                    return
                }
                let result = tripleRatchetResize(
                    ratchetState: ratchetState,
                    other: other,
                    id: UInt64(id),
                    total: UInt64(total)
                )
                // Emit each inner byte array as a base64 string —
                // matches Kotlin + the new wire format used by
                // serializeStateAndMessage.
                let b64Result: [String] = result.map { Data($0).base64EncodedString() }
                if let jsonData = try? JSONSerialization.data(withJSONObject: b64Result),
                   let jsonString = String(data: jsonData, encoding: .utf8) {
                    promise.resolve(jsonString)
                } else {
                    promise.resolve("[]")
                }
            }
        }
    }

    // MARK: - Error Handling Helpers

    // Convert CryptoError enum to a human-readable message
    private func cryptoErrorMessage(_ error: CryptoError) -> String {
        switch error {
        case .InvalidState(message: let message):
            return "Invalid state: \(message)"
        case .InvalidEnvelope(message: let message):
            return "Invalid envelope: \(message)"
        case .DecryptionFailed(message: let message):
            return "Decryption failed: \(message)"
        case .EncryptionFailed(message: let message):
            return "Encryption failed: \(message)"
        case .SerializationFailed(message: let message):
            return "Serialization failed: \(message)"
        case .InvalidInput(message: let message):
            return "Invalid input: \(message)"
        }
    }

    // MARK: - Serialization Helpers

    // Sanitize a string to ensure it's valid for JSON serialization
    // This replaces any invalid UTF-8 sequences and control characters
    /// Decode the Rust binding's decrypt return into raw bytes. The
    /// Rust source returns base64 (see
    /// monorepo/crates/channel — `decrypt_inbox_message` calls
    /// `BASE64_STANDARD.encode`). Errors come back as plain-text
    /// strings which aren't valid base64; this returns nil and the
    /// caller treats it as `unseal_failed`.
    private func decryptInboxBytes(_ rustResult: String) -> Data? {
        Data(base64Encoded: rustResult)
    }

    /// Base64-encode bytes for Rust input. Same wire format Rust now
    /// accepts on byte fields (see deserialize_bytes_b64_or_array in
    /// the channel crate). Replaces `[Int]` / `.map { Int($0) }`
    /// arrays that used to ship as JSON int arrays.
    private func bytesToBase64(_ bytes: [UInt8]) -> String {
        Data(bytes).base64EncodedString()
    }
    private func intArrayToBase64(_ ints: [Int]) -> String {
        var bytes = [UInt8]()
        bytes.reserveCapacity(ints.count)
        for n in ints { bytes.append(UInt8(truncatingIfNeeded: n)) }
        return Data(bytes).base64EncodedString()
    }

    private func sanitizeForJSON(_ input: String) -> String {
        // First check if it's already valid
        if let _ = input.data(using: .utf8) {
            // Remove any control characters that might cause issues
            var result = ""
            for scalar in input.unicodeScalars {
                // Allow printable characters, tab, newline, carriage return
                if scalar.value >= 0x20 || scalar.value == 0x09 || scalar.value == 0x0A || scalar.value == 0x0D {
                    result.append(Character(scalar))
                }
            }
            return result
        }
        // If we get here, something is very wrong - return empty string
        return ""
    }

    private func serializeStateAndEnvelope(ratchetState: String, envelope: String) -> String {
        let safeRatchetState = sanitizeForJSON(ratchetState)
        let safeEnvelope = sanitizeForJSON(envelope)
        let resultDict: [String: Any] = [
            "ratchet_state": safeRatchetState,
            "envelope": safeEnvelope
        ]
        if let jsonData = try? JSONSerialization.data(withJSONObject: resultDict),
           let jsonString = String(data: jsonData, encoding: .utf8) {
            return jsonString
        }
        return "{\"ratchet_state\":\"\",\"envelope\":\"\"}"
    }

    private func serializeStateAndMessage(ratchetState: String, message: [UInt8]) -> String {
        // Emit the message bytes as a base64 string instead of a JSON
        // int array. JS side base64-decodes. Matches the new Kotlin
        // wire format + the Rust decrypt return format. Eliminates
        // the per-byte `Int($0)` allocation + the proportional JS-side
        // JSON.parse cost.
        let safeRatchetState = sanitizeForJSON(ratchetState)
        let b64 = Data(message).base64EncodedString()
        let resultDict: [String: Any] = [
            "ratchet_state": safeRatchetState,
            "message": b64,
        ]
        if let jsonData = try? JSONSerialization.data(withJSONObject: resultDict),
           let jsonString = String(data: jsonData, encoding: .utf8) {
            return jsonString
        }
        return "{\"ratchet_state\":\"\",\"message\":\"\"}"
    }

    // Convert hex string to byte array
    private func hexStringToBytes(_ hex: String) -> [UInt8] {
        var bytes: [UInt8] = []
        var index = hex.startIndex
        while index < hex.endIndex {
            let nextIndex = hex.index(index, offsetBy: 2, limitedBy: hex.endIndex) ?? hex.endIndex
            if let byte = UInt8(hex[index..<nextIndex], radix: 16) {
                bytes.append(byte)
            }
            index = nextIndex
        }
        return bytes
    }

    // Helper to parse TripleRatchetStateAndMetadata from JSON
    private func parseTripleRatchetStateAndMetadata(_ input: String) -> TripleRatchetStateAndMetadata? {
        guard let data = input.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let ratchetState = json["ratchet_state"] as? String,
              let metadata = json["metadata"] as? [String: String] else {
            return nil
        }
        return TripleRatchetStateAndMetadata(ratchetState: ratchetState, metadata: metadata)
    }

    // Helper to serialize TripleRatchetStateAndMetadata to JSON
    private func serializeTripleRatchetStateAndMetadata(_ state: TripleRatchetStateAndMetadata) -> String {
        let safeRatchetState = sanitizeForJSON(state.ratchetState)
        var safeMetadata: [String: String] = [:]
        for (key, value) in state.metadata {
            safeMetadata[sanitizeForJSON(key)] = sanitizeForJSON(value)
        }
        let resultDict: [String: Any] = [
            "ratchet_state": safeRatchetState,
            "metadata": safeMetadata
        ]
        if let jsonData = try? JSONSerialization.data(withJSONObject: resultDict),
           let jsonString = String(data: jsonData, encoding: .utf8) {
            return jsonString
        }
        return "{\"ratchet_state\":\"\",\"metadata\":{}}"
    }

    // MARK: - MMKV Storage Helpers

    private static let encryptionMMKVId = "quorum-encryption"
    private static let appGroupId = "group.com.quilibrium.quorum-mobile.shared"

    /// Lazily cached MMKV instance for encryption state storage.
    ///
    /// Ensures MMKV is initialized before asking for an instance — this
    /// native module can be hit (via an incoming message) before any JS
    /// MMKV exists, which would otherwise crash with
    /// "MMKV not initialized properly".
    private lazy var encryptionMMKV: MMKV? = {
        QuorumCryptoModule.ensureMMKVInitialized()
        return MMKV(mmapID: QuorumCryptoModule.encryptionMMKVId)
    }()

    /// App Group mirror of the encryption MMKV. Same mmapID, different
    /// rootPath — points at the shared App Group container so the
    /// iOS Notification Service Extension can read TR/DR state and
    /// decrypt incoming pushes locally to decide whether to suppress
    /// notifications for control-type messages (update-profile,
    /// edit-message, remove-message).
    ///
    /// Strictly additive: every write to `encryptionMMKV` is mirrored
    /// here. The sandbox MMKV remains the source of truth for the
    /// main app; the App Group mirror is read-only from the NSE's
    /// perspective. Returns nil if the App Group entitlement isn't
    /// configured, in which case mirroring is a no-op and the NSE
    /// falls back to its catalog-rewrite-only behavior.
    private lazy var encryptionMMKVAppGroupMirror: MMKV? = {
        QuorumCryptoModule.ensureMMKVInitialized()
        guard let containerURL = FileManager.default
            .containerURL(forSecurityApplicationGroupIdentifier: QuorumCryptoModule.appGroupId)
        else { return nil }
        let mirrorRoot = containerURL.appendingPathComponent("mmkv").path
        // Best-effort create — MMKV(rootPath:) doesn't ensure the
        // directory exists.
        try? FileManager.default.createDirectory(
            atPath: mirrorRoot,
            withIntermediateDirectories: true,
            attributes: nil
        )
        return MMKV(mmapID: QuorumCryptoModule.encryptionMMKVId, cryptKey: nil, rootPath: mirrorRoot)
    }()

    /// Read a string from the encryption MMKV instance
    private func mmkvGetString(_ key: String) -> String? {
        return encryptionMMKV?.string(forKey: key)
    }

    /// Write a string to the encryption MMKV instance.
    /// Mirrors the write into the App Group MMKV so the NSE can read it.
    private func mmkvSetString(_ value: String, forKey key: String) {
        encryptionMMKV?.set(value, forKey: key)
        encryptionMMKVAppGroupMirror?.set(value, forKey: key)
    }

    /// Remove a key from the encryption MMKV instance.
    /// Mirrors the removal into the App Group MMKV.
    private func mmkvRemoveKey(_ key: String) {
        encryptionMMKV?.removeValue(forKey: key)
        encryptionMMKVAppGroupMirror?.removeValue(forKey: key)
    }

    // MARK: - Encryption State Storage Key Patterns

    private func encStateKey(_ conversationId: String, _ inboxId: String) -> String {
        return "enc_state:\(conversationId):\(inboxId)"
    }

    private func encStateFallbackKey(_ conversationId: String, _ inboxId: String) -> String {
        return "enc_state:\(conversationId):\(inboxId):fallback"
    }

    private func ephemeralCacheKey(_ conversationId: String, _ ephemeralKey: String) -> String {
        return "ephemeral:\(conversationId):\(ephemeralKey)"
    }

    private func inboxMappingKey(_ inboxId: String) -> String {
        return "inbox_map:\(inboxId)"
    }

    private func latestStateKey(_ conversationId: String) -> String {
        return "latest:\(conversationId)"
    }

    private func convInboxesKey(_ conversationId: String) -> String {
        return "conv_inboxes:\(conversationId)"
    }

    private func convInboxKeyKey(_ conversationId: String) -> String {
        return "conv_inbox_key:\(conversationId)"
    }

    // MARK: - MMKV Read Helpers

    /// Read encryption state for a given conversation + inbox
    private func readEncryptionState(_ conversationId: String, _ inboxId: String) -> String? {
        return mmkvGetString(encStateKey(conversationId, inboxId))
    }

    /// Read all encryption states for a conversation by scanning conv_inboxes list
    private func readAllEncryptionStates(_ conversationId: String) -> [(inboxId: String, state: String)] {
        guard let inboxesJson = mmkvGetString(convInboxesKey(conversationId)),
              let data = inboxesJson.data(using: .utf8),
              let inboxIds = try? JSONSerialization.jsonObject(with: data) as? [String] else {
            // Fallback: scan all keys matching enc_state:{conversationId}:*
            return scanEncryptionStates(conversationId)
        }
        var results: [(inboxId: String, state: String)] = []
        for iid in inboxIds {
            if let state = mmkvGetString(encStateKey(conversationId, iid)) {
                results.append((inboxId: iid, state: state))
            }
        }
        return results
    }

    /// Fallback scan for encryption states (slower, iterates keys)
    private func scanEncryptionStates(_ conversationId: String) -> [(inboxId: String, state: String)] {
        let prefix = "enc_state:\(conversationId):"
        let allKeys = encryptionMMKV?.allKeys() as? [String] ?? []
        var results: [(inboxId: String, state: String)] = []
        for key in allKeys {
            if key.hasPrefix(prefix) && !key.hasSuffix(":fallback") {
                let inboxId = String(key.dropFirst(prefix.count))
                if let state = mmkvGetString(key) {
                    results.append((inboxId: inboxId, state: state))
                }
            }
        }
        return results
    }

    /// Read ephemeral cache state
    private func readEphemeralCache(_ conversationId: String, _ ephemeralKey: String) -> String? {
        return mmkvGetString(ephemeralCacheKey(conversationId, ephemeralKey))
    }

    /// Read latest state for a conversation
    private func readLatestState(_ conversationId: String) -> (conversationId: String, inboxId: String, timestamp: Int)? {
        guard let json = mmkvGetString(latestStateKey(conversationId)),
              let data = json.data(using: .utf8),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let cid = obj["conversationId"] as? String,
              let iid = obj["inboxId"] as? String else {
            return nil
        }
        let ts = obj["timestamp"] as? Int ?? 0
        return (conversationId: cid, inboxId: iid, timestamp: ts)
    }

    /// Read conversation inbox keypair
    private func readConversationInboxKeypair(_ conversationId: String) -> [String: Any]? {
        guard let json = mmkvGetString(convInboxKeyKey(conversationId)),
              let data = json.data(using: .utf8),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return nil
        }
        return obj
    }

    // MARK: - MMKV Write Helpers

    /// Write encryption state
    private func writeEncryptionState(conversationId: String, inboxId: String, stateJson: String, updateLatest: Bool) {
        mmkvSetString(stateJson, forKey: encStateKey(conversationId, inboxId))

        // Update conv_inboxes list
        addToConvInboxes(conversationId: conversationId, inboxId: inboxId)

        // Update latest state
        if updateLatest {
            let latestJson = "{\"conversationId\":\"\(conversationId)\",\"inboxId\":\"\(inboxId)\",\"timestamp\":\(Int(Date().timeIntervalSince1970 * 1000))}"
            mmkvSetString(latestJson, forKey: latestStateKey(conversationId))
        }
    }

    /// Write ephemeral cache state
    private func writeEphemeralCache(conversationId: String, ephemeralKey: String, stateJson: String) {
        mmkvSetString(stateJson, forKey: ephemeralCacheKey(conversationId, ephemeralKey))
    }

    /// Write inbox mapping
    private func writeInboxMapping(inboxId: String, conversationId: String) {
        let json = "{\"inboxId\":\"\(inboxId)\",\"conversationId\":\"\(conversationId)\"}"
        mmkvSetString(json, forKey: inboxMappingKey(inboxId))
    }

    /// Write conversation inbox keypair
    private func writeConversationInboxKeypair(_ keypair: [String: Any]) {
        guard let conversationId = keypair["conversationId"] as? String,
              let jsonData = try? JSONSerialization.data(withJSONObject: keypair),
              let jsonString = String(data: jsonData, encoding: .utf8) else {
            return
        }
        mmkvSetString(jsonString, forKey: convInboxKeyKey(conversationId))
    }

    /// Add inbox ID to the conv_inboxes list for a conversation
    private func addToConvInboxes(conversationId: String, inboxId: String) {
        let key = convInboxesKey(conversationId)
        var inboxIds: [String] = []
        if let existing = mmkvGetString(key),
           let data = existing.data(using: .utf8),
           let arr = try? JSONSerialization.jsonObject(with: data) as? [String] {
            inboxIds = arr
        }
        if !inboxIds.contains(inboxId) {
            inboxIds.append(inboxId)
            if let data = try? JSONSerialization.data(withJSONObject: inboxIds),
               let json = String(data: data, encoding: .utf8) {
                mmkvSetString(json, forKey: key)
            }
        }
    }

    // MARK: - Base58 Encoding

    private static let base58Alphabet = Array("123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz")

    /// Base58 encode a byte array
    private func base58Encode(_ bytes: [UInt8]) -> String {
        var digits: [UInt8] = [0]
        for byte in bytes {
            var carry = Int(byte)
            for j in 0..<digits.count {
                carry += Int(digits[j]) << 8
                digits[j] = UInt8(carry % 58)
                carry /= 58
            }
            while carry > 0 {
                digits.append(UInt8(carry % 58))
                carry /= 58
            }
        }
        // Leading zeros
        var output = ""
        for byte in bytes {
            if byte != 0 { break }
            output.append(QuorumCryptoModule.base58Alphabet[0])
        }
        // Convert digits in reverse
        for digit in digits.reversed() {
            output.append(QuorumCryptoModule.base58Alphabet[Int(digit)])
        }
        return output
    }

    // MARK: - Address Derivation

    /// Derive an address from an Ed448 public key
    /// 1. SHA-256 hash of the public key bytes
    /// 2. Multihash encode: [0x12, 0x20, ...hash_bytes] (SHA-256 = 0x12, length = 0x20)
    /// 3. Base58 encode the multihash bytes
    private func deriveAddress(_ publicKey: [UInt8]) -> String {
        // SHA-256 hash
        var sha256Hash = [UInt8](repeating: 0, count: Int(CC_SHA256_DIGEST_LENGTH))
        let data = Data(publicKey)
        _ = data.withUnsafeBytes { ptr in
            CC_SHA256(ptr.baseAddress, CC_LONG(data.count), &sha256Hash)
        }

        // Multihash encode: 0x12 = SHA-256 hash function code, 0x20 = 32 bytes length
        var multihash: [UInt8] = [0x12, 0x20]
        multihash.append(contentsOf: sha256Hash)

        // Base58 encode
        return base58Encode(multihash)
    }

    /// Build an EncryptionState JSON string for storage
    private func buildEncryptionStateJson(
        state: String,
        conversationId: String,
        inboxId: String,
        sentAccept: Bool,
        sendingInbox: [String: String]?,
        tag: String?,
        ephemeralPublicKey: String? = nil,
        ephemeralPrivateKey: String? = nil
    ) -> String {
        var dict: [String: Any] = [
            "state": sanitizeForJSON(state),
            "timestamp": Int(Date().timeIntervalSince1970 * 1000),
            "conversationId": conversationId,
            "inboxId": inboxId,
            "sentAccept": sentAccept
        ]
        if let si = sendingInbox {
            dict["sendingInbox"] = si
        }
        if let t = tag {
            dict["tag"] = t
        }
        if let epk = ephemeralPublicKey {
            dict["x3dhEphemeralPublicKey"] = epk
        }
        if let eprk = ephemeralPrivateKey {
            dict["x3dhEphemeralPrivateKey"] = eprk
        }
        if let data = try? JSONSerialization.data(withJSONObject: dict),
           let json = String(data: data, encoding: .utf8) {
            return json
        }
        return "{}"
    }
}
