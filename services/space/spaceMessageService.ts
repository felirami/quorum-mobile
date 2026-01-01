/**
 * SpaceMessageService - Handles encrypted space message sending
 *
 * Provides functionality to:
 * - Send messages to space channels via Triple Ratchet + Hub encryption
 * - Sign messages with user keys
 * - Handle optimistic updates and error recovery
 *
 * Messages flow:
 * 1. Create message object with nonce and signature
 * 2. Encrypt with Triple Ratchet (shared per-space state)
 * 3. Seal encrypted message for hub delivery using sealHubEnvelope
 * 4. Send via postHub API endpoint
 */

import { logger } from '@quilibrium/quorum-shared';
import { sha256 } from '@noble/hashes/sha2';
import {
  bytesToHex,
  hexToBytes,
  type EditMessage,
  type EmbedMessage,
  type Message,
  type MessageContent,
  type PostMessage,
  type ReactionMessage,
  type RemoveMessage,
  type RemoveReactionMessage,
  // New sync types
  type SyncRequestPayload,
  type SyncInfoPayload,
  type SyncInitiatePayload,
  type SyncManifestPayload,
  type SyncDeltaPayload,
  type SyncManifest,
  type MemberDigest,
  type PeerEntry,
  chunkMessages,
} from '@quilibrium/quorum-shared';
import { getSpaceKey } from '../config/spaceStorage';
import { encryptionStateStorage } from '../crypto/encryption-state-storage';
import { NativeCryptoProvider } from '../crypto/native-provider';

/**
 * Convert byte array to base64 string without stack overflow
 * Uses a loop instead of spread operator for large arrays
 */
function bytesToBase64(bytes: Uint8Array | number[]): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Track sent Triple Ratchet envelope fingerprints
 * This is used to skip decrypting our own echoed messages
 * (Triple Ratchet participants can't decrypt their own messages)
 */
const sentEnvelopeFingerprints = new Set<string>();
const MAX_FINGERPRINTS = 1000; // Limit to prevent memory leaks

/**
 * Generate a fingerprint from a Triple Ratchet envelope for tracking
 */
function getEnvelopeFingerprint(envelope: string): string {
  // Use first 100 chars as fingerprint (unique enough, fast to compute)
  return envelope.substring(0, 100);
}

/**
 * Record that we sent this envelope (so we can skip decrypting it when echoed back)
 */
export function trackSentEnvelope(envelope: string): void {
  const fingerprint = getEnvelopeFingerprint(envelope);
  sentEnvelopeFingerprints.add(fingerprint);

  // Clean up old fingerprints if we have too many
  if (sentEnvelopeFingerprints.size > MAX_FINGERPRINTS) {
    const toRemove = Array.from(sentEnvelopeFingerprints).slice(0, 100);
    toRemove.forEach(fp => sentEnvelopeFingerprints.delete(fp));
  }
}

/**
 * Check if we sent this envelope (and should skip decryption)
 */
export function isSentEnvelope(envelope: string): boolean {
  const fingerprint = getEnvelopeFingerprint(envelope);
  return sentEnvelopeFingerprints.has(fingerprint);
}

/**
 * Remove a fingerprint after we've processed the echo
 */
export function clearSentEnvelope(envelope: string): void {
  const fingerprint = getEnvelopeFingerprint(envelope);
  sentEnvelopeFingerprints.delete(fingerprint);
}

export interface SendSpaceMessageParams {
  spaceId: string;
  channelId: string;
  text: string;
  senderAddress: string;
  repliesToMessageId?: string;
}

export interface SendSpaceMessageResult {
  message: Message;
  /** Stringified envelope ready to send via WebSocket */
  wsEnvelope: string;
}

/**
 * Generate a random nonce for message uniqueness
 */
function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

/**
 * Generate message ID from content hash
 */
function generateMessageId(
  spaceId: string,
  channelId: string,
  senderId: string,
  nonce: string,
  timestamp: number
): string {
  const content = `${spaceId}:${channelId}:${senderId}:${nonce}:${timestamp}`;
  const hash = sha256(new TextEncoder().encode(content));
  return bytesToHex(hash);
}

/**
 * Convert hex string to number array
 */
function hexToNumberArray(hex: string): number[] {
  const bytes = hexToBytes(hex);
  return Array.from(bytes);
}

/**
 * Send a message to a space channel
 *
 * This function:
 * 1. Creates a signed message object
 * 2. Seals it for hub delivery using the space's hub key
 * 3. Sends it via the postHub API
 *
 * @param params - Message parameters
 * @returns The created message and API response
 */
export async function sendSpaceMessage(
  params: SendSpaceMessageParams
): Promise<SendSpaceMessageResult> {
  const { spaceId, channelId, text, senderAddress, repliesToMessageId } = params;

  const cryptoProvider = new NativeCryptoProvider();
  const timestamp = Date.now();
  const nonce = generateNonce();

  logger.log('[SpaceMessageService] Sending message to channel:', channelId);

  // 1. Get hub key for the space
  const hubKey = getSpaceKey(spaceId, 'hub');
  if (!hubKey) {
    logger.log('[SpaceMessageService] No hub key found for spaceId:', spaceId);
    throw new Error('Hub key not found for space. Cannot send messages.');
  }
  if (!hubKey.address || !hubKey.privateKey || !hubKey.publicKey) {
    logger.log('[SpaceMessageService] Hub key incomplete:', {
      hasAddress: !!hubKey.address,
      hasPrivateKey: !!hubKey.privateKey,
      hasPublicKey: !!hubKey.publicKey,
    });
    throw new Error(`Hub key incomplete for space. Missing: ${!hubKey.address ? 'address ' : ''}${!hubKey.privateKey ? 'privateKey ' : ''}${!hubKey.publicKey ? 'publicKey' : ''}`);
  }

  // 1b. Get config key for hub envelope encryption
  const configKey = getSpaceKey(spaceId, 'config');

  // 2. Get inbox key for signing
  const inboxKey = getSpaceKey(spaceId, 'inbox');
  if (!inboxKey || !inboxKey.privateKey || !inboxKey.publicKey) {
    throw new Error('Inbox key not found for space. Cannot sign messages.');
  }

  // 3. Generate message ID
  const messageId = generateMessageId(spaceId, channelId, senderAddress, nonce, timestamp);

  // 4. Build message content
  const messageContent: PostMessage = {
    type: 'post',
    senderId: senderAddress,
    text,
    repliesToMessageId,
  };

  // 5. Build full message object
  const message: Message = {
    channelId,
    spaceId,
    messageId,
    digestAlgorithm: 'sha256',
    nonce,
    createdDate: timestamp,
    modifiedDate: timestamp,
    lastModifiedHash: '',
    content: messageContent,
    reactions: [],
    mentions: { memberIds: [], roleIds: [], channelIds: [] },
    publicKey: inboxKey.publicKey,
  };

  // 6. Sign the message
  const messageJson = JSON.stringify(message);
  const messageBytes = new TextEncoder().encode(messageJson);
  const messageBase64 = bytesToBase64(messageBytes);

  // Sign with inbox key
  const inboxPrivateKeyBytes = hexToBytes(inboxKey.privateKey);
  const inboxPrivateKeyBase64 = bytesToBase64(inboxPrivateKeyBytes);
  const signatureBase64 = await cryptoProvider.signEd448(inboxPrivateKeyBase64, messageBase64);

  // Convert signature to hex for message
  const signatureBinary = atob(signatureBase64);
  let signatureHex = '';
  for (let i = 0; i < signatureBinary.length; i++) {
    signatureHex += signatureBinary.charCodeAt(i).toString(16).padStart(2, '0');
  }
  message.signature = signatureHex;

  // 7. Skip Triple Ratchet encryption - use only hub envelope encryption with config key
  // The config key provides forward secrecy (rotates on kick) without the complexity
  // of Triple Ratchet state synchronization across devices

  // Prepare message for sending (remove ephemeral fields)
  const messageToSend = { ...message };
  delete (messageToSend as Record<string, unknown>).sendStatus;
  delete (messageToSend as Record<string, unknown>).sendError;

  // Create hub message payload with the signed message directly
  const hubMessagePayload = JSON.stringify({
    type: 'message',
    message: messageToSend,
  });

  logger.log('[SpaceMessageService] Message prepared (envelope-only encryption)');

  // 9. Seal the message for hub delivery
  const hubKeypair = {
    publicKey: hexToNumberArray(hubKey.publicKey),
    privateKey: hexToNumberArray(hubKey.privateKey),
  };

  const sealedMessage = await cryptoProvider.sealHubEnvelope(
    hubKey.address,
    hubKeypair,
    hubMessagePayload,
    configKey
      ? {
          publicKey: hexToNumberArray(configKey.publicKey),
          privateKey: hexToNumberArray(configKey.privateKey),
        }
      : undefined
  );

  logger.log('[SpaceMessageService] Message sealed');

  // 10. Wrap with type 'group' for WebSocket delivery
  // Messages are sent via WebSocket, not HTTP postHub
  const wsEnvelope = JSON.stringify({ type: 'group', ...sealedMessage });

  logger.log('[SpaceMessageService] Message prepared for WebSocket:', messageId);

  return {
    message,
    wsEnvelope,
  };
}

/**
 * Create an optimistic message for immediate UI display
 */
export interface JoinParticipant {
  address: string;
  id: number;
  inboxAddress: string;
  inboxPubKey: string;  // Ed448 public key of inbox (hex)
  pubKey: string;       // X448 public key derived from secret (hex)
  inboxKey: string;     // X448 inbox encryption public key (hex)
  identityKey: string;  // Identity public key (hex)
  preKey: string;       // Pre-key public key (hex)
  userIcon: string;
  displayName: string;
  signature: string;    // Ed448 signature (base64)
}

export interface SendJoinMessageParams {
  spaceId: string;
  participant: JoinParticipant;
}

/**
 * Send a join control message to announce a new participant to the space
 * This is required for other participants to be able to:
 * 1. Add the new participant to their peer_id_map/id_peer_map
 * 2. Encrypt messages that the new participant can decrypt
 * 3. Decrypt messages FROM the new participant
 */
export async function sendJoinMessage(
  params: SendJoinMessageParams
): Promise<string> {
  const { spaceId, participant } = params;

  const cryptoProvider = new NativeCryptoProvider();

  logger.log('[SpaceMessageService] Sending join control message for participant:', participant.address);

  // Get hub key for the space
  const hubKey = getSpaceKey(spaceId, 'hub');
  if (!hubKey) {
    logger.log('[SpaceMessageService] No hub key found for spaceId:', spaceId);
    throw new Error('Hub key not found for space. Cannot send join message.');
  }
  if (!hubKey.address || !hubKey.privateKey || !hubKey.publicKey) {
    throw new Error('Hub key incomplete for space.');
  }

  // Get config key for hub envelope encryption
  const configKey = getSpaceKey(spaceId, 'config');

  // Create control message payload
  const controlMessage = {
    type: 'control',
    message: {
      type: 'join',
      participant,
    },
  };

  const hubMessagePayload = JSON.stringify(controlMessage);
  logger.log('[SpaceMessageService] Join control message payload length:', hubMessagePayload.length);

  // Seal the message for hub delivery
  const hubKeypair = {
    publicKey: hexToNumberArray(hubKey.publicKey),
    privateKey: hexToNumberArray(hubKey.privateKey),
  };

  const sealedMessage = await cryptoProvider.sealHubEnvelope(
    hubKey.address,
    hubKeypair,
    hubMessagePayload,
    configKey
      ? {
          publicKey: hexToNumberArray(configKey.publicKey),
          privateKey: hexToNumberArray(configKey.privateKey),
        }
      : undefined
  );

  logger.log('[SpaceMessageService] Join message sealed');

  // Wrap with type 'group' for WebSocket delivery
  const wsEnvelope = JSON.stringify({ type: 'group', ...sealedMessage });

  logger.log('[SpaceMessageService] Join message prepared for WebSocket');

  return wsEnvelope;
}

export function createOptimisticMessage(
  params: SendSpaceMessageParams,
  tempMessageId: string
): Message {
  const { spaceId, channelId, text, senderAddress, repliesToMessageId } = params;
  const timestamp = Date.now();

  return {
    channelId,
    spaceId,
    messageId: tempMessageId,
    digestAlgorithm: 'sha256',
    nonce: '',
    createdDate: timestamp,
    modifiedDate: timestamp,
    lastModifiedHash: '',
    content: {
      type: 'post',
      senderId: senderAddress,
      text,
      repliesToMessageId,
    },
    reactions: [],
    mentions: { memberIds: [], roleIds: [], channelIds: [] },
    sendStatus: 'sending',
  };
}

// ============ Generic Message Sending ============

export interface SendGenericMessageParams {
  spaceId: string;
  channelId: string;
  senderAddress: string;
  content: MessageContent;
}

export interface SendGenericMessageResult {
  message: Message;
  wsEnvelope: string;
}

/**
 * Generic function to send any type of message content
 * This handles the common flow of signing, encrypting, and sealing
 */
async function sendGenericMessage(
  params: SendGenericMessageParams
): Promise<SendGenericMessageResult> {
  const { spaceId, channelId, senderAddress, content } = params;

  const cryptoProvider = new NativeCryptoProvider();
  const timestamp = Date.now();
  const nonce = generateNonce();

  logger.log('[SpaceMessageService] Sending message type:', content.type);

  // Get hub key for the space
  const hubKey = getSpaceKey(spaceId, 'hub');
  if (!hubKey || !hubKey.address || !hubKey.privateKey || !hubKey.publicKey) {
    throw new Error('Hub key not found or incomplete for space.');
  }

  // Get config key for hub envelope encryption
  const configKey = getSpaceKey(spaceId, 'config');

  // Get inbox key for signing
  const inboxKey = getSpaceKey(spaceId, 'inbox');
  if (!inboxKey || !inboxKey.privateKey || !inboxKey.publicKey) {
    throw new Error('Inbox key not found for space. Cannot sign messages.');
  }

  // Generate message ID
  const messageId = generateMessageId(spaceId, channelId, senderAddress, nonce, timestamp);

  // Build full message object
  const message: Message = {
    channelId,
    spaceId,
    messageId,
    digestAlgorithm: 'sha256',
    nonce,
    createdDate: timestamp,
    modifiedDate: timestamp,
    lastModifiedHash: '',
    content,
    reactions: [],
    mentions: { memberIds: [], roleIds: [], channelIds: [] },
    publicKey: inboxKey.publicKey,
  };

  // Sign the message
  const messageJson = JSON.stringify(message);
  const messageBytes = new TextEncoder().encode(messageJson);
  const messageBase64 = bytesToBase64(messageBytes);

  const inboxPrivateKeyBytes = hexToBytes(inboxKey.privateKey);
  const inboxPrivateKeyBase64 = bytesToBase64(inboxPrivateKeyBytes);
  const signatureBase64 = await cryptoProvider.signEd448(inboxPrivateKeyBase64, messageBase64);

  const signatureBinary = atob(signatureBase64);
  let signatureHex = '';
  for (let i = 0; i < signatureBinary.length; i++) {
    signatureHex += signatureBinary.charCodeAt(i).toString(16).padStart(2, '0');
  }
  message.signature = signatureHex;

  // Skip Triple Ratchet encryption - use only hub envelope encryption with config key
  // The config key provides forward secrecy (rotates on kick) without the complexity
  // of Triple Ratchet state synchronization across devices

  // Prepare message for sending (remove ephemeral fields)
  const messageToSend = { ...message };
  delete (messageToSend as Record<string, unknown>).sendStatus;
  delete (messageToSend as Record<string, unknown>).sendError;

  const hubMessagePayload = JSON.stringify({
    type: 'message',
    message: messageToSend,
  });

  logger.log('[SpaceMessageService] Generic message prepared (envelope-only encryption), type:', content.type);

  // Seal for hub delivery
  const hubKeypair = {
    publicKey: hexToNumberArray(hubKey.publicKey),
    privateKey: hexToNumberArray(hubKey.privateKey),
  };

  const sealedMessage = await cryptoProvider.sealHubEnvelope(
    hubKey.address,
    hubKeypair,
    hubMessagePayload,
    configKey
      ? {
          publicKey: hexToNumberArray(configKey.publicKey),
          privateKey: hexToNumberArray(configKey.privateKey),
        }
      : undefined
  );

  const wsEnvelope = JSON.stringify({ type: 'group', ...sealedMessage });

  return { message, wsEnvelope };
}

// ============ Reaction Messages ============

export interface SendReactionParams {
  spaceId: string;
  channelId: string;
  targetMessageId: string;
  reaction: string;
  senderAddress: string;
}

/**
 * Send a reaction to a message
 */
export async function sendReaction(
  params: SendReactionParams
): Promise<SendGenericMessageResult> {
  const { spaceId, channelId, targetMessageId, reaction, senderAddress } = params;

  const content: ReactionMessage = {
    type: 'reaction',
    senderId: senderAddress,
    messageId: targetMessageId,
    reaction,
  };

  return sendGenericMessage({ spaceId, channelId, senderAddress, content });
}

/**
 * Remove a reaction from a message
 */
export async function removeReaction(
  params: SendReactionParams
): Promise<SendGenericMessageResult> {
  const { spaceId, channelId, targetMessageId, reaction, senderAddress } = params;

  const content: RemoveReactionMessage = {
    type: 'remove-reaction',
    senderId: senderAddress,
    messageId: targetMessageId,
    reaction,
  };

  return sendGenericMessage({ spaceId, channelId, senderAddress, content });
}

// ============ Edit Messages ============

export interface SendEditMessageParams {
  spaceId: string;
  channelId: string;
  originalMessageId: string;
  editedText: string;
  senderAddress: string;
}

/**
 * Send an edit for an existing message
 */
export async function sendEditMessage(
  params: SendEditMessageParams
): Promise<SendGenericMessageResult> {
  const { spaceId, channelId, originalMessageId, editedText, senderAddress } = params;

  const editedAt = Date.now();
  const editNonce = generateNonce();

  const content: EditMessage = {
    type: 'edit-message',
    senderId: senderAddress,
    originalMessageId,
    editedText,
    editedAt,
    editNonce,
  };

  return sendGenericMessage({ spaceId, channelId, senderAddress, content });
}

// ============ Delete Messages ============

export interface SendDeleteMessageParams {
  spaceId: string;
  channelId: string;
  targetMessageId: string;
  senderAddress: string;
}

/**
 * Send a delete/remove message
 */
export async function sendDeleteMessage(
  params: SendDeleteMessageParams
): Promise<SendGenericMessageResult> {
  const { spaceId, channelId, targetMessageId, senderAddress } = params;

  const content: RemoveMessage = {
    type: 'remove-message',
    senderId: senderAddress,
    removeMessageId: targetMessageId,
  };

  return sendGenericMessage({ spaceId, channelId, senderAddress, content });
}

// ============ Update Profile Messages ============

export interface SendUpdateProfileParams {
  spaceId: string;
  channelId: string;
  senderAddress: string;
  displayName: string;
  userIcon: string;
}

/**
 * Send an update-profile message to a space channel
 * This notifies other members of the space about a profile change
 */
export async function sendUpdateProfileMessage(
  params: SendUpdateProfileParams
): Promise<SendGenericMessageResult> {
  const { spaceId, channelId, senderAddress, displayName, userIcon } = params;

  const content = {
    type: 'update-profile' as const,
    senderId: senderAddress,
    displayName,
    userIcon,
  };

  return sendGenericMessage({ spaceId, channelId, senderAddress, content });
}

// ============ Embed Messages ============

export interface SendEmbedMessageParams {
  spaceId: string;
  channelId: string;
  senderAddress: string;
  imageUrl?: string;
  videoUrl?: string;
  thumbnailUrl?: string;
  width?: string;
  height?: string;
  repliesToMessageId?: string;
}

/**
 * Send an embed message (image/video)
 */
export async function sendEmbedMessage(
  params: SendEmbedMessageParams
): Promise<SendGenericMessageResult> {
  const {
    spaceId,
    channelId,
    senderAddress,
    imageUrl,
    videoUrl,
    thumbnailUrl,
    width,
    height,
    repliesToMessageId,
  } = params;

  const content: EmbedMessage = {
    type: 'embed',
    senderId: senderAddress,
    imageUrl,
    videoUrl,
    thumbnailUrl,
    width,
    height,
    repliesToMessageId,
  };

  return sendGenericMessage({ spaceId, channelId, senderAddress, content });
}

// ============ Sync Control Messages ============

/**
 * Send a sync-peer-map control message to a specific inbox
 * Now includes critical ratchet state fields for proper decryption sync
 */
export async function sendSyncPeerMapMessage(
  spaceId: string,
  targetInboxAddress: string,
  peerMap: {
    id_peer_map: unknown;
    peer_id_map: unknown;
    // Additional fields for full ratchet state sync
    root_key?: unknown;
    dkg_ratchet?: unknown;
    receiving_group_key?: unknown;
    receiving_chain_key?: unknown;
    current_header_key?: unknown;
    next_header_key?: unknown;
    async_dkg_pubkey?: unknown;
    threshold?: unknown;
  }
): Promise<string> {
  const cryptoProvider = new NativeCryptoProvider();

  const hubKey = getSpaceKey(spaceId, 'hub');
  if (!hubKey || !hubKey.address || !hubKey.privateKey || !hubKey.publicKey) {
    throw new Error('Hub key not found or incomplete for space.');
  }

  const inboxKey = getSpaceKey(spaceId, 'inbox');
  if (!inboxKey || !inboxKey.privateKey || !inboxKey.publicKey) {
    throw new Error('Inbox key not found or incomplete for space.');
  }

  const controlMessage = {
    type: 'control',
    message: {
      type: 'sync-peer-map',
      peerMap,
    },
  };

  const hubKeypair = {
    publicKey: hexToNumberArray(hubKey.publicKey),
    privateKey: hexToNumberArray(hubKey.privateKey),
  };

  const inboxKeypair = {
    publicKey: hexToNumberArray(inboxKey.publicKey),
    privateKey: hexToNumberArray(inboxKey.privateKey),
  };

  const sealedMessage = await cryptoProvider.sealSyncEnvelope(
    targetInboxAddress,
    hubKey.address,
    hubKeypair,
    inboxKeypair,
    JSON.stringify(controlMessage)
  );

  return JSON.stringify({ type: 'sync', ...sealedMessage });
}

/**
 * Send a sync-members control message to a specific inbox (chunked for large member lists)
 */
export async function sendSyncMembersMessage(
  spaceId: string,
  targetInboxAddress: string,
  members: {
    user_address: string;
    display_name?: string;
    user_icon?: string;
    inbox_address?: string;
  }[]
): Promise<string[]> {
  const cryptoProvider = new NativeCryptoProvider();

  const hubKey = getSpaceKey(spaceId, 'hub');
  if (!hubKey || !hubKey.address || !hubKey.privateKey || !hubKey.publicKey) {
    throw new Error('Hub key not found or incomplete for space.');
  }

  const inboxKey = getSpaceKey(spaceId, 'inbox');
  if (!inboxKey || !inboxKey.privateKey || !inboxKey.publicKey) {
    throw new Error('Inbox key not found or incomplete for space.');
  }

  const hubKeypair = {
    publicKey: hexToNumberArray(hubKey.publicKey),
    privateKey: hexToNumberArray(hubKey.privateKey),
  };

  const inboxKeypair = {
    publicKey: hexToNumberArray(inboxKey.publicKey),
    privateKey: hexToNumberArray(inboxKey.privateKey),
  };

  const envelopes: string[] = [];
  const chunkSize = 5 * 1024 * 1024; // 5MB chunks

  let currentChunk: typeof members = [];
  let currentSize = 0;

  for (const member of members) {
    const memberSize = JSON.stringify(member).length;
    if (currentSize + memberSize > chunkSize && currentChunk.length > 0) {
      // Send current chunk
      const controlMessage = {
        type: 'control',
        message: {
          type: 'sync-members',
          members: currentChunk,
        },
      };

      const sealedMessage = await cryptoProvider.sealSyncEnvelope(
        targetInboxAddress,
        hubKey.address,
        hubKeypair,
        inboxKeypair,
        JSON.stringify(controlMessage)
      );

      envelopes.push(JSON.stringify({ type: 'sync', ...sealedMessage }));
      currentChunk = [];
      currentSize = 0;
    }

    currentChunk.push(member);
    currentSize += memberSize;
  }

  // Send remaining chunk
  if (currentChunk.length > 0) {
    const controlMessage = {
      type: 'control',
      message: {
        type: 'sync-members',
        members: currentChunk,
      },
    };

    const sealedMessage = await cryptoProvider.sealSyncEnvelope(
      targetInboxAddress,
      hubKey.address,
      hubKeypair,
      inboxKeypair,
      JSON.stringify(controlMessage)
    );

    envelopes.push(JSON.stringify({ type: 'sync', ...sealedMessage }));
  }

  return envelopes;
}

/**
 * Send a sync-messages control message to a specific inbox (chunked for large message lists)
 */
export async function sendSyncMessagesMessage(
  spaceId: string,
  targetInboxAddress: string,
  channelId: string,
  messages: Message[]
): Promise<string[]> {
  const cryptoProvider = new NativeCryptoProvider();

  const hubKey = getSpaceKey(spaceId, 'hub');
  if (!hubKey || !hubKey.address || !hubKey.privateKey || !hubKey.publicKey) {
    throw new Error('Hub key not found or incomplete for space.');
  }

  const inboxKey = getSpaceKey(spaceId, 'inbox');
  if (!inboxKey || !inboxKey.privateKey || !inboxKey.publicKey) {
    throw new Error('Inbox key not found or incomplete for space.');
  }

  const hubKeypair = {
    publicKey: hexToNumberArray(hubKey.publicKey),
    privateKey: hexToNumberArray(hubKey.privateKey),
  };

  const inboxKeypair = {
    publicKey: hexToNumberArray(inboxKey.publicKey),
    privateKey: hexToNumberArray(inboxKey.privateKey),
  };

  const envelopes: string[] = [];
  const chunkSize = 5 * 1024 * 1024; // 5MB chunks

  let currentChunk: Message[] = [];
  let currentSize = 0;

  for (const msg of messages) {
    const msgSize = JSON.stringify(msg).length;
    if (currentSize + msgSize > chunkSize && currentChunk.length > 0) {
      // Send current chunk
      const controlMessage = {
        type: 'control',
        message: {
          type: 'sync-messages',
          messages: currentChunk,
        },
      };

      const sealedMessage = await cryptoProvider.sealSyncEnvelope(
        targetInboxAddress,
        hubKey.address,
        hubKeypair,
        inboxKeypair,
        JSON.stringify(controlMessage)
      );

      envelopes.push(JSON.stringify({ type: 'sync', ...sealedMessage }));
      currentChunk = [];
      currentSize = 0;
    }

    currentChunk.push(msg);
    currentSize += msgSize;
  }

  // Send remaining chunk
  if (currentChunk.length > 0) {
    const controlMessage = {
      type: 'control',
      message: {
        type: 'sync-messages',
        messages: currentChunk,
      },
    };

    const sealedMessage = await cryptoProvider.sealSyncEnvelope(
      targetInboxAddress,
      hubKey.address,
      hubKeypair,
      inboxKeypair,
      JSON.stringify(controlMessage)
    );

    envelopes.push(JSON.stringify({ type: 'sync', ...sealedMessage }));
  }

  return envelopes;
}

/**
 * Send a sync-info response to a specific inbox
 * This is used to respond to sync-request messages when we have more data
 */
export async function sendSyncInfoMessage(
  spaceId: string,
  targetInboxAddress: string,
  messageCount: number,
  memberCount: number
): Promise<string> {
  const cryptoProvider = new NativeCryptoProvider();

  const hubKey = getSpaceKey(spaceId, 'hub');
  if (!hubKey || !hubKey.address || !hubKey.privateKey || !hubKey.publicKey) {
    throw new Error('Hub key not found or incomplete for space.');
  }

  const inboxKey = getSpaceKey(spaceId, 'inbox');
  if (!inboxKey || !inboxKey.address || !inboxKey.privateKey || !inboxKey.publicKey) {
    throw new Error('Inbox key not found or incomplete for space.');
  }

  const controlMessage = {
    type: 'control',
    message: {
      type: 'sync-info',
      inboxAddress: inboxKey.address,
      messageCount,
      memberCount,
    },
  };

  const hubKeypair = {
    publicKey: hexToNumberArray(hubKey.publicKey),
    privateKey: hexToNumberArray(hubKey.privateKey),
  };

  const inboxKeypair = {
    publicKey: hexToNumberArray(inboxKey.publicKey),
    privateKey: hexToNumberArray(inboxKey.privateKey),
  };

  logger.log('[sendSyncInfoMessage] Creating sync envelope for targetInbox:', targetInboxAddress.substring(0, 12));

  const sealedMessage = await cryptoProvider.sealSyncEnvelope(
    targetInboxAddress,
    hubKey.address,
    hubKeypair,
    inboxKeypair,
    JSON.stringify(controlMessage)
  );

  // Debug: Log the sealed message structure that will be sent over WebSocket
  logger.log('[sendSyncInfoMessage] === FINAL SEALED MESSAGE ===');
  logger.log('[sendSyncInfoMessage] sealedMessage keys:', Object.keys(sealedMessage));
  logger.log('[sendSyncInfoMessage] inbox_address:', sealedMessage.inbox_address?.substring(0, 20));
  logger.log('[sendSyncInfoMessage] hub_address:', sealedMessage.hub_address?.substring(0, 20));
  logger.log('[sendSyncInfoMessage] owner_public_key length:', sealedMessage.owner_public_key?.length);
  logger.log('[sendSyncInfoMessage] ephemeral_public_key length:', sealedMessage.ephemeral_public_key?.length);
  logger.log('[sendSyncInfoMessage] envelope length:', sealedMessage.envelope?.length);
  logger.log('[sendSyncInfoMessage] envelope first 100:', sealedMessage.envelope?.substring(0, 100));
  logger.log('[sendSyncInfoMessage] owner_signature length:', sealedMessage.owner_signature?.length);

  const finalEnvelope = JSON.stringify({ type: 'sync', ...sealedMessage });
  logger.log('[sendSyncInfoMessage] Final envelope length:', finalEnvelope.length);
  logger.log('[sendSyncInfoMessage] Final envelope first 300:', finalEnvelope.substring(0, 300));

  return finalEnvelope;
}

// ============ New Sync Protocol Functions ============

/**
 * Helper to get hub and inbox keypairs for sync operations
 */
async function getSyncKeypairs(spaceId: string) {
  const hubKey = getSpaceKey(spaceId, 'hub');
  if (!hubKey || !hubKey.address || !hubKey.privateKey || !hubKey.publicKey) {
    throw new Error('Hub key not found or incomplete for space.');
  }

  const inboxKey = getSpaceKey(spaceId, 'inbox');
  if (!inboxKey || !inboxKey.address || !inboxKey.privateKey || !inboxKey.publicKey) {
    throw new Error('Inbox key not found or incomplete for space.');
  }

  const configKey = getSpaceKey(spaceId, 'config');

  return {
    hubKey,
    inboxKey,
    configKey,
    hubKeypair: {
      publicKey: hexToNumberArray(hubKey.publicKey),
      privateKey: hexToNumberArray(hubKey.privateKey),
    },
    inboxKeypair: {
      publicKey: hexToNumberArray(inboxKey.publicKey),
      privateKey: hexToNumberArray(inboxKey.privateKey),
    },
    configKeypair: configKey
      ? {
          publicKey: hexToNumberArray(configKey.publicKey),
          privateKey: hexToNumberArray(configKey.privateKey),
        }
      : undefined,
  };
}

/**
 * Send a sync-request broadcast via hub (new protocol)
 * Uses SealHubEnvelope with type: 'group' (matches desktop SyncService)
 */
export async function sendSyncRequestMessage(
  spaceId: string,
  payload: SyncRequestPayload
): Promise<string> {
  const cryptoProvider = new NativeCryptoProvider();
  const { hubKey, hubKeypair, configKeypair } = await getSyncKeypairs(spaceId);

  const controlMessage = {
    type: 'control',
    message: payload,
  };

  // Use sealHubEnvelope for hub broadcast (matches desktop SealHubEnvelope)
  const sealedMessage = await cryptoProvider.sealHubEnvelope(
    hubKey.address,
    hubKeypair,
    JSON.stringify(controlMessage),
    configKeypair
  );

  logger.log('[sendSyncRequestMessage] === SEALED MESSAGE DEBUG ===');
  logger.log('[sendSyncRequestMessage] sealedMessage keys:', Object.keys(sealedMessage));
  logger.log('[sendSyncRequestMessage] hub_address:', sealedMessage.hub_address);
  logger.log('[sendSyncRequestMessage] hub_public_key:', sealedMessage.hub_public_key?.substring(0, 40) + '...');
  logger.log('[sendSyncRequestMessage] hub_public_key length:', sealedMessage.hub_public_key?.length);
  logger.log('[sendSyncRequestMessage] ephemeral_public_key length:', sealedMessage.ephemeral_public_key?.length);
  logger.log('[sendSyncRequestMessage] envelope length:', sealedMessage.envelope?.length);
  logger.log('[sendSyncRequestMessage] hub_signature length:', sealedMessage.hub_signature?.length);

  // Use 'group' type for WebSocket delivery (matches desktop SyncService)
  const wsEnvelope = JSON.stringify({ type: 'group', ...sealedMessage });
  logger.log('[sendSyncRequestMessage] wsEnvelope (first 500):', wsEnvelope.substring(0, 500));
  return wsEnvelope;
}

/**
 * Send a sync-info response to a specific inbox (new protocol with summary)
 */
export async function sendSyncInfoMessageV2(
  spaceId: string,
  targetInboxAddress: string,
  payload: SyncInfoPayload
): Promise<string> {
  const cryptoProvider = new NativeCryptoProvider();
  const { hubKey, hubKeypair, inboxKeypair, configKeypair } = await getSyncKeypairs(spaceId);

  const controlMessage = {
    type: 'control',
    message: payload,
  };

  const sealedMessage = await cryptoProvider.sealSyncEnvelope(
    targetInboxAddress,
    hubKey.address,
    hubKeypair,
    inboxKeypair,
    JSON.stringify(controlMessage),
    configKeypair?.publicKey
  );

  return JSON.stringify({ type: 'sync', ...sealedMessage });
}

/**
 * Send a sync-initiate message to a specific peer (new protocol)
 */
export async function sendSyncInitiateMessage(
  spaceId: string,
  targetInboxAddress: string,
  payload: SyncInitiatePayload
): Promise<string> {
  const cryptoProvider = new NativeCryptoProvider();
  const { hubKey, hubKeypair, inboxKeypair, configKeypair } = await getSyncKeypairs(spaceId);

  const controlMessage = {
    type: 'control',
    message: payload,
  };

  const sealedMessage = await cryptoProvider.sealSyncEnvelope(
    targetInboxAddress,
    hubKey.address,
    hubKeypair,
    inboxKeypair,
    JSON.stringify(controlMessage),
    configKeypair?.publicKey
  );

  return JSON.stringify({ type: 'sync', ...sealedMessage });
}

/**
 * Send a sync-manifest response (new protocol)
 */
export async function sendSyncManifestMessage(
  spaceId: string,
  targetInboxAddress: string,
  payload: SyncManifestPayload
): Promise<string> {
  const cryptoProvider = new NativeCryptoProvider();
  const { hubKey, hubKeypair, inboxKeypair, configKeypair } = await getSyncKeypairs(spaceId);

  const controlMessage = {
    type: 'control',
    message: payload,
  };

  const sealedMessage = await cryptoProvider.sealSyncEnvelope(
    targetInboxAddress,
    hubKey.address,
    hubKeypair,
    inboxKeypair,
    JSON.stringify(controlMessage),
    configKeypair?.publicKey
  );

  return JSON.stringify({ type: 'sync', ...sealedMessage });
}

/**
 * Send sync-delta messages (new protocol, may return multiple for chunking)
 */
export async function sendSyncDeltaMessages(
  spaceId: string,
  targetInboxAddress: string,
  payloads: SyncDeltaPayload[]
): Promise<string[]> {
  const cryptoProvider = new NativeCryptoProvider();
  const { hubKey, hubKeypair, inboxKeypair, configKeypair } = await getSyncKeypairs(spaceId);

  const envelopes: string[] = [];

  for (const payload of payloads) {
    const controlMessage = {
      type: 'control',
      message: payload,
    };

    const sealedMessage = await cryptoProvider.sealSyncEnvelope(
      targetInboxAddress,
      hubKey.address,
      hubKeypair,
      inboxKeypair,
      JSON.stringify(controlMessage),
      configKeypair?.publicKey
    );

    envelopes.push(JSON.stringify({ type: 'sync', ...sealedMessage }));
  }

  return envelopes;
}

// ============ Space Manifest Control Messages ============

export interface SpaceManifest {
  space_address: string;
  space_manifest: string;
  ephemeral_public_key: string;
  timestamp: number;
  owner_public_key: string;
  owner_signature: string;
}

/**
 * Send a space-manifest control message to the hub
 * This broadcasts the updated space manifest to all space members
 * Matches desktop SpaceService.submitUpdateSpace behavior
 */
export async function sendSpaceManifestMessage(
  spaceId: string,
  manifest: SpaceManifest
): Promise<string> {
  const cryptoProvider = new NativeCryptoProvider();

  logger.log('[SpaceMessageService] Sending space-manifest control message');

  // Get hub key for the space
  const hubKey = getSpaceKey(spaceId, 'hub');
  if (!hubKey) {
    logger.log('[SpaceMessageService] No hub key found for spaceId:', spaceId);
    throw new Error('Hub key not found for space. Cannot send space manifest.');
  }
  if (!hubKey.address || !hubKey.privateKey || !hubKey.publicKey) {
    throw new Error('Hub key incomplete for space.');
  }

  // Get config key for hub envelope encryption
  const configKey = getSpaceKey(spaceId, 'config');

  // Create control message payload (matches desktop format)
  const controlMessage = {
    type: 'control',
    message: {
      type: 'space-manifest',
      manifest,
    },
  };

  const hubMessagePayload = JSON.stringify(controlMessage);
  logger.log('[SpaceMessageService] Space manifest control message payload length:', hubMessagePayload.length);

  // Seal the message for hub delivery
  const hubKeypair = {
    publicKey: hexToNumberArray(hubKey.publicKey),
    privateKey: hexToNumberArray(hubKey.privateKey),
  };

  const sealedMessage = await cryptoProvider.sealHubEnvelope(
    hubKey.address,
    hubKeypair,
    hubMessagePayload,
    configKey
      ? {
          publicKey: hexToNumberArray(configKey.publicKey),
          privateKey: hexToNumberArray(configKey.privateKey),
        }
      : undefined
  );

  logger.log('[SpaceMessageService] Space manifest message sealed');

  // Wrap with type 'group' for WebSocket delivery
  const wsEnvelope = JSON.stringify({ type: 'group', ...sealedMessage });

  logger.log('[SpaceMessageService] Space manifest message prepared for WebSocket');

  return wsEnvelope;
}
