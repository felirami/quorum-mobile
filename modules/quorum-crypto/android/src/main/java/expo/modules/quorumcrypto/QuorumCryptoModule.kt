package expo.modules.quorumcrypto

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import uniffi.channel.*
import org.json.JSONObject
import org.json.JSONArray

class QuorumCryptoModule : Module() {
    override fun definition() = ModuleDefinition {
        Name("QuorumCrypto")

        // Key Generation
        AsyncFunction("generateX448") {
            generateX448()
        }

        AsyncFunction("generateEd448") {
            generateEd448()
        }

        AsyncFunction("getPublicKeyX448") { privateKey: String ->
            getPubkeyX448(privateKey)
        }

        AsyncFunction("getPublicKeyEd448") { privateKey: String ->
            getPubkeyEd448(privateKey)
        }

        // Signing
        AsyncFunction("signEd448") { privateKey: String, message: String ->
            signEd448(privateKey, message)
        }

        AsyncFunction("verifyEd448") { publicKey: String, message: String, signature: String ->
            verifyEd448(publicKey, message, signature)
        }

        // Inbox Message Encryption
        AsyncFunction("encryptInboxMessage") { input: String ->
            encryptInboxMessage(input)
        }

        AsyncFunction("decryptInboxMessage") { input: String ->
            decryptInboxMessage(input)
        }

        // X3DH Key Agreement
        AsyncFunction("senderX3dh") { input: String ->
            val json = JSONObject(input)
            val sendingIdentityPrivateKey = jsonArrayToUByteList(json.getJSONArray("sending_identity_private_key"))
            val sendingEphemeralPrivateKey = jsonArrayToUByteList(json.getJSONArray("sending_ephemeral_private_key"))
            val receivingIdentityKey = jsonArrayToUByteList(json.getJSONArray("receiving_identity_key"))
            val receivingSignedPreKey = jsonArrayToUByteList(json.getJSONArray("receiving_signed_pre_key"))
            val sessionKeyLength = json.getLong("session_key_length").toULong()

            senderX3dh(
                sendingIdentityPrivateKey,
                sendingEphemeralPrivateKey,
                receivingIdentityKey,
                receivingSignedPreKey,
                sessionKeyLength
            )
        }

        AsyncFunction("receiverX3dh") { input: String ->
            val json = JSONObject(input)
            val sendingIdentityPrivateKey = jsonArrayToUByteList(json.getJSONArray("sending_identity_private_key"))
            val sendingSignedPrivateKey = jsonArrayToUByteList(json.getJSONArray("sending_signed_private_key"))
            val receivingIdentityKey = jsonArrayToUByteList(json.getJSONArray("receiving_identity_key"))
            val receivingEphemeralKey = jsonArrayToUByteList(json.getJSONArray("receiving_ephemeral_key"))
            val sessionKeyLength = json.getLong("session_key_length").toULong()

            receiverX3dh(
                sendingIdentityPrivateKey,
                sendingSignedPrivateKey,
                receivingIdentityKey,
                receivingEphemeralKey,
                sessionKeyLength
            )
        }

        // Double Ratchet
        AsyncFunction("newDoubleRatchet") { input: String ->
            val json = JSONObject(input)
            val sessionKey = jsonArrayToUByteList(json.getJSONArray("session_key"))
            val sendingHeaderKey = jsonArrayToUByteList(json.getJSONArray("sending_header_key"))
            val nextReceivingHeaderKey = jsonArrayToUByteList(json.getJSONArray("next_receiving_header_key"))
            val isSender = json.getBoolean("is_sender")
            val sendingEphemeralPrivateKey = jsonArrayToUByteList(json.getJSONArray("sending_ephemeral_private_key"))
            val receivingEphemeralKey = jsonArrayToUByteList(json.getJSONArray("receiving_ephemeral_key"))

            newDoubleRatchet(
                sessionKey,
                sendingHeaderKey,
                nextReceivingHeaderKey,
                isSender,
                sendingEphemeralPrivateKey,
                receivingEphemeralKey
            )
        }

        AsyncFunction("doubleRatchetEncrypt") { input: String ->
            val json = JSONObject(input)
            val ratchetState = json.getString("ratchet_state")
            val message = jsonArrayToUByteList(json.getJSONArray("message"))

            val stateAndMessage = DoubleRatchetStateAndMessage(ratchetState, message)
            val result = doubleRatchetEncrypt(stateAndMessage)

            JSONObject().apply {
                put("ratchet_state", result.ratchetState)
                put("envelope", result.envelope)
            }.toString()
        }

        AsyncFunction("doubleRatchetDecrypt") { input: String ->
            val json = JSONObject(input)
            val ratchetState = json.getString("ratchet_state")
            val envelope = json.getString("envelope")

            val stateAndEnvelope = DoubleRatchetStateAndEnvelope(ratchetState, envelope)
            val result = doubleRatchetDecrypt(stateAndEnvelope)

            JSONObject().apply {
                put("ratchet_state", result.ratchetState)
                put("message", ubyteListToJsonArray(result.message))
            }.toString()
        }

        // Triple Ratchet
        AsyncFunction("newTripleRatchet") { input: String ->
            val json = JSONObject(input)
            val peersArray = json.getJSONArray("peers")
            val peers = mutableListOf<List<UByte>>()
            for (i in 0 until peersArray.length()) {
                peers.add(jsonArrayToUByteList(peersArray.getJSONArray(i)))
            }
            val peerKey = jsonArrayToUByteList(json.getJSONArray("peer_key"))
            val identityKey = jsonArrayToUByteList(json.getJSONArray("identity_key"))
            val signedPreKey = jsonArrayToUByteList(json.getJSONArray("signed_pre_key"))
            val threshold = json.getLong("threshold").toULong()
            val asyncDkgRatchet = json.getBoolean("async_dkg_ratchet")

            val result = newTripleRatchet(peers, peerKey, identityKey, signedPreKey, threshold, asyncDkgRatchet)
            serializeTripleRatchetStateAndMetadata(result)
        }

        AsyncFunction("tripleRatchetInitRound1") { input: String ->
            val stateAndMetadata = parseTripleRatchetStateAndMetadata(input)
            val result = tripleRatchetInitRound1(stateAndMetadata)
            serializeTripleRatchetStateAndMetadata(result)
        }

        AsyncFunction("tripleRatchetInitRound2") { input: String ->
            val stateAndMetadata = parseTripleRatchetStateAndMetadata(input)
            val result = tripleRatchetInitRound2(stateAndMetadata)
            serializeTripleRatchetStateAndMetadata(result)
        }

        AsyncFunction("tripleRatchetInitRound3") { input: String ->
            val stateAndMetadata = parseTripleRatchetStateAndMetadata(input)
            val result = tripleRatchetInitRound3(stateAndMetadata)
            serializeTripleRatchetStateAndMetadata(result)
        }

        AsyncFunction("tripleRatchetInitRound4") { input: String ->
            val stateAndMetadata = parseTripleRatchetStateAndMetadata(input)
            val result = tripleRatchetInitRound4(stateAndMetadata)
            serializeTripleRatchetStateAndMetadata(result)
        }

        AsyncFunction("tripleRatchetEncrypt") { input: String ->
            val json = JSONObject(input)
            val ratchetState = json.getString("ratchet_state")
            val message = jsonArrayToUByteList(json.getJSONArray("message"))

            val stateAndMessage = TripleRatchetStateAndMessage(ratchetState, message)
            val result = tripleRatchetEncrypt(stateAndMessage)

            JSONObject().apply {
                put("ratchet_state", result.ratchetState)
                put("envelope", result.envelope)
            }.toString()
        }

        AsyncFunction("tripleRatchetDecrypt") { input: String ->
            val json = JSONObject(input)
            val ratchetState = json.getString("ratchet_state")
            val envelope = json.getString("envelope")

            val stateAndEnvelope = TripleRatchetStateAndEnvelope(ratchetState, envelope)
            val result = tripleRatchetDecrypt(stateAndEnvelope)

            JSONObject().apply {
                put("ratchet_state", result.ratchetState)
                put("message", ubyteListToJsonArray(result.message))
            }.toString()
        }

        // Triple Ratchet Resize - generates invite evals pool
        AsyncFunction("tripleRatchetResize") { input: String ->
            val json = JSONObject(input)
            val ratchetState = json.getString("ratchet_state")
            val other = json.getString("other")
            val id = json.getLong("id").toULong()
            val total = json.getLong("total").toULong()

            val result = tripleRatchetResize(ratchetState, other, id, total)

            // Convert List<List<UByte>> to JSON array of arrays
            val outerArray = JSONArray()
            result.forEach { innerList ->
                outerArray.put(ubyteListToJsonArray(innerList))
            }
            outerArray.toString()
        }
    }

    private fun jsonArrayToUByteList(array: JSONArray): List<UByte> {
        val list = mutableListOf<UByte>()
        for (i in 0 until array.length()) {
            list.add(array.getInt(i).toUByte())
        }
        return list
    }

    private fun ubyteListToJsonArray(list: List<UByte>): JSONArray {
        val array = JSONArray()
        list.forEach { array.put(it.toInt()) }
        return array
    }

    private fun parseTripleRatchetStateAndMetadata(input: String): TripleRatchetStateAndMetadata {
        val json = JSONObject(input)
        val ratchetState = json.getString("ratchet_state")
        val metadataJson = json.getJSONObject("metadata")
        val metadata = mutableMapOf<String, String>()
        metadataJson.keys().forEach { key ->
            metadata[key] = metadataJson.getString(key)
        }
        return TripleRatchetStateAndMetadata(ratchetState, metadata)
    }

    private fun serializeTripleRatchetStateAndMetadata(state: TripleRatchetStateAndMetadata): String {
        val metadataJson = JSONObject()
        state.metadata.forEach { (key, value) ->
            metadataJson.put(key, value)
        }
        return JSONObject().apply {
            put("ratchet_state", state.ratchetState)
            put("metadata", metadataJson)
        }.toString()
    }
}
