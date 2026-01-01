import ExpoModulesCore

public class QuorumCryptoModule: Module {
    public func definition() -> ModuleDefinition {
        Name("QuorumCrypto")

        // Key Generation
        AsyncFunction("generateX448") { () -> String in
            return generateX448()
        }

        AsyncFunction("generateEd448") { () -> String in
            return generateEd448()
        }

        AsyncFunction("getPublicKeyX448") { (privateKey: String) -> String in
            return getPubkeyX448(key: privateKey)
        }

        AsyncFunction("getPublicKeyEd448") { (privateKey: String) -> String in
            return getPubkeyEd448(key: privateKey)
        }

        // Signing
        AsyncFunction("signEd448") { (privateKey: String, message: String) -> String in
            return signEd448(key: privateKey, message: message)
        }

        AsyncFunction("verifyEd448") { (publicKey: String, message: String, signature: String) -> String in
            return verifyEd448(publicKey: publicKey, message: message, signature: signature)
        }

        // Inbox Message Encryption
        AsyncFunction("encryptInboxMessage") { (input: String) -> String in
            return encryptInboxMessage(input: input)
        }

        AsyncFunction("decryptInboxMessage") { (input: String) -> String in
            return decryptInboxMessage(input: input)
        }

        // X3DH Key Agreement
        AsyncFunction("senderX3dh") { (input: String) -> String in
            // Parse JSON input and call uniffi function
            guard let data = input.data(using: .utf8),
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let sendingIdentityPrivateKey = json["sending_identity_private_key"] as? [Int],
                  let sendingEphemeralPrivateKey = json["sending_ephemeral_private_key"] as? [Int],
                  let receivingIdentityKey = json["receiving_identity_key"] as? [Int],
                  let receivingSignedPreKey = json["receiving_signed_pre_key"] as? [Int],
                  let sessionKeyLength = json["session_key_length"] as? Int else {
                return "invalid input"
            }
            return senderX3dh(
                sendingIdentityPrivateKey: sendingIdentityPrivateKey.map { UInt8($0) },
                sendingEphemeralPrivateKey: sendingEphemeralPrivateKey.map { UInt8($0) },
                receivingIdentityKey: receivingIdentityKey.map { UInt8($0) },
                receivingSignedPreKey: receivingSignedPreKey.map { UInt8($0) },
                sessionKeyLength: UInt64(sessionKeyLength)
            )
        }

        AsyncFunction("receiverX3dh") { (input: String) -> String in
            guard let data = input.data(using: .utf8),
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let sendingIdentityPrivateKey = json["sending_identity_private_key"] as? [Int],
                  let sendingSignedPrivateKey = json["sending_signed_private_key"] as? [Int],
                  let receivingIdentityKey = json["receiving_identity_key"] as? [Int],
                  let receivingEphemeralKey = json["receiving_ephemeral_key"] as? [Int],
                  let sessionKeyLength = json["session_key_length"] as? Int else {
                return "invalid input"
            }
            return receiverX3dh(
                sendingIdentityPrivateKey: sendingIdentityPrivateKey.map { UInt8($0) },
                sendingSignedPrivateKey: sendingSignedPrivateKey.map { UInt8($0) },
                receivingIdentityKey: receivingIdentityKey.map { UInt8($0) },
                receivingEphemeralKey: receivingEphemeralKey.map { UInt8($0) },
                sessionKeyLength: UInt64(sessionKeyLength)
            )
        }

        // Double Ratchet
        AsyncFunction("newDoubleRatchet") { (input: String) -> String in
            guard let data = input.data(using: .utf8),
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let sessionKey = json["session_key"] as? [Int],
                  let sendingHeaderKey = json["sending_header_key"] as? [Int],
                  let nextReceivingHeaderKey = json["next_receiving_header_key"] as? [Int],
                  let isSender = json["is_sender"] as? Bool,
                  let sendingEphemeralPrivateKey = json["sending_ephemeral_private_key"] as? [Int],
                  let receivingEphemeralKey = json["receiving_ephemeral_key"] as? [Int] else {
                return "invalid input"
            }
            return newDoubleRatchet(
                sessionKey: sessionKey.map { UInt8($0) },
                sendingHeaderKey: sendingHeaderKey.map { UInt8($0) },
                nextReceivingHeaderKey: nextReceivingHeaderKey.map { UInt8($0) },
                isSender: isSender,
                sendingEphemeralPrivateKey: sendingEphemeralPrivateKey.map { UInt8($0) },
                receivingEphemeralKey: receivingEphemeralKey.map { UInt8($0) }
            )
        }

        AsyncFunction("doubleRatchetEncrypt") { (input: String) -> String in
            guard let data = input.data(using: .utf8),
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let ratchetState = json["ratchet_state"] as? String,
                  let message = json["message"] as? [Int] else {
                return "{\"ratchet_state\":\"\",\"envelope\":\"invalid input\"}"
            }
            let stateAndMessage = DoubleRatchetStateAndMessage(
                ratchetState: ratchetState,
                message: message.map { UInt8($0) }
            )
            let result = doubleRatchetEncrypt(ratchetStateAndMessage: stateAndMessage)
            // Use proper JSON serialization to handle escaping
            let resultDict: [String: Any] = [
                "ratchet_state": result.ratchetState,
                "envelope": result.envelope
            ]
            if let jsonData = try? JSONSerialization.data(withJSONObject: resultDict),
               let jsonString = String(data: jsonData, encoding: .utf8) {
                return jsonString
            }
            return "{\"ratchet_state\":\"\",\"envelope\":\"\"}"
        }

        AsyncFunction("doubleRatchetDecrypt") { (input: String) -> String in
            guard let data = input.data(using: .utf8),
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let ratchetState = json["ratchet_state"] as? String,
                  let envelope = json["envelope"] as? String else {
                return "{\"ratchet_state\":\"\",\"message\":[]}"
            }
            let stateAndEnvelope = DoubleRatchetStateAndEnvelope(
                ratchetState: ratchetState,
                envelope: envelope
            )
            let result = doubleRatchetDecrypt(ratchetStateAndEnvelope: stateAndEnvelope)
            // Use proper JSON serialization to handle escaping
            let resultDict: [String: Any] = [
                "ratchet_state": result.ratchetState,
                "message": result.message.map { Int($0) }
            ]
            if let jsonData = try? JSONSerialization.data(withJSONObject: resultDict),
               let jsonString = String(data: jsonData, encoding: .utf8) {
                return jsonString
            }
            return "{\"ratchet_state\":\"\",\"message\":[]}"
        }

        // Triple Ratchet
        AsyncFunction("newTripleRatchet") { (input: String) -> String in
            guard let data = input.data(using: .utf8),
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let peers = json["peers"] as? [[Int]],
                  let peerKey = json["peer_key"] as? [Int],
                  let identityKey = json["identity_key"] as? [Int],
                  let signedPreKey = json["signed_pre_key"] as? [Int],
                  let threshold = json["threshold"] as? Int,
                  let asyncDkgRatchet = json["async_dkg_ratchet"] as? Bool else {
                return "{\"ratchet_state\":\"\",\"metadata\":{}}"
            }
            let result = newTripleRatchet(
                peers: peers.map { $0.map { UInt8($0) } },
                peerKey: peerKey.map { UInt8($0) },
                identityKey: identityKey.map { UInt8($0) },
                signedPreKey: signedPreKey.map { UInt8($0) },
                threshold: UInt64(threshold),
                asyncDkgRatchet: asyncDkgRatchet
            )
            return self.serializeTripleRatchetStateAndMetadata(result)
        }

        AsyncFunction("tripleRatchetInitRound1") { (input: String) -> String in
            guard let stateAndMetadata = self.parseTripleRatchetStateAndMetadata(input) else {
                return "{\"ratchet_state\":\"\",\"metadata\":{}}"
            }
            let result = tripleRatchetInitRound1(ratchetStateAndMetadata: stateAndMetadata)
            return self.serializeTripleRatchetStateAndMetadata(result)
        }

        AsyncFunction("tripleRatchetInitRound2") { (input: String) -> String in
            guard let stateAndMetadata = self.parseTripleRatchetStateAndMetadata(input) else {
                return "{\"ratchet_state\":\"\",\"metadata\":{}}"
            }
            let result = tripleRatchetInitRound2(ratchetStateAndMetadata: stateAndMetadata)
            return self.serializeTripleRatchetStateAndMetadata(result)
        }

        AsyncFunction("tripleRatchetInitRound3") { (input: String) -> String in
            guard let stateAndMetadata = self.parseTripleRatchetStateAndMetadata(input) else {
                return "{\"ratchet_state\":\"\",\"metadata\":{}}"
            }
            let result = tripleRatchetInitRound3(ratchetStateAndMetadata: stateAndMetadata)
            return self.serializeTripleRatchetStateAndMetadata(result)
        }

        AsyncFunction("tripleRatchetInitRound4") { (input: String) -> String in
            guard let stateAndMetadata = self.parseTripleRatchetStateAndMetadata(input) else {
                return "{\"ratchet_state\":\"\",\"metadata\":{}}"
            }
            let result = tripleRatchetInitRound4(ratchetStateAndMetadata: stateAndMetadata)
            return self.serializeTripleRatchetStateAndMetadata(result)
        }

        AsyncFunction("tripleRatchetEncrypt") { (input: String) -> String in
            guard let data = input.data(using: .utf8),
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let ratchetState = json["ratchet_state"] as? String,
                  let message = json["message"] as? [Int] else {
                return "{\"ratchet_state\":\"\",\"envelope\":\"\"}"
            }
            let stateAndMessage = TripleRatchetStateAndMessage(
                ratchetState: ratchetState,
                message: message.map { UInt8($0) }
            )
            let result = tripleRatchetEncrypt(ratchetStateAndMessage: stateAndMessage)
            // Use proper JSON serialization to handle escaping
            let resultDict: [String: Any] = [
                "ratchet_state": result.ratchetState,
                "envelope": result.envelope
            ]
            if let jsonData = try? JSONSerialization.data(withJSONObject: resultDict),
               let jsonString = String(data: jsonData, encoding: .utf8) {
                return jsonString
            }
            return "{\"ratchet_state\":\"\",\"envelope\":\"\"}"
        }

        AsyncFunction("tripleRatchetDecrypt") { (input: String) -> String in
            guard let data = input.data(using: .utf8),
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let ratchetState = json["ratchet_state"] as? String,
                  let envelope = json["envelope"] as? String else {
                return "{\"ratchet_state\":\"\",\"message\":[]}"
            }
            let stateAndEnvelope = TripleRatchetStateAndEnvelope(
                ratchetState: ratchetState,
                envelope: envelope
            )
            let result = tripleRatchetDecrypt(ratchetStateAndEnvelope: stateAndEnvelope)
            // Use proper JSON serialization to handle escaping
            let resultDict: [String: Any] = [
                "ratchet_state": result.ratchetState,
                "message": result.message.map { Int($0) }
            ]
            if let jsonData = try? JSONSerialization.data(withJSONObject: resultDict),
               let jsonString = String(data: jsonData, encoding: .utf8) {
                return jsonString
            }
            return "{\"ratchet_state\":\"\",\"message\":[]}"
        }

        // Triple Ratchet Resize - generates invite evals pool
        AsyncFunction("tripleRatchetResize") { (input: String) -> String in
            guard let data = input.data(using: .utf8),
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let ratchetState = json["ratchet_state"] as? String,
                  let other = json["other"] as? String,
                  let id = json["id"] as? Int,
                  let total = json["total"] as? Int else {
                return "[[]]"
            }
            let result = tripleRatchetResize(
                ratchetState: ratchetState,
                other: other,
                id: UInt64(id),
                total: UInt64(total)
            )
            // Convert [[UInt8]] to [[Int]] for JSON serialization
            let intResult = result.map { $0.map { Int($0) } }
            if let jsonData = try? JSONSerialization.data(withJSONObject: intResult),
               let jsonString = String(data: jsonData, encoding: .utf8) {
                return jsonString
            }
            return "[[]]"
        }
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
        // Use proper JSON serialization to handle escaping
        let resultDict: [String: Any] = [
            "ratchet_state": state.ratchetState,
            "metadata": state.metadata
        ]
        if let jsonData = try? JSONSerialization.data(withJSONObject: resultDict),
           let jsonString = String(data: jsonData, encoding: .utf8) {
            return jsonString
        }
        return "{\"ratchet_state\":\"\",\"metadata\":{}}"
    }
}
