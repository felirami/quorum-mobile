/**
 * NativeCryptoProvider - Implements CryptoProvider using React Native native modules
 *
 * Uses the QuorumCrypto Expo module which wraps uniffi-generated bindings
 * to the Rust channel crate.
 */

// Import types from the shared library
// These types match the CryptoProvider interface
import { logger } from '@quilibrium/quorum-shared';
import type {
  CryptoProvider,
  Ed448Keypair,
  X448Keypair,
  SenderX3DHParams,
  ReceiverX3DHParams,
  NewDoubleRatchetParams,
  DoubleRatchetStateAndMessage,
  DoubleRatchetStateAndEnvelope,
  NewTripleRatchetParams,
  TripleRatchetStateAndMetadata,
  TripleRatchetStateAndMessage,
  TripleRatchetStateAndEnvelope,
  InboxMessageEncryptRequest,
  InboxMessageDecryptRequest,
} from '@quilibrium/quorum-shared';

import QuorumCrypto from '../../modules/quorum-crypto/src';
import { sha512 as nobleSha512 } from '@noble/hashes/sha2';

// Fields that should remain as strings even if they contain JSON
// These are used by Double/Triple Ratchet operations where the state must stay serialized
const KEEP_AS_STRING_FIELDS = new Set(['ratchet_state', 'envelope']);

/**
 * Parse native result and check for errors
 * Handles nested JSON encoding where inner values are JSON strings
 */
function parseNativeResult<T>(result: string): T {
  // Check for common error patterns
  if (
    result.startsWith('invalid') ||
    result.startsWith('error') ||
    result.includes('failed') ||
    result.includes('Error')
  ) {
    throw new Error(result);
  }

  // Try standard JSON parsing first
  try {
    const parsed = JSON.parse(result);

    // Check if this is an object with string values that are themselves JSON
    // IMPORTANT: Some fields like ratchet_state and envelope should stay as strings
    // even if they contain JSON, because they need to be passed back to the native module as-is
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const transformed: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(parsed)) {
        // Skip auto-parsing fields that should remain as strings
        if (KEEP_AS_STRING_FIELDS.has(key)) {
          transformed[key] = value;
        } else if (typeof value === 'string' && (value.startsWith('{') || value.startsWith('['))) {
          try {
            transformed[key] = JSON.parse(value);
          } catch {
            transformed[key] = value;
          }
        } else {
          transformed[key] = value;
        }
      }
      return transformed as T;
    }

    return parsed as T;
  } catch {
    // The native module sometimes returns malformed JSON where inner JSON objects
    // are not properly escaped. Try to fix the format.
    // Pattern: {"key":"{...}","key2":"{...}"}
    // The inner {..} are valid JSON but not escaped as strings

    // Try to extract key-value pairs manually
    const extractedResult = tryExtractNestedJson(result);
    if (extractedResult !== null) {
      return extractedResult as T;
    }

    // If it's not JSON, it might be a quoted string or error
    if (result.startsWith('"') && result.endsWith('"')) {
      // Remove quotes from string results
      return result.slice(1, -1) as unknown as T;
    }
    throw new Error(`Failed to parse native result: ${result}`);
  }
}

/**
 * Try to extract nested JSON from malformed native results
 * Handles the case where inner JSON objects are not properly escaped
 */
function tryExtractNestedJson(result: string): Record<string, unknown> | null {
  // Match pattern like {"ratchet_state":"{...}","envelope":"{...}"}
  // where the inner JSON is not escaped

  if (!result.startsWith('{') || !result.endsWith('}')) {
    return null;
  }

  try {
    const extracted: Record<string, unknown> = {};

    // Find all key-value pairs where value is an unescaped JSON object
    // Pattern: "key":"{ or "key":"[
    const keyPattern = /"(\w+)":"(\{|\[)/g;
    let match;
    const keys: { key: string; start: number; isObject: boolean }[] = [];

    while ((match = keyPattern.exec(result)) !== null) {
      keys.push({
        key: match[1],
        start: match.index + match[0].length - 1, // Position of { or [
        isObject: match[2] === '{',
      });
    }

    // For each key, find the matching closing brace
    for (let i = 0; i < keys.length; i++) {
      const { key, start, isObject } = keys[i];
      const openBrace = isObject ? '{' : '[';
      const closeBrace = isObject ? '}' : ']';

      let depth = 0;
      let inString = false;
      let escaped = false;
      let end = start;

      for (let j = start; j < result.length; j++) {
        const char = result[j];

        if (escaped) {
          escaped = false;
          continue;
        }

        if (char === '\\') {
          escaped = true;
          continue;
        }

        if (char === '"' && !escaped) {
          inString = !inString;
          continue;
        }

        if (!inString) {
          if (char === openBrace) {
            depth++;
          } else if (char === closeBrace) {
            depth--;
            if (depth === 0) {
              end = j;
              break;
            }
          }
        }
      }

      if (end > start) {
        const jsonStr = result.slice(start, end + 1);
        // Keep ratchet_state and envelope as strings, parse others
        if (KEEP_AS_STRING_FIELDS.has(key)) {
          extracted[key] = jsonStr;
        } else {
          try {
            extracted[key] = JSON.parse(jsonStr);
          } catch {
            extracted[key] = jsonStr;
          }
        }
      }
    }

    return Object.keys(extracted).length > 0 ? extracted : null;
  } catch {
    return null;
  }
}

/**
 * Parse double ratchet results, keeping ratchet_state and envelope as strings
 */
function parseDoubleRatchetResult(result: string): DoubleRatchetStateAndEnvelope {
  if (!result.startsWith('{') || !result.endsWith('}')) {
    throw new Error(`Invalid double ratchet result format: ${result.substring(0, 100)}`);
  }

  // The native module now returns properly escaped JSON, so use JSON.parse directly
  try {
    const parsed = JSON.parse(result) as { ratchet_state: string; envelope: string };

    if (typeof parsed.ratchet_state !== 'string') {
      throw new Error('ratchet_state is not a string');
    }
    if (typeof parsed.envelope !== 'string') {
      throw new Error('envelope is not a string');
    }

    return {
      ratchet_state: parsed.ratchet_state,
      envelope: parsed.envelope,
    };
  } catch (e) {
    throw new Error(`Failed to parse double ratchet result: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/**
 * Parse double ratchet decrypt results, keeping ratchet_state as string
 */
function parseDoubleRatchetDecryptResult(result: string): DoubleRatchetStateAndMessage {
  if (!result.startsWith('{') || !result.endsWith('}')) {
    throw new Error(`Invalid double ratchet decrypt result format: ${result.substring(0, 100)}`);
  }

  // The native module now returns properly escaped JSON, so we can use JSON.parse directly
  try {
    const parsed = JSON.parse(result) as { ratchet_state: string; message: number[] };

    if (typeof parsed.ratchet_state !== 'string') {
      throw new Error('ratchet_state is not a string');
    }
    if (!Array.isArray(parsed.message)) {
      throw new Error('message is not an array');
    }

    // Check if the message is actually an error from the Rust layer
    // The Rust code returns errors as the message content (byte array)
    if (parsed.message.length > 0) {
      const messageStr = new TextDecoder().decode(new Uint8Array(parsed.message));
      if (messageStr.startsWith('Decryption failed:') ||
          messageStr.startsWith('invalid') ||
          messageStr.includes('aead::Error')) {
        throw new Error(`Double ratchet decryption error: ${messageStr}`);
      }
    }

    return {
      ratchet_state: parsed.ratchet_state,
      message: parsed.message,
    };
  } catch (e) {
    throw new Error(`Failed to parse double ratchet decrypt result: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/**
 * NativeCryptoProvider - Implements CryptoProvider using QuorumCrypto native module
 */
export class NativeCryptoProvider implements CryptoProvider {
  // ============ Key Generation ============

  async generateX448(): Promise<X448Keypair> {
    const result = await QuorumCrypto.generateX448();
    const keypair = parseNativeResult<{ public_key: number[]; private_key: number[] }>(result);
    return {
      type: 'x448',
      public_key: keypair.public_key,
      private_key: keypair.private_key,
    };
  }

  async generateEd448(): Promise<Ed448Keypair> {
    const result = await QuorumCrypto.generateEd448();
    const keypair = parseNativeResult<{ public_key: number[]; private_key: number[] }>(result);
    return {
      type: 'ed448',
      public_key: keypair.public_key,
      private_key: keypair.private_key,
    };
  }

  async getPublicKeyX448(privateKey: string): Promise<string> {
    const result = await QuorumCrypto.getPublicKeyX448(privateKey);
    // Check for errors
    if (result.startsWith('invalid') || result.includes('error')) {
      throw new Error(result);
    }
    // The Rust function returns a JSON-encoded base64 string
    try {
      return JSON.parse(result) as string;
    } catch {
      return result;
    }
  }

  async getPublicKeyEd448(privateKey: string): Promise<string> {
    const result = await QuorumCrypto.getPublicKeyEd448(privateKey);
    // Check for errors
    if (result.startsWith('invalid') || result.includes('error')) {
      throw new Error(result);
    }
    // The Rust function returns a JSON-encoded base64 string
    try {
      return JSON.parse(result) as string;
    } catch {
      return result;
    }
  }

  /**
   * Sign a message with Ed448
   * @param privateKey - Base64 encoded private key
   * @param message - Base64 encoded message to sign
   * @returns Base64 encoded signature
   */
  async signEd448(privateKey: string, message: string): Promise<string> {
    const result = await QuorumCrypto.signEd448(privateKey, message);
    // Check for errors
    if (result.startsWith('invalid') || result.includes('error')) {
      throw new Error(result);
    }
    // The Rust function returns a JSON-encoded base64 string (like `"SGVsbG8="`)
    // We need to JSON.parse to get the actual base64 value
    try {
      return JSON.parse(result) as string;
    } catch {
      // If JSON parsing fails, maybe it's already raw base64, return as-is
      return result;
    }
  }

  // ============ X3DH Key Agreement ============

  async senderX3DH(params: SenderX3DHParams): Promise<string> {
    const input = JSON.stringify({
      sending_identity_private_key: params.sending_identity_private_key,
      sending_ephemeral_private_key: params.sending_ephemeral_private_key,
      receiving_identity_key: params.receiving_identity_key,
      receiving_signed_pre_key: params.receiving_signed_pre_key,
      session_key_length: params.session_key_length,
    });
    const result = await QuorumCrypto.senderX3dh(input);
    if (result.startsWith('invalid') || result.includes('error')) {
      throw new Error(result);
    }
    return result;
  }

  async receiverX3DH(params: ReceiverX3DHParams): Promise<string> {
    const input = JSON.stringify({
      sending_identity_private_key: params.sending_identity_private_key,
      sending_signed_private_key: params.sending_signed_private_key,
      receiving_identity_key: params.receiving_identity_key,
      receiving_ephemeral_key: params.receiving_ephemeral_key,
      session_key_length: params.session_key_length,
    });
    const result = await QuorumCrypto.receiverX3dh(input);
    if (result.startsWith('invalid') || result.includes('error')) {
      throw new Error(result);
    }
    return result;
  }

  // ============ Double Ratchet ============

  async newDoubleRatchet(params: NewDoubleRatchetParams): Promise<string> {
    const input = JSON.stringify({
      session_key: params.session_key,
      sending_header_key: params.sending_header_key,
      next_receiving_header_key: params.next_receiving_header_key,
      is_sender: params.is_sender,
      sending_ephemeral_private_key: params.sending_ephemeral_private_key,
      receiving_ephemeral_key: params.receiving_ephemeral_key,
    });
    const result = await QuorumCrypto.newDoubleRatchet(input);
    logger.log('[Native] newDoubleRatchet raw result (first 200):', result.substring(0, 200));
    if (result.startsWith('invalid') || result.includes('error')) {
      throw new Error(result);
    }
    return result;
  }

  async doubleRatchetEncrypt(
    stateAndMessage: DoubleRatchetStateAndMessage
  ): Promise<DoubleRatchetStateAndEnvelope> {
    // The native module expects ratchet_state to be a STRING (JSON-encoded)
    // When we JSON.stringify the whole input, the ratchet_state gets double-encoded
    // This is the expected format based on desktop SDK behavior
    logger.log('[Native] doubleRatchetEncrypt ratchet_state type:', typeof stateAndMessage.ratchet_state);
    logger.log('[Native] doubleRatchetEncrypt ratchet_state preview:',
      typeof stateAndMessage.ratchet_state === 'string'
        ? stateAndMessage.ratchet_state.substring(0, 100)
        : 'NOT A STRING');
    const input = JSON.stringify({
      ratchet_state: stateAndMessage.ratchet_state,
      message: stateAndMessage.message,
    });
    logger.log('[Native] doubleRatchetEncrypt input (first 200):', input.substring(0, 200));
    const result = await QuorumCrypto.doubleRatchetEncrypt(input);
    logger.log('[Native] doubleRatchetEncrypt raw result (first 200):', result.substring(0, 200));
    // Use special parsing that keeps ratchet_state and envelope as strings
    const parsed = parseDoubleRatchetResult(result);
    logger.log('[Native] doubleRatchetEncrypt parsed ratchet_state (first 100):', parsed.ratchet_state.substring(0, 100));
    return parsed;
  }

  async doubleRatchetDecrypt(
    stateAndEnvelope: DoubleRatchetStateAndEnvelope
  ): Promise<DoubleRatchetStateAndMessage> {
    // The native module expects ratchet_state to be a STRING (JSON-encoded)
    // When we JSON.stringify the whole input, the ratchet_state gets double-encoded
    // This is the expected format based on desktop SDK behavior
    logger.log('[Native] doubleRatchetDecrypt input state preview (100):', stateAndEnvelope.ratchet_state?.substring(0, 100));
    logger.log('[Native] doubleRatchetDecrypt input envelope preview (100):', stateAndEnvelope.envelope?.substring(0, 100));
    const input = JSON.stringify({
      ratchet_state: stateAndEnvelope.ratchet_state,
      envelope: stateAndEnvelope.envelope,
    });
    logger.log('[Native] doubleRatchetDecrypt stringified input (200):', input.substring(0, 200));
    const result = await QuorumCrypto.doubleRatchetDecrypt(input);
    logger.log('[Native] doubleRatchetDecrypt raw result (300):', result.substring(0, 300));
    // Use special parsing that keeps ratchet_state as string
    const parsed = parseDoubleRatchetDecryptResult(result);
    logger.log('[Native] doubleRatchetDecrypt parsed message length:', parsed.message?.length);
    logger.log('[Native] doubleRatchetDecrypt parsed message bytes (first 20):', parsed.message?.slice(0, 20));
    return parsed;
  }

  // ============ Triple Ratchet ============

  async newTripleRatchet(params: NewTripleRatchetParams): Promise<TripleRatchetStateAndMetadata> {
    const input = JSON.stringify({
      peers: params.peers,
      peer_key: params.peer_key,
      identity_key: params.identity_key,
      signed_pre_key: params.signed_pre_key,
      threshold: params.threshold,
      async_dkg_ratchet: params.async_dkg_ratchet,
    });
    const result = await QuorumCrypto.newTripleRatchet(input);
    return parseNativeResult<TripleRatchetStateAndMetadata>(result);
  }

  async tripleRatchetInitRound1(
    state: TripleRatchetStateAndMetadata
  ): Promise<TripleRatchetStateAndMetadata> {
    const input = JSON.stringify(state);
    const result = await QuorumCrypto.tripleRatchetInitRound1(input);
    return parseNativeResult<TripleRatchetStateAndMetadata>(result);
  }

  async tripleRatchetInitRound2(
    state: TripleRatchetStateAndMetadata
  ): Promise<TripleRatchetStateAndMetadata> {
    const input = JSON.stringify(state);
    const result = await QuorumCrypto.tripleRatchetInitRound2(input);
    return parseNativeResult<TripleRatchetStateAndMetadata>(result);
  }

  async tripleRatchetInitRound3(
    state: TripleRatchetStateAndMetadata
  ): Promise<TripleRatchetStateAndMetadata> {
    const input = JSON.stringify(state);
    const result = await QuorumCrypto.tripleRatchetInitRound3(input);
    return parseNativeResult<TripleRatchetStateAndMetadata>(result);
  }

  async tripleRatchetInitRound4(
    state: TripleRatchetStateAndMetadata
  ): Promise<TripleRatchetStateAndMetadata> {
    const input = JSON.stringify(state);
    const result = await QuorumCrypto.tripleRatchetInitRound4(input);
    return parseNativeResult<TripleRatchetStateAndMetadata>(result);
  }

  async tripleRatchetEncrypt(
    stateAndMessage: TripleRatchetStateAndMessage
  ): Promise<TripleRatchetStateAndEnvelope> {
    const input = JSON.stringify({
      ratchet_state: stateAndMessage.ratchet_state,
      message: stateAndMessage.message,
    });
    const result = await QuorumCrypto.tripleRatchetEncrypt(input);
    return parseNativeResult<TripleRatchetStateAndEnvelope>(result);
  }

  async tripleRatchetDecrypt(
    stateAndEnvelope: TripleRatchetStateAndEnvelope
  ): Promise<TripleRatchetStateAndMessage> {
    const input = JSON.stringify({
      ratchet_state: stateAndEnvelope.ratchet_state,
      envelope: stateAndEnvelope.envelope,
    });
    const result = await QuorumCrypto.tripleRatchetDecrypt(input);
    return parseNativeResult<TripleRatchetStateAndMessage>(result);
  }

  async tripleRatchetResize(
    state: TripleRatchetStateAndMetadata
  ): Promise<TripleRatchetStateAndMetadata> {
    // Note: This requires the full resize request format
    // For now, just pass through - will need to be updated based on actual usage
    const input = JSON.stringify(state);
    // TODO: Implement when triple ratchet resize is needed
    throw new Error('tripleRatchetResize not yet implemented');
  }

  /**
   * Resize the triple ratchet to generate invite evals pool
   *
   * @param ratchetState - The current ratchet state (JSON string)
   * @param other - The other party's scalar (hex string)
   * @param id - The starting ID for evals
   * @param total - The total number of evals to generate
   * @returns Array of eval byte arrays (each eval is a number[])
   */
  async tripleRatchetResizeForInvites(
    ratchetState: string,
    other: string,
    id: number,
    total: number
  ): Promise<number[][]> {
    const input = JSON.stringify({
      ratchet_state: ratchetState,
      other: other,
      id: id,
      total: total,
    });
    const result = await QuorumCrypto.tripleRatchetResize(input);
    return parseNativeResult<number[][]>(result);
  }

  // ============ Inbox Message Encryption ============

  async encryptInboxMessage(request: InboxMessageEncryptRequest): Promise<string> {
    const input = JSON.stringify({
      inbox_public_key: request.inbox_public_key,
      ephemeral_private_key: request.ephemeral_private_key,
      plaintext: request.plaintext,
    });
    const result = await QuorumCrypto.encryptInboxMessage(input);
    logger.log('[Native] encryptInboxMessage result (first 200):', result.substring(0, 200));
    if (result.startsWith('invalid') || result.includes('error')) {
      throw new Error(result);
    }
    return result;
  }

  async decryptInboxMessage(request: InboxMessageDecryptRequest): Promise<number[]> {
    const input = JSON.stringify({
      inbox_private_key: request.inbox_private_key,
      ephemeral_public_key: request.ephemeral_public_key,
      ciphertext: request.ciphertext,
    });
    const result = await QuorumCrypto.decryptInboxMessage(input);
    return parseNativeResult<number[]>(result);
  }

  // ============ Inbox Envelope Sealing ============

  /**
   * Seal an inbox envelope for a specific recipient
   *
   * This encrypts a message to a recipient's X448 public key so only they can decrypt it.
   * Used for rekey operations where sensitive state needs to be sent to specific members.
   *
   * @param recipientPubKeyBase64 - The recipient's X448 public key (base64)
   * @param message - The plaintext message to encrypt
   * @returns InboxSealedEnvelope ready for transmission
   */
  async sealInboxEnvelope(
    recipientPubKeyBase64: string,
    message: string
  ): Promise<InboxSealedEnvelope> {
    // 1. Generate ephemeral X448 keypair
    const ephemeralKeypair = await this.generateX448();

    // 2. Convert recipient public key from base64 to number array
    const recipientPubKey = base64ToArray(recipientPubKeyBase64);

    // 3. Encrypt message using inbox encryption
    const messageBytes = new TextEncoder().encode(message);
    const encryptedEnvelope = await this.encryptInboxMessage({
      inbox_public_key: recipientPubKey,
      ephemeral_private_key: ephemeralKeypair.private_key,
      plaintext: Array.from(messageBytes),
    });

    // 4. Build and return the sealed envelope
    return {
      inbox_public_key: base64ToHex(recipientPubKeyBase64),
      ephemeral_public_key: arrayToHex(ephemeralKeypair.public_key),
      envelope: encryptedEnvelope,
    };
  }

  /**
   * Unseal an inbox envelope using the recipient's private key
   *
   * @param recipientPrivKey - The recipient's X448 private key (number array)
   * @param envelope - The sealed envelope to decrypt
   * @returns Decrypted plaintext as string
   */
  async unsealInboxEnvelope(
    recipientPrivKey: number[],
    envelope: InboxSealedEnvelope
  ): Promise<string> {
    // 1. Parse ephemeral public key from hex
    const ephemeralPublicKey = hexToArray(envelope.ephemeral_public_key);

    // 2. Parse encrypted envelope
    const ciphertext = JSON.parse(envelope.envelope) as {
      ciphertext: string;
      initialization_vector: string;
      associated_data?: string;
    };

    // 3. Decrypt using inbox decryption
    const decryptedBytes = await this.decryptInboxMessage({
      inbox_private_key: recipientPrivKey,
      ephemeral_public_key: ephemeralPublicKey,
      ciphertext,
    });

    // 4. Convert to string
    return new TextDecoder().decode(new Uint8Array(decryptedBytes));
  }

  // ============ Hub Envelope Sealing ============

  /**
   * Seal a message for hub delivery
   *
   * This creates a HubSealedMessage that can be sent via postHub API:
   * 1. Derives X448 public key from Ed448 private key via SHA-512
   * 2. Generates ephemeral X448 keypair
   * 3. Encrypts message using inbox encryption (sealed sender)
   * 4. Signs the envelope with the hub Ed448 key
   *
   * @param hubAddress - The hub address
   * @param hubKeypair - The Ed448 keypair for the hub
   * @param message - The plaintext message to seal
   * @returns HubSealedMessage ready for API transmission
   */
  async sealHubEnvelope(
    hubAddress: string,
    hubKeypair: { publicKey: number[]; privateKey: number[] },
    message: string,
    configKey?: { publicKey: number[]; privateKey: number[] }
  ): Promise<HubSealedMessage> {
    // Use config key for encryption if provided, otherwise derive from hub key for backwards compatibility
    let x448PublicKey: number[];

    if (configKey) {
      // Use config key directly for encryption
      x448PublicKey = configKey.publicKey;
    } else {
      // Legacy: Derive X448 public key from Ed448 private key via SHA-512
      // The X448 key is derived from first 56 bytes of SHA-512(ed448_private_key)
      const privateKeyBytes = new Uint8Array(hubKeypair.privateKey);
      const sha512Hash = this.sha512(privateKeyBytes);
      const x448PrivateKeyBytes = sha512Hash.slice(0, 56);

      // Get X448 public key from the derived private key
      const x448PrivateKeyBase64 = arrayToBase64(Array.from(x448PrivateKeyBytes));
      const x448PublicKeyBase64Result = await QuorumCrypto.getPublicKeyX448(x448PrivateKeyBase64);
      const x448PublicKeyBase64 = parseNativeResult<string>(x448PublicKeyBase64Result);
      x448PublicKey = base64ToArray(x448PublicKeyBase64);
    }

    // 2. Generate ephemeral X448 keypair
    const ephemeralKeypair = await this.generateX448();

    // 3. Encrypt message using inbox encryption
    const messageBytes = new TextEncoder().encode(message);
    const encryptedEnvelope = await this.encryptInboxMessage({
      inbox_public_key: x448PublicKey,
      ephemeral_private_key: ephemeralKeypair.private_key,
      plaintext: Array.from(messageBytes),
    });

    // 4. Sign the encrypted envelope with Ed448 key
    const hubPrivateKeyBase64 = arrayToBase64(hubKeypair.privateKey);
    const envelopeBase64 = btoa(encryptedEnvelope);
    const signatureBase64 = await this.signEd448(hubPrivateKeyBase64, envelopeBase64);
    const signatureHex = base64ToHex(signatureBase64);

    // 5. Build and return HubSealedMessage
    return {
      hub_address: hubAddress,
      hub_public_key: arrayToHex(hubKeypair.publicKey),
      ephemeral_public_key: arrayToHex(ephemeralKeypair.public_key),
      envelope: encryptedEnvelope,
      hub_signature: signatureHex,
    };
  }

  /**
   * Compute SHA-512 hash
   */
  private sha512(data: Uint8Array): Uint8Array {
    return nobleSha512(data);
  }

  /**
   * Seal a sync envelope for directed delivery to a specific inbox
   *
   * Unlike sealHubEnvelope (broadcast), this creates a message directed to a specific inbox
   * and includes owner authentication for verification.
   *
   * Uses the config key (X448) for encryption if provided, which ensures kicked users
   * cannot decrypt sync messages after their removal from the space.
   */
  async sealSyncEnvelope(
    inboxAddress: string,
    hubAddress: string,
    hubKeypair: { publicKey: number[]; privateKey: number[] },
    ownerKeypair: { publicKey: number[]; privateKey: number[] },
    message: string,
    configPublicKey?: number[]
  ): Promise<SyncSealedMessage> {
    logger.log('[sealSyncEnvelope] === START ===');
    logger.log('[sealSyncEnvelope] inboxAddress:', inboxAddress.substring(0, 12));
    logger.log('[sealSyncEnvelope] hubAddress:', hubAddress.substring(0, 12));
    logger.log('[sealSyncEnvelope] hubKeypair.publicKey length:', hubKeypair.publicKey.length);
    logger.log('[sealSyncEnvelope] hubKeypair.privateKey length:', hubKeypair.privateKey.length);
    logger.log('[sealSyncEnvelope] ownerKeypair.publicKey length:', ownerKeypair.publicKey.length);
    logger.log('[sealSyncEnvelope] message length:', message.length);
    logger.log('[sealSyncEnvelope] configPublicKey provided:', !!configPublicKey, 'length:', configPublicKey?.length);

    // Use config key if provided, otherwise fall back to hub-derived key (legacy)
    let x448PublicKey: number[];
    if (configPublicKey) {
      x448PublicKey = configPublicKey;
      const configPubHex = configPublicKey.slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join('');
      logger.log('[sealSyncEnvelope] Using config key, HEX prefix:', configPubHex);
    } else {
      // Legacy: Derive X448 public key from hub Ed448 private key via SHA-512
      logger.log('[sealSyncEnvelope] WARNING: No config key provided, using hub-derived key (legacy)');
      const hubPrivateKeyBytes = new Uint8Array(hubKeypair.privateKey);
      const sha512Hash = this.sha512(hubPrivateKeyBytes);
      const x448PrivateKeyBytes = sha512Hash.slice(0, 56);

      // Get X448 public key from the derived private key
      const x448PrivateKeyBase64 = arrayToBase64(Array.from(x448PrivateKeyBytes));
      const x448PublicKeyBase64Result = await QuorumCrypto.getPublicKeyX448(x448PrivateKeyBase64);
      const x448PublicKeyBase64 = parseNativeResult<string>(x448PublicKeyBase64Result);
      x448PublicKey = base64ToArray(x448PublicKeyBase64);
      const x448PubHex = x448PublicKey.slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join('');
      logger.log('[sealSyncEnvelope] Legacy: derived x448PublicKey HEX prefix:', x448PubHex);
    }
    logger.log('[sealSyncEnvelope] x448PublicKey length:', x448PublicKey.length);

    // 2. Generate ephemeral X448 keypair
    const ephemeralKeypair = await this.generateX448();
    logger.log('[sealSyncEnvelope] ephemeral public key length:', ephemeralKeypair.public_key.length);

    // 3. Encrypt message using inbox encryption
    const messageBytes = new TextEncoder().encode(message);
    logger.log('[sealSyncEnvelope] messageBytes length:', messageBytes.length);
    const encryptedEnvelope = await this.encryptInboxMessage({
      inbox_public_key: x448PublicKey,
      ephemeral_private_key: ephemeralKeypair.private_key,
      plaintext: Array.from(messageBytes),
    });
    logger.log('[sealSyncEnvelope] encryptedEnvelope length:', encryptedEnvelope.length);
    logger.log('[sealSyncEnvelope] encryptedEnvelope FULL:', encryptedEnvelope);
    // Parse to check structure
    try {
      const parsed = JSON.parse(encryptedEnvelope);
      logger.log('[sealSyncEnvelope] envelope keys:', Object.keys(parsed).join(','));
      logger.log('[sealSyncEnvelope] has initialization_vector:', 'initialization_vector' in parsed);
      logger.log('[sealSyncEnvelope] has associated_data:', 'associated_data' in parsed);
    } catch (e) {
      logger.log('[sealSyncEnvelope] FAILED to parse envelope:', e);
    }

    // 4. Sign the encrypted envelope with owner Ed448 key
    // The envelope is a JSON string - encode as UTF-8 bytes then to base64 (matches desktop)
    const ownerPrivateKeyBase64 = arrayToBase64(ownerKeypair.privateKey);
    const envelopeBytes = new TextEncoder().encode(encryptedEnvelope);
    const envelopeBase64 = arrayToBase64(Array.from(envelopeBytes));
    const signatureBase64 = await this.signEd448(ownerPrivateKeyBase64, envelopeBase64);
    const signatureHex = base64ToHex(signatureBase64);
    logger.log('[sealSyncEnvelope] signatureHex length:', signatureHex.length);

    // 5. Build and return SyncSealedMessage
    const result = {
      inbox_address: inboxAddress,
      hub_address: hubAddress,
      owner_public_key: arrayToHex(ownerKeypair.publicKey),
      ephemeral_public_key: arrayToHex(ephemeralKeypair.public_key),
      envelope: encryptedEnvelope,
      owner_signature: signatureHex,
    };
    logger.log('[sealSyncEnvelope] === END === result keys:', Object.keys(result).join(','));
    logger.log('[sealSyncEnvelope] ephemeral_public_key (first 32 hex):', result.ephemeral_public_key.substring(0, 32));
    logger.log('[sealSyncEnvelope] owner_public_key (first 32 hex):', result.owner_public_key.substring(0, 32));
    logger.log('[sealSyncEnvelope] FULL hubAddress:', hubAddress);
    logger.log('[sealSyncEnvelope] FULL envelope (first 200):', encryptedEnvelope.substring(0, 200));

    return result;
  }

  // ============ Hub Envelope Unsealing ============

  /**
   * Unseal a hub message received from WebSocket
   *
   * This decrypts a HubSealedMessage that was sent via the hub:
   * 1. Derives X448 private key from Ed448 private key via SHA-512
   * 2. Decrypts the envelope using inbox decryption
   *
   * @param hubPrivateKey - The Ed448 private key bytes for the hub
   * @param ephemeralPublicKey - The sender's ephemeral X448 public key (hex)
   * @param encryptedEnvelope - The encrypted envelope (JSON MessageCiphertext)
   * @returns Decrypted plaintext as string
   */
  async unsealHubEnvelope(
    hubPrivateKey: number[],
    ephemeralPublicKeyHex: string,
    encryptedEnvelope: string,
    configPrivateKey?: number[]
  ): Promise<string> {
    // Use config key for decryption if provided, otherwise derive from hub key for backwards compatibility
    let x448PrivateKey: number[];

    if (configPrivateKey) {
      // Use config key directly for decryption
      x448PrivateKey = configPrivateKey;
      logger.log('[Native] unsealHubEnvelope using config key, length:', configPrivateKey.length, 'first 8 bytes:', configPrivateKey.slice(0, 8));
    } else {
      // Legacy: Derive X448 private key from Ed448 private key via SHA-512
      const privateKeyBytes = new Uint8Array(hubPrivateKey);
      const sha512Hash = this.sha512(privateKeyBytes);
      x448PrivateKey = Array.from(sha512Hash.slice(0, 56));
      logger.log('[Native] unsealHubEnvelope using derived key, length:', x448PrivateKey.length, 'first 8 bytes:', x448PrivateKey.slice(0, 8));
    }

    // 2. Parse ephemeral public key from hex
    logger.log('[Native] unsealHubEnvelope ephemeral hex length:', ephemeralPublicKeyHex.length, 'hex prefix:', ephemeralPublicKeyHex.substring(0, 16));
    const ephemeralPublicKey = hexToArray(ephemeralPublicKeyHex);
    logger.log('[Native] unsealHubEnvelope ephemeral key length:', ephemeralPublicKey.length);

    // 3. Parse encrypted envelope
    const ciphertext = JSON.parse(encryptedEnvelope) as {
      ciphertext: string;
      initialization_vector: string;
      associated_data?: string;
    };
    logger.log('[Native] unsealHubEnvelope ciphertext keys:', Object.keys(ciphertext));

    // 4. Decrypt using inbox decryption
    logger.log('[Native] unsealHubEnvelope calling decryptInboxMessage with key length:', x448PrivateKey.length);
    const decryptedBytes = await this.decryptInboxMessage({
      inbox_private_key: x448PrivateKey,
      ephemeral_public_key: ephemeralPublicKey,
      ciphertext,
    });

    // 5. Convert to string
    return new TextDecoder().decode(new Uint8Array(decryptedBytes));
  }

  // ============ Sync Envelope Unsealing ============

  /**
   * Unseal a sync envelope received from WebSocket
   *
   * This decrypts a SyncSealedMessage that was sent via directed delivery:
   * 1. Uses config key if provided, otherwise derives X448 private key from Ed448 private key via SHA-512
   * 2. Decrypts the envelope using inbox decryption
   *
   * Note: The encryption is the same as hub envelopes - the difference is
   * in the outer message structure (owner signature vs hub signature).
   *
   * @param hubPrivateKey - The Ed448 private key bytes for the hub
   * @param syncEnvelope - The sync sealed message
   * @param configPrivateKey - Optional X448 config private key for decryption (preferred over hub-derived key)
   * @returns Decrypted plaintext as string
   */
  async unsealSyncEnvelope(
    hubPrivateKey: number[],
    syncEnvelope: SyncSealedMessage,
    configPrivateKey?: number[]
  ): Promise<string> {
    logger.log('[unsealSyncEnvelope] === START ===');
    logger.log('[unsealSyncEnvelope] inbox_address:', syncEnvelope.inbox_address?.substring(0, 12));
    logger.log('[unsealSyncEnvelope] hub_address:', syncEnvelope.hub_address?.substring(0, 12));
    logger.log('[unsealSyncEnvelope] ephemeral_public_key length:', syncEnvelope.ephemeral_public_key?.length);
    logger.log('[unsealSyncEnvelope] envelope length:', syncEnvelope.envelope?.length);
    logger.log('[unsealSyncEnvelope] configPrivateKey provided:', !!configPrivateKey, 'length:', configPrivateKey?.length);

    // 1. Use config key if provided, otherwise derive X448 private key from Ed448 private key via SHA-512
    let x448PrivateKey: number[];
    if (configPrivateKey) {
      x448PrivateKey = configPrivateKey;
      logger.log('[unsealSyncEnvelope] Using config private key for decryption');
    } else {
      // Legacy: Derive X448 private key from Ed448 private key via SHA-512
      logger.log('[unsealSyncEnvelope] WARNING: No config key provided, using hub-derived key (legacy)');
      const privateKeyBytes = new Uint8Array(hubPrivateKey);
      const sha512Hash = this.sha512(privateKeyBytes);
      x448PrivateKey = Array.from(sha512Hash.slice(0, 56));
    }

    // 2. Parse ephemeral public key from hex
    const ephemeralPublicKey = hexToArray(syncEnvelope.ephemeral_public_key);

    // 3. Parse encrypted envelope
    const ciphertext = JSON.parse(syncEnvelope.envelope) as {
      ciphertext: string;
      initialization_vector: string;
      associated_data?: string;
    };

    // 4. Decrypt using inbox decryption
    const decryptedBytes = await this.decryptInboxMessage({
      inbox_private_key: x448PrivateKey,
      ephemeral_public_key: ephemeralPublicKey,
      ciphertext,
    });

    // 5. Convert to string
    const result = new TextDecoder().decode(new Uint8Array(decryptedBytes));
    logger.log('[unsealSyncEnvelope] === END === decrypted length:', result.length);
    logger.log('[unsealSyncEnvelope] decrypted preview:', result.substring(0, 100));
    return result;
  }
}

/**
 * Inbox sealed envelope for directed message to a specific recipient
 */
export interface InboxSealedEnvelope {
  inbox_public_key: string;
  ephemeral_public_key: string;
  envelope: string;
}

/**
 * Hub sealed message format for postHub API (broadcast)
 */
export interface HubSealedMessage {
  hub_address: string;
  hub_public_key: string;
  ephemeral_public_key: string;
  envelope: string;
  hub_signature: string;
}

/**
 * Sync sealed message format for directed delivery to a specific inbox
 */
export interface SyncSealedMessage {
  inbox_address: string;
  hub_address: string;
  owner_public_key: string;
  ephemeral_public_key: string;
  envelope: string;
  owner_signature: string;
}

/**
 * Convert array to base64 string
 */
function arrayToBase64(arr: number[]): string {
  const uint8 = new Uint8Array(arr);
  let binary = '';
  for (let i = 0; i < uint8.length; i++) {
    binary += String.fromCharCode(uint8[i]);
  }
  return btoa(binary);
}

/**
 * Convert base64 string to number array
 */
function base64ToArray(base64: string): number[] {
  const binary = atob(base64);
  const arr: number[] = [];
  for (let i = 0; i < binary.length; i++) {
    arr.push(binary.charCodeAt(i));
  }
  return arr;
}

/**
 * Convert number array to hex string
 */
function arrayToHex(arr: number[]): string {
  return arr.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Convert base64 string to hex string
 */
function base64ToHex(base64: string): string {
  const binary = atob(base64);
  let hex = '';
  for (let i = 0; i < binary.length; i++) {
    hex += binary.charCodeAt(i).toString(16).padStart(2, '0');
  }
  return hex;
}

/**
 * Convert hex string to number array
 */
function hexToArray(hex: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.substring(i, i + 2), 16));
  }
  return bytes;
}
