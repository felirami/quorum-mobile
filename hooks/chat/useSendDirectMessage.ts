/**
 * useSendDirectMessage - Hook for sending encrypted direct messages
 *
 * Handles:
 * - Message encryption via Double Ratchet
 * - WebSocket transport for encrypted messages
 * - Optimistic updates and local storage caching
 * - Fallback to HTTP API when encryption unavailable
 */

import { logger } from '@quilibrium/quorum-shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useStorageAdapter } from '@/context/StorageContext';
import { useAuth, useWebSocket } from '@/context';
import { getQuorumClient } from '@/services/api/quorumClient';
import { encryptionService } from '@/services/crypto/encryption-service';
import { encryptionStateStorage, type ConversationInboxKeypair } from '@/services/crypto/encryption-state-storage';
import { getDeviceKeyset } from '@/services/onboarding/secureStorage';
import { deriveAddress } from '@/services/onboarding/keyService';
import { queryKeys, bytesToHex, hexToBytes, type InitializationEnvelope } from '@quilibrium/quorum-shared';
import type { Message } from '@quilibrium/quorum-shared';

interface SendDirectMessageParams {
  conversationId: string;
  recipientAddress: string;
  text: string;
  repliesToMessageId?: string;
  /** Recipient encryption info - required for E2E encryption */
  recipientInfo?: {
    identityKey: number[];
    signedPreKey: number[];
    inboxAddress: string;
    inboxEncryptionKey: number[];
  };
  /** Pre-generated message ID and nonce (from onMutate) - internal use only */
  _messageId?: string;
  _nonce?: string;
  _createdDate?: number;
}

/**
 * Reset a DM encryption session, clearing all state.
 * Call this when messages consistently fail to decrypt.
 * After reset, the next message will establish a fresh session.
 *
 * @param conversationId - The conversation ID to reset
 */
export function resetDMSession(conversationId: string): void {
  logger.log('[E2E] Manual session reset requested for:', conversationId.substring(0, 30));
  encryptionService.resetSession(conversationId);
}

interface MessagesPage {
  messages: Message[];
  nextCursor?: string | null;
  prevCursor?: string | null;
}

interface InfiniteMessagesData {
  pages: MessagesPage[];
  pageParams: unknown[];
}

export function useSendDirectMessage() {
  const storage = useStorageAdapter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { enqueueOutbound, isConnected, subscribe } = useWebSocket();
  const apiClient = getQuorumClient();

  return useMutation({
    mutationFn: async ({
      conversationId,
      recipientAddress,
      text,
      repliesToMessageId,
      recipientInfo,
      _messageId,
      _nonce,
      _createdDate,
    }: SendDirectMessageParams): Promise<Message> => {
      logger.log('[E2E] mutationFn starting...');
      const senderId = user?.address ?? 'unknown';

      // Use pre-generated values from onMutate, or generate new ones
      const nonce = _nonce ?? 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });
      const createdDate = _createdDate ?? Date.now();
      const messageId = _messageId ?? `${nonce}-${createdDate}`;

      // Create message object
      // For DMs, both spaceId and channelId are the recipientAddress
      // This matches the query key format and how received messages are stored
      const message: Message = {
        messageId,
        channelId: recipientAddress,
        spaceId: recipientAddress,
        digestAlgorithm: 'SHA-256',
        nonce,
        createdDate,
        modifiedDate: createdDate,
        lastModifiedHash: '',
        content: {
          type: 'post',
          senderId,
          text,
          repliesToMessageId,
        },
        reactions: [],
        mentions: { memberIds: [], roleIds: [], channelIds: [] },
      };

      // E2E encryption is required for direct messages
      const hasDeviceKeys = encryptionService.hasDeviceKeys();
      const hasSession = encryptionService.hasSession(conversationId);

      // Log encryption status for debugging
      logger.log('[E2E] Encryption check:', {
        hasDeviceKeys,
        isConnected,
        hasRecipientInfo: !!recipientInfo,
        hasSession,
      });

      // Validate encryption requirements
      if (!hasDeviceKeys) {
        throw new Error('Device encryption keys not initialized. Please restart the app.');
      }

      if (!isConnected) {
        throw new Error('WebSocket not connected. Please check your connection.');
      }

      // If no session and no recipientInfo provided, try to fetch the registration
      // This handles race conditions where the UI query hasn't completed yet
      let finalRecipientInfo = recipientInfo;
      if (!finalRecipientInfo && !hasSession) {
        logger.log('[E2E] No recipientInfo provided and no session, fetching registration...');
        try {
          const registration = await apiClient.fetchUserRegistration(recipientAddress);
          if (registration) {
            const { toRecipientInfo } = await import('./useRecipientRegistration');
            finalRecipientInfo = toRecipientInfo(registration) ?? undefined;
            logger.log('[E2E] Fetched registration, recipientInfo:', !!finalRecipientInfo);
          }
        } catch (regError) {
          console.error('[E2E] Failed to fetch recipient registration:', regError);
        }
      }

      if (!finalRecipientInfo && !hasSession) {
        throw new Error('No encryption session available. Recipient registration may be missing.');
      }

      // Get our device keyset for the InitializationEnvelope
      const deviceKeyset = await getDeviceKeyset();
      if (!deviceKeyset) {
        throw new Error('Device keyset not found. Please re-register.');
      }

      // Encrypt and send via WebSocket
      await sendEncryptedMessage(
        conversationId,
        recipientAddress,
        message,
        finalRecipientInfo,  // Use finalRecipientInfo (may have been fetched above)
        enqueueOutbound,
        subscribe,
        {
          identityPublicKey: deviceKeyset.identityPublicKey,
          inboxAddress: deviceKeyset.inboxAddress,
          inboxEncryptionPublicKey: deviceKeyset.inboxEncryptionPublicKey,
        },
        senderId,
        user?.displayName
      );

      logger.log('[E2E] Message sent with encryption, id:', messageId);

      return { ...message, sendStatus: 'sent' };
    },

    onMutate: async ({
      conversationId,
      recipientAddress,
      text,
      repliesToMessageId,
    }) => {
      logger.log('[E2E] onMutate starting...');
      // Use the same query key format as useMessages hook (spaceId, channelId = recipientAddress)
      const key = queryKeys.messages.infinite(recipientAddress, recipientAddress);
      const senderId = user?.address ?? 'unknown';

      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: key });

      // Snapshot previous value
      const previousData = queryClient.getQueryData<InfiniteMessagesData>(key);

      // Create optimistic message with a proper ID (not temp) so we can match it later
      const nonce = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });
      const createdDate = Date.now();

      const optimisticMessage: Message = {
        messageId: `${nonce}-${createdDate}`,
        channelId: recipientAddress,
        spaceId: recipientAddress,
        digestAlgorithm: 'SHA-256',
        nonce,
        createdDate,
        modifiedDate: createdDate,
        lastModifiedHash: '',
        content: {
          type: 'post',
          senderId,
          text,
          repliesToMessageId,
        },
        reactions: [],
        mentions: { memberIds: [], roleIds: [], channelIds: [] },
        sendStatus: 'sending',
      };

      // Save to storage immediately with 'sending' status
      // This ensures the message persists even if the app crashes
      await storage.saveMessage(
        optimisticMessage,
        createdDate,
        recipientAddress,
        'direct',
        '',
        ''
      );
      logger.log('[E2E] Saved optimistic message to storage:', optimisticMessage.messageId);

      // Optimistically add to cache
      queryClient.setQueryData<InfiniteMessagesData>(key, (old) => {
        if (!old) {
          return {
            pages: [
              {
                messages: [optimisticMessage],
                nextCursor: null,
                prevCursor: null,
              },
            ],
            pageParams: [undefined],
          };
        }
        return {
          ...old,
          pages: old.pages.map((page, index) => {
            if (index === 0) {
              return {
                ...page,
                messages: [...page.messages, optimisticMessage],
              };
            }
            return page;
          }),
        };
      });

      return { previousData, optimisticMessage };
    },

    onError: async (err, { conversationId, recipientAddress }, context) => {
      console.error('[E2E] Mutation error:', err);

      // Mark the optimistic message as failed in cache
      if (context?.optimisticMessage) {
        const key = queryKeys.messages.infinite(recipientAddress, recipientAddress);
        const failedMessage: Message = {
          ...context.optimisticMessage,
          sendStatus: 'failed' as const,
          sendError: err instanceof Error ? err.message : 'Failed to send',
        };

        queryClient.setQueryData<InfiniteMessagesData>(key, (old) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              messages: page.messages.map((msg) =>
                msg.messageId === context.optimisticMessage.messageId
                  ? failedMessage
                  : msg
              ),
            })),
          };
        });

        // Also update storage with failed status
        await storage.saveMessage(
          failedMessage,
          failedMessage.createdDate,
          recipientAddress,
          'direct',
          '',
          ''
        );
        logger.log('[E2E] Updated message status to failed:', failedMessage.messageId);
      }
    },

    onSuccess: async (message, { conversationId, recipientAddress }, context) => {
      const key = queryKeys.messages.infinite(recipientAddress, recipientAddress);

      // The returned message has a different ID than the optimistic one
      // Use the optimistic message ID but update the status
      const sentMessage: Message = context?.optimisticMessage
        ? { ...context.optimisticMessage, sendStatus: 'sent' as const }
        : message;

      // Update cache with sent status
      queryClient.setQueryData<InfiniteMessagesData>(key, (old) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page, index) => {
            if (index === 0) {
              return {
                ...page,
                messages: page.messages.map((m) =>
                  m.messageId === context?.optimisticMessage.messageId
                    ? sentMessage
                    : m
                ),
              };
            }
            return page;
          }),
        };
      });

      // Persist to local storage with 'sent' status
      await storage.saveMessage(
        sentMessage,
        sentMessage.createdDate,
        recipientAddress,
        'direct',
        '',
        ''
      );
      logger.log('[E2E] Updated message status to sent:', sentMessage.messageId);

      // Update conversation timestamp
      const conversation = await storage.getConversation(conversationId);
      if (conversation) {
        await storage.saveConversation({
          ...conversation,
          timestamp: message.createdDate,
          lastMessageId: message.messageId,
        });
      }

      // Invalidate conversations list to update timestamp
      queryClient.invalidateQueries({
        queryKey: queryKeys.conversations.all('direct'),
      });
    },

    onSettled: (_data, err, { recipientAddress }) => {
      // Only invalidate/refetch on error - on success we've already updated cache and storage
      // Invalidating on success causes UI flicker because the query refetches from storage
      // which may temporarily not include the optimistic update
      if (err) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.messages.infinite(recipientAddress, recipientAddress),
        });
      }
    },
  });
}

/**
 * Send an encrypted message via WebSocket
 *
 * For first message (new session):
 * 1. Double Ratchet encrypt → envelope
 * 2. Wrap in InitializationEnvelope with return inbox info
 * 3. Seal with recipient's inbox_encryption_key using encryptInboxMessage
 *
 * For subsequent messages (existing session):
 * 1. Double Ratchet encrypt → envelope
 * 2. Seal with recipient's inbox_encryption_key using encryptInboxMessage
 */
async function sendEncryptedMessage(
  conversationId: string,
  recipientAddress: string,
  message: Message,
  recipientInfo:
    | {
        identityKey: number[];
        signedPreKey: number[];
        inboxAddress: string;
        inboxEncryptionKey: number[];
      }
    | undefined,
  enqueueOutbound: (prepareMessage: () => Promise<string[]>) => void,
  subscribe: (inboxAddresses: string[]) => Promise<void>,
  deviceKeyset: {
    identityPublicKey: number[];
    inboxAddress: string;
    inboxEncryptionPublicKey: number[];
    // We need inbox signing keys for the return envelope
    // For now we'll use simplified flow
  },
  userAddress: string,
  displayName?: string
): Promise<void> {
  // Import the NativeCryptoProvider for encryption
  const { NativeCryptoProvider } = await import(
    '@/services/crypto/native-provider'
  );
  const cryptoProvider = new NativeCryptoProvider();

  // For new sessions, generate the conversation inbox keypair BEFORE enqueuing
  // so we can properly subscribe to it
  let conversationInboxAddress: string | null = null;
  let conversationInboxKeypair: { public_key: number[]; private_key: number[] } | null = null;
  let conversationSigningKeypair: { public_key: number[]; private_key: number[] } | null = null;

  if (recipientInfo) {
    // === NEW SESSION: Generate inbox keypairs first ===
    // X448 for encryption, Ed448 for signing (matches desktop's InboxKeyset structure)
    conversationInboxKeypair = await cryptoProvider.generateX448();
    conversationSigningKeypair = await cryptoProvider.generateEd448();
    // IMPORTANT: Derive address from Ed448 signing key (not X448 encryption key)
    // This matches device inbox derivation and allows proper signature verification for inbox operations
    conversationInboxAddress = deriveAddress(new Uint8Array(conversationSigningKeypair.public_key));

    // Store the conversation inbox keypair (both encryption and signing keys)
    const storedKeypair: ConversationInboxKeypair = {
      conversationId,
      inboxAddress: conversationInboxAddress,
      encryptionPublicKey: conversationInboxKeypair.public_key,
      encryptionPrivateKey: conversationInboxKeypair.private_key,
      signingPublicKey: conversationSigningKeypair.public_key,
      signingPrivateKey: conversationSigningKeypair.private_key,
    };
    encryptionStateStorage.saveConversationInboxKeypair(storedKeypair);
    logger.log('[E2E] Generated conversation-specific inbox:', conversationInboxAddress.substring(0, 12));

    // Save inbox mapping for the conversation inbox (1:1 mapping, no collision)
    encryptionStateStorage.saveInboxMapping(conversationInboxAddress, conversationId);

    // CRITICAL: Subscribe to the conversation inbox BEFORE sending
    // This ensures we're listening when the reply arrives
    logger.log('[E2E] Subscribing to conversation inbox:', conversationInboxAddress.substring(0, 12));
    await subscribe([conversationInboxAddress]);
    logger.log('[E2E] Subscribed to conversation inbox successfully');
  }

  enqueueOutbound(async () => {
    const outbounds: string[] = [];

    if (recipientInfo && conversationInboxAddress && conversationInboxKeypair) {
      // === NEW SESSION: First message ===
      const inboxAddress = recipientInfo.inboxAddress;

      // Step 1: Double Ratchet encrypt the message
      // Pass the conversation-specific inbox where replies will arrive
      const encrypted = await encryptionService.encryptMessage(
        conversationId,
        {
          address: recipientAddress,
          identityKey: recipientInfo.identityKey,
          signedPreKey: recipientInfo.signedPreKey,
          inboxAddress: recipientInfo.inboxAddress,
          inboxEncryptionKey: recipientInfo.inboxEncryptionKey, // For sealing future messages
        },
        JSON.stringify(message),
        conversationInboxAddress  // Our conversation-specific inbox where replies will arrive
      );

      // Step 2: Create InitializationEnvelope with return inbox info
      // NOTE: Desktop does NOT include ephemeral_public_key inside the InitializationEnvelope!
      // The ephemeral_public_key goes at the TOP LEVEL of the SealedMessage, and the SAME
      // ephemeral key is used for BOTH sealing and X3DH.
      //
      // The encryption result contains the X3DH ephemeral key that was used for the Double Ratchet.
      // We need to use THAT SAME KEY for sealing the envelope.
      const x3dhEphemeralKey = encrypted.ephemeralPublicKey;
      if (!x3dhEphemeralKey || x3dhEphemeralKey.length === 0) {
        throw new Error('X3DH ephemeral key not returned from encryption');
      }

      // Convert to proper format
      const x3dhEphemeralKeyBytes = Array.isArray(x3dhEphemeralKey)
        ? x3dhEphemeralKey
        : hexToBytes(x3dhEphemeralKey);
      const x3dhEphemeralKeyHex = Array.isArray(x3dhEphemeralKey)
        ? bytesToHex(x3dhEphemeralKey)
        : x3dhEphemeralKey;

      // IMPORTANT: return_inbox_public_key and return_inbox_private_key are Ed448 signing keys
      // (not X448 encryption keys) to match desktop's InboxKeyset structure
      const initEnvelope: InitializationEnvelope = {
        user_address: userAddress,
        display_name: displayName || userAddress,  // Use display name if available, fallback to address
        return_inbox_address: conversationInboxAddress,
        return_inbox_encryption_key: bytesToHex(conversationInboxKeypair.public_key),
        // Ed448 signing public key (for verification by recipient)
        return_inbox_public_key: conversationSigningKeypair
          ? bytesToHex(conversationSigningKeypair.public_key)
          : '',
        // Ed448 signing private key (shared with recipient so they can sign replies)
        return_inbox_private_key: conversationSigningKeypair
          ? bytesToHex(conversationSigningKeypair.private_key)
          : '',
        identity_public_key: bytesToHex(deviceKeyset.identityPublicKey),
        // NOTE: ephemeral_public_key is NOT included inside InitializationEnvelope per desktop impl
        tag: conversationInboxAddress,
        message: encrypted.envelope,
        type: 'direct',
      };

      logger.log('[E2E] Created InitializationEnvelope:', {
        user_address: initEnvelope.user_address,
        display_name: initEnvelope.display_name,
        return_inbox_address: initEnvelope.return_inbox_address,
        return_inbox_encryption_key_length: initEnvelope.return_inbox_encryption_key?.length,
        return_inbox_public_key_length: initEnvelope.return_inbox_public_key?.length,
        return_inbox_private_key_length: initEnvelope.return_inbox_private_key?.length,
        identity_public_key_length: initEnvelope.identity_public_key?.length,
        tag: initEnvelope.tag,
        type: initEnvelope.type,
        message_preview: initEnvelope.message.substring(0, 50) + '...',
      });

      // Step 3: Convert to bytes and seal with recipient's inbox encryption key
      // CRITICAL: Use the SAME ephemeral key for sealing that was used for X3DH!
      // This is what desktop does - one ephemeral key for both purposes.
      const textEncoder = new TextEncoder();
      const envelopeBytes = Array.from(textEncoder.encode(JSON.stringify(initEnvelope)));

      // Get the X3DH ephemeral PRIVATE key directly from the encryption result
      // This is the same key used for X3DH session establishment
      const ephemeralPrivateKey = encrypted.ephemeralPrivateKey;
      if (!ephemeralPrivateKey || ephemeralPrivateKey.length === 0) {
        throw new Error('X3DH ephemeral private key not returned from encryption');
      }

      // ephemeralPrivateKey is already number[] from encryptMessage
      const ephemeralPrivateKeyBytes = ephemeralPrivateKey;

      // Encrypt with recipient's inbox encryption key using the X3DH ephemeral key
      const sealedEnvelope = await cryptoProvider.encryptInboxMessage({
        inbox_public_key: recipientInfo.inboxEncryptionKey,
        ephemeral_private_key: ephemeralPrivateKeyBytes,
        plaintext: envelopeBytes,
      });

      // Use the X3DH ephemeral public key for the sealed message
      const ephemeralPublicKeyHex = x3dhEphemeralKeyHex;

      logger.log('[E2E] sealedEnvelope type:', typeof sealedEnvelope);
      logger.log('[E2E] sealedEnvelope (first 500):', sealedEnvelope.substring(0, 500));
      logger.log('[E2E] sealedEnvelope starts with quote:', sealedEnvelope.startsWith('"'));
      logger.log('[E2E] sealedEnvelope starts with brace:', sealedEnvelope.startsWith('{'));

      // Check if the sealedEnvelope is properly formatted JSON with expected fields
      try {
        const testParse = JSON.parse(sealedEnvelope);
        logger.log('[E2E] sealedEnvelope parsed keys:', Object.keys(testParse));
      } catch (e) {
        logger.log('[E2E] sealedEnvelope is not valid JSON:', e);
      }

      logger.log('[E2E] Sealed envelope with inbox encryption');

      // Build the sealed message
      const sealedMessage = {
        type: 'direct',
        inbox_address: inboxAddress,
        ephemeral_public_key: ephemeralPublicKeyHex,
        envelope: sealedEnvelope,
        inbox_public_key: '',  // Empty for first message
        inbox_signature: '',   // Empty for first message
      };

      logger.log('[E2E] Sending sealed message (new session):', {
        inbox_address: sealedMessage.inbox_address,
        ephemeral_public_key: sealedMessage.ephemeral_public_key.substring(0, 20) + '...',
        envelope_preview: sealedMessage.envelope.substring(0, 50) + '...',
      });
      outbounds.push(JSON.stringify(sealedMessage));
    } else {
      // === EXISTING SESSION: Subsequent message ===
      // Use latestState to find the correct encryption state
      // This is the authoritative source for which inbox has the current session
      const latestState = encryptionStateStorage.getLatestState(conversationId);
      if (!latestState) {
        throw new Error('No encryption session found for conversation');
      }

      logger.log('[E2E] Using latestState for existing session:', {
        inboxId: latestState.inboxId.substring(0, 12),
        timestamp: latestState.timestamp,
      });

      const encryptionState = encryptionStateStorage.getEncryptionState(
        conversationId,
        latestState.inboxId
      );

      if (!encryptionState) {
        throw new Error('Encryption state not found for inbox: ' + latestState.inboxId.substring(0, 12));
      }

      // Step 1: Double Ratchet encrypt using state from latestState
      const encrypted = await encryptWithExistingSession(
        conversationId,
        latestState.inboxId,
        JSON.stringify(message)
      );

      // Check if we have sendingInbox info for proper sealing
      // If sendingInbox.inbox_public_key is empty, we haven't confirmed the session yet
      // and need to send with InitializationEnvelope (like desktop's DoubleRatchetInboxEncryptForceSenderInit)
      const sendingInbox = encryptionState.sendingInbox;
      const needsInitEnvelope = !sendingInbox || sendingInbox.inbox_public_key === '';

      if (needsInitEnvelope && sendingInbox?.inbox_encryption_key) {
        // === Unconfirmed session: Wrap in InitializationEnvelope ===
        // This is like desktop's DoubleRatchetInboxEncryptForceSenderInit
        logger.log('[E2E] Sending with InitializationEnvelope (session not confirmed yet)');

        // Get our conversation inbox keypair (for return address)
        const ourConversationInbox = encryptionStateStorage.getConversationInboxKeypair(conversationId);

        // CRITICAL: Use the SAME X3DH ephemeral key that was used for session establishment.
        // The receiver will do X3DH with this ephemeral key to derive the session key.
        // If we use a different ephemeral key, the receiver gets a different session key
        // and the Double Ratchet decrypt will fail.
        let ephemeralPrivateKeyBytes: number[];
        let ephemeralPublicKeyHex: string;

        if (encryptionState.x3dhEphemeralPublicKey && encryptionState.x3dhEphemeralPrivateKey) {
          // Reuse stored X3DH ephemeral key
          logger.log('[E2E] Reusing stored X3DH ephemeral key:', encryptionState.x3dhEphemeralPublicKey.substring(0, 20) + '...');
          ephemeralPublicKeyHex = encryptionState.x3dhEphemeralPublicKey;
          ephemeralPrivateKeyBytes = hexToBytes(encryptionState.x3dhEphemeralPrivateKey);
        } else {
          // Fallback: Generate new ephemeral key and SAVE it for subsequent messages
          // This handles sessions created before the ephemeral key storage fix
          logger.log('[E2E] No stored X3DH ephemeral key, generating and saving new one');
          const sealingEphemeralKey = await cryptoProvider.generateX448();
          ephemeralPrivateKeyBytes = sealingEphemeralKey.private_key;
          ephemeralPublicKeyHex = bytesToHex(sealingEphemeralKey.public_key);

          // Save to encryption state for future messages
          const updatedState = {
            ...encryptionState,
            x3dhEphemeralPublicKey: ephemeralPublicKeyHex,
            x3dhEphemeralPrivateKey: bytesToHex(ephemeralPrivateKeyBytes),
          };
          encryptionStateStorage.saveEncryptionState(updatedState, false);
          logger.log('[E2E] Saved ephemeral key to state:', ephemeralPublicKeyHex.substring(0, 20) + '...');
        }

        // Build the InitializationEnvelope (NO ephemeral_public_key inside!)
        // IMPORTANT: return_inbox_public_key and return_inbox_private_key are Ed448 signing keys
        // (not X448 encryption keys) to match desktop's InboxKeyset structure
        const initEnvelope: InitializationEnvelope = {
          user_address: userAddress,
          display_name: displayName || userAddress,  // Use display name if available, fallback to address
          return_inbox_address: ourConversationInbox?.inboxAddress || deviceKeyset.inboxAddress,
          return_inbox_encryption_key: ourConversationInbox
            ? bytesToHex(ourConversationInbox.encryptionPublicKey)
            : bytesToHex(deviceKeyset.inboxEncryptionPublicKey),
          // Ed448 signing public key (for verification)
          return_inbox_public_key: ourConversationInbox?.signingPublicKey
            ? bytesToHex(ourConversationInbox.signingPublicKey)
            : '',
          // Ed448 signing private key (shared with recipient for their future signatures)
          // This allows the recipient to verify messages from us
          return_inbox_private_key: ourConversationInbox?.signingPrivateKey
            ? bytesToHex(ourConversationInbox.signingPrivateKey)
            : '',
          identity_public_key: bytesToHex(deviceKeyset.identityPublicKey),
          // NOTE: ephemeral_public_key is NOT in InitializationEnvelope!
          tag: ourConversationInbox?.inboxAddress || deviceKeyset.inboxAddress,
          message: encrypted.envelope,
          type: 'direct',
        };

        logger.log('[E2E] Created InitializationEnvelope for existing session:', {
          user_address: initEnvelope.user_address,
          display_name: initEnvelope.display_name,
          return_inbox_address: initEnvelope.return_inbox_address.substring(0, 12),
          sendingTo: sendingInbox.inbox_address.substring(0, 12),
        });

        // Seal with recipient's inbox encryption key using the X3DH ephemeral key
        const textEncoder = new TextEncoder();
        const envelopeBytes = Array.from(textEncoder.encode(JSON.stringify(initEnvelope)));

        // Parse the recipient's inbox encryption key from hex
        const recipientInboxEncryptionKey = hexToBytes(sendingInbox.inbox_encryption_key);

        // Encrypt with recipient's inbox encryption key using the SAME X3DH ephemeral key
        const sealedEnvelope = await cryptoProvider.encryptInboxMessage({
          inbox_public_key: recipientInboxEncryptionKey,
          ephemeral_private_key: ephemeralPrivateKeyBytes,
          plaintext: envelopeBytes,
        });

        // Use the X3DH ephemeral public key at the TOP LEVEL of SealedMessage
        const sealedMessage = {
          type: 'direct',
          inbox_address: sendingInbox.inbox_address,
          ephemeral_public_key: ephemeralPublicKeyHex,  // SAME key used for sealing and X3DH
          envelope: sealedEnvelope,
          inbox_public_key: '',
          inbox_signature: '',
        };

        logger.log('[E2E] Sending sealed message (existing session, init envelope):', {
          inbox_address: sealedMessage.inbox_address.substring(0, 12),
          ephemeral_key: sealedMessage.ephemeral_public_key.substring(0, 20) + '...',
        });
        outbounds.push(JSON.stringify(sealedMessage));
      } else if (sendingInbox?.inbox_address) {
        // === Confirmed session with known sendingInbox: Send to per-conversation inbox ===
        // The sendingInbox.inbox_address is the recipient's per-conversation inbox
        // where they receive messages for this specific conversation
        logger.log('[E2E] Sending to per-conversation inbox (session confirmed)');

        // Generate ephemeral key for sealing
        const sealingEphemeralKey = await cryptoProvider.generateX448();

        // Parse the recipient's inbox encryption key from hex
        const recipientInboxEncryptionKey = hexToBytes(sendingInbox.inbox_encryption_key);

        // Seal the Double Ratchet envelope with recipient's inbox encryption key
        const textEncoder = new TextEncoder();
        const envelopeBytes = Array.from(textEncoder.encode(encrypted.envelope));

        const sealedEnvelope = await cryptoProvider.encryptInboxMessage({
          inbox_public_key: recipientInboxEncryptionKey,
          ephemeral_private_key: sealingEphemeralKey.private_key,
          plaintext: envelopeBytes,
        });

        const existingSessionMsg = {
          type: 'direct',
          inbox_address: sendingInbox.inbox_address,  // Send to per-conversation inbox!
          envelope: sealedEnvelope,
          ephemeral_public_key: bytesToHex(sealingEphemeralKey.public_key),
          inbox_public_key: '',
          inbox_signature: '',
        };
        logger.log('[E2E] Sending message (existing session, sealed):', {
          inbox_address: existingSessionMsg.inbox_address.substring(0, 12),
          ephemeral_public_key: existingSessionMsg.ephemeral_public_key.substring(0, 20) + '...',
        });
        outbounds.push(JSON.stringify(existingSessionMsg));
      } else {
        // No sendingInbox - this shouldn't happen for established sessions
        console.error('[E2E] No sendingInbox for existing session - cannot send');
        throw new Error('No sendingInbox available for sending');
      }
    }

    return outbounds;
  });
}

/**
 * Encrypt a message using an existing session
 */
async function encryptWithExistingSession(
  conversationId: string,
  inboxAddress: string,
  plaintext: string
): Promise<{ envelope: string; ephemeralPublicKey: string }> {
  const encryptionState = encryptionStateStorage.getEncryptionState(
    conversationId,
    inboxAddress
  );

  if (!encryptionState) {
    throw new Error('No encryption state found');
  }

  // Use the encryption service's internal encrypt method
  // Since we have an existing session, we don't need recipient info
  const textEncoder = new TextEncoder();
  const messageBytes = Array.from(textEncoder.encode(plaintext));

  // Import the NativeCryptoProvider directly for this operation
  const { NativeCryptoProvider } = await import(
    '@/services/crypto/native-provider'
  );
  const cryptoProvider = new NativeCryptoProvider();

  // Extract ephemeral public key from the ratchet state
  // The ratchet_state contains sending_ephemeral_private_key which we need to derive the public key from
  // Parse the ratchet state (it's always stored as a JSON string)
  let ratchetState: Record<string, unknown>;
  logger.log('[E2E] Encryption state type:', typeof encryptionState.state, 'starts with:',
    encryptionState.state.substring(0, 50));

  // Check for corrupted state
  let stateStr = encryptionState.state;
  if (stateStr === '[object Object]') {
    throw new Error(`Corrupted encryption state: ${stateStr.substring(0, 50)}`);
  }
  // Handle double-escaped JSON (starts with {\" which appears as {\\ in JS)
  // This happens when JSON was stringified twice
  if (stateStr.includes('\\"') || stateStr.includes('\\\\')) {
    logger.log('[E2E] State appears double-escaped, unescaping');
    // Unescape: \" -> " and \\ -> \
    stateStr = stateStr.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
  if (!stateStr.startsWith('{')) {
    throw new Error(`Corrupted encryption state: ${stateStr.substring(0, 50)}`);
  }
  ratchetState = JSON.parse(stateStr) as Record<string, unknown>;
  const sendingEphemeralPrivateKey = ratchetState.sending_ephemeral_private_key as string | number[];

  // The key is stored as base64 string in the ratchet state
  // If it's somehow a byte array, convert it
  const privateKeyBase64 = typeof sendingEphemeralPrivateKey === 'string'
    ? sendingEphemeralPrivateKey
    : btoa(String.fromCharCode(...sendingEphemeralPrivateKey));

  // Get the public key from the private key (expects base64, returns base64)
  const publicKeyBase64 = await cryptoProvider.getPublicKeyX448(privateKeyBase64);

  // Convert base64 result to hex for the message
  const publicKeyBytes = atob(publicKeyBase64);
  const ephemeralPublicKey = Array.from(publicKeyBytes)
    .map((c) => c.charCodeAt(0).toString(16).padStart(2, '0'))
    .join('');

  // Pass the properly parsed state to the native module
  // The native module will handle it as an object (we fixed native-provider to parse strings)
  const result = await cryptoProvider.doubleRatchetEncrypt({
    ratchet_state: JSON.stringify(ratchetState), // Re-stringify the parsed state to ensure clean JSON
    message: messageBytes,
  });

  // Save updated state - preserve sendingInbox and tag
  // The inboxAddress is OUR receiving inbox (not where we send TO)
  encryptionStateStorage.saveEncryptionState({
    state: result.ratchet_state,
    timestamp: Date.now(),
    conversationId,
    inboxId: inboxAddress, // Our receiving inbox
    sentAccept: encryptionState.sentAccept,
    sendingInbox: encryptionState.sendingInbox, // Preserve where to send
    tag: encryptionState.tag,
  }, true);

  return { envelope: result.envelope, ephemeralPublicKey };
}

/**
 * Hook to get query key for direct messages
 * Use with useMessages or custom query
 */
export function useDirectMessagesKey(recipientAddress: string | undefined) {
  return recipientAddress ? queryKeys.messages.infinite(recipientAddress, recipientAddress) : null;
}
