/**
 * useSpaceActions - Hooks for space creation, joining, and invite validation
 *
 * Provides:
 * - useCreateSpace: Mutation to create a new space
 * - useJoinSpace: Mutation to join an existing space via invite link
 * - useValidateInvite: Query to validate and preview an invite link
 */

import { logger } from '@quilibrium/quorum-shared';
import { useAuth } from '@/context';
import { getQuorumClient } from '@/services/api/quorumClient';
import { saveSpace, saveSpaceKey } from '@/services/config/spaceStorage';
import { encryptionStateStorage } from '@/services/crypto/encryption-state-storage';
import { NativeCryptoProvider } from '@/services/crypto/native-provider';
import { getDeviceKeyset } from '@/services/onboarding/secureStorage';
import { getMMKVAdapter } from '@/services/storage/mmkvAdapter';
import { sha256 } from '@noble/hashes/sha2';
import { bytesToHex, hexToBytes, type Space } from '@quilibrium/quorum-shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import bs58 from 'bs58';
import * as multihashes from 'multihashes';
import { useEffect, useState } from 'react';

// Valid invite link prefixes
const VALID_INVITE_PREFIXES = [
  'https://quorummessenger.com/i/',
  'https://www.quorummessenger.com/i/',
  'http://localhost:3000/i/',
  'quorummessenger.com/i/',
];

interface ValidatedSpace {
  iconUrl: string;
  spaceName: string;
  spaceId: string;
  description?: string;
}

interface InviteInfo {
  spaceId: string;
  configKey: string;
  template?: string;
  secret?: string;
  hubKey?: string;
}

interface CreateSpaceParams {
  name: string;
  description?: string;
  iconData?: string; // Base64 image data
  isRepudiable?: boolean;
  isPublic?: boolean;
}

interface CreateSpaceResult {
  spaceId: string;
  channelId: string;
  inboxAddress: string; // Space inbox address for WebSocket subscription
}

interface JoinSpaceParams {
  inviteLink: string;
}

interface JoinSpaceResult {
  spaceId: string;
  channelId: string;
  inboxAddress: string; // Space inbox address for WebSocket subscription
  joinMessageEnvelope?: string; // Optional join control message to send via WebSocket
}

/**
 * Derive address from public key using multihash
 */
function deriveAddress(publicKeyBytes: Uint8Array): string {
  const hash = sha256(publicKeyBytes);
  const mhash = multihashes.encode(hash, 'sha2-256');
  return bs58.encode(mhash);
}

/**
 * Parse invite link to extract space info
 */
function parseInviteLink(inviteLink: string): InviteInfo | null {
  const trimmed = inviteLink.trim();

  // Check if it matches any valid prefix
  const matchingPrefix = VALID_INVITE_PREFIXES.find((prefix) =>
    trimmed.startsWith(prefix)
  );

  if (!matchingPrefix && !trimmed.includes('#')) {
    return null;
  }

  // Extract hash content
  const hashContent = trimmed.split('#')[1];
  if (!hashContent) {
    return null;
  }

  // Parse parameters
  const params: Record<string, string> = {};
  hashContent.split('&').forEach((part) => {
    const [key, value] = part.split('=');
    if (key && value) {
      params[key] = value;
    }
  });

  if (params.spaceId && params.configKey) {
    return {
      spaceId: params.spaceId,
      configKey: params.configKey,
      template: params.template,
      secret: params.secret,
      hubKey: params.hubKey,
    };
  }

  return null;
}

/**
 * Convert number array to base64 string
 */
function numberArrayToBase64(arr: number[]): string {
  const uint8 = new Uint8Array(arr);
  let binary = '';
  for (let i = 0; i < uint8.length; i++) {
    binary += String.fromCharCode(uint8[i]);
  }
  return btoa(binary);
}

/**
 * Convert base64 string to hex
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
 * Hook to validate an invite link and preview the space
 */
export function useValidateInvite(inviteLink: string | undefined) {
  const [debouncedLink, setDebouncedLink] = useState<string | undefined>();

  // Debounce the invite link to avoid too many API calls
  useEffect(() => {
    if (!inviteLink || inviteLink.trim().length < 10) {
      setDebouncedLink(undefined);
      return;
    }

    const timer = setTimeout(() => {
      setDebouncedLink(inviteLink);
    }, 500);

    return () => clearTimeout(timer);
  }, [inviteLink]);

  return useQuery({
    queryKey: ['validateInvite', debouncedLink],
    queryFn: async (): Promise<ValidatedSpace | null> => {
      if (!debouncedLink) return null;

      const inviteInfo = parseInviteLink(debouncedLink);
      if (!inviteInfo) {
        throw new Error('Invalid invite link format');
      }

      const client = getQuorumClient();
      const manifest = await client.getSpaceManifest(inviteInfo.spaceId);

      if (!manifest || !manifest.space_manifest) {
        throw new Error('Could not fetch space info');
      }

      // Parse the encrypted manifest
      const ciphertext = JSON.parse(manifest.space_manifest) as {
        ciphertext: string;
        initialization_vector: string;
        associated_data?: string;
      };

      // Decrypt using config key
      const cryptoProvider = new NativeCryptoProvider();
      const configPrivateKeyBytes = hexToBytes(inviteInfo.configKey);
      const ephemeralPublicKeyBytes = hexToBytes(manifest.ephemeral_public_key);

      const decryptResult = await cryptoProvider.decryptInboxMessage({
        inbox_private_key: configPrivateKeyBytes,
        ephemeral_public_key: ephemeralPublicKeyBytes,
        ciphertext: {
          ciphertext: ciphertext.ciphertext,
          initialization_vector: ciphertext.initialization_vector,
          associated_data: ciphertext.associated_data,
        },
      });

      const space = JSON.parse(
        new TextDecoder().decode(new Uint8Array(decryptResult))
      ) as Space;

      return {
        iconUrl: space.iconUrl,
        spaceName: space.spaceName,
        spaceId: space.spaceId,
        description: space.description,
      };
    },
    enabled: !!debouncedLink && debouncedLink.trim().length >= 10,
    retry: false,
    staleTime: 60000, // Cache for 1 minute
  });
}

/**
 * Hook to join a space via invite link
 */
export function useJoinSpace() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (params: JoinSpaceParams): Promise<JoinSpaceResult> => {
      const inviteInfo = parseInviteLink(params.inviteLink);
      if (!inviteInfo) {
        throw new Error('Invalid invite link');
      }

      const client = getQuorumClient();
      const cryptoProvider = new NativeCryptoProvider();

      // 1. Fetch and decrypt space manifest
      const manifest = await client.getSpaceManifest(inviteInfo.spaceId);
      if (!manifest || !manifest.space_manifest) {
        throw new Error('Could not fetch space manifest');
      }

      const ciphertext = JSON.parse(manifest.space_manifest) as {
        ciphertext: string;
        initialization_vector: string;
        associated_data?: string;
      };

      const configPrivateKeyBytes = hexToBytes(inviteInfo.configKey);
      const ephemeralPublicKeyBytes = hexToBytes(manifest.ephemeral_public_key);

      const decryptResult = await cryptoProvider.decryptInboxMessage({
        inbox_private_key: configPrivateKeyBytes,
        ephemeral_public_key: ephemeralPublicKeyBytes,
        ciphertext: {
          ciphertext: ciphertext.ciphertext,
          initialization_vector: ciphertext.initialization_vector,
          associated_data: ciphertext.associated_data,
        },
      });

      const space = JSON.parse(
        new TextDecoder().decode(new Uint8Array(decryptResult))
      ) as Space;

      // 2. Save the space (both storages for compatibility)
      saveSpace(space);
      // Also save to mmkvAdapter so useSpaces hook can find it
      const adapter = getMMKVAdapter();
      await adapter.saveSpace(space);

      // 3. Save config key - derive public key from private key
      const cfgPrivKeyBytes = hexToBytes(inviteInfo.configKey);
      const cfgPrivKeyBase64 = btoa(String.fromCharCode(...cfgPrivKeyBytes));
      const cfgPubKeyBase64 = await cryptoProvider.getPublicKeyX448(cfgPrivKeyBase64);
      const cfgPubKeyBinary = atob(cfgPubKeyBase64);
      let cfgPubKeyHex = '';
      for (let i = 0; i < cfgPubKeyBinary.length; i++) {
        cfgPubKeyHex += cfgPubKeyBinary.charCodeAt(i).toString(16).padStart(2, '0');
      }

      saveSpaceKey({
        spaceId: space.spaceId,
        keyId: 'config',
        publicKey: cfgPubKeyHex,
        privateKey: inviteInfo.configKey,
      });
      logger.log('[JoinSpace] Saved config key with derived public key, length:', cfgPubKeyHex.length);

      // 4. Save hub key if provided
      if (inviteInfo.hubKey) {
        // Derive hub public key from private key
        const hubPrivateKeyBytes = hexToBytes(inviteInfo.hubKey);
        const hubPrivateKeyBase64 = btoa(String.fromCharCode(...hubPrivateKeyBytes));
        const hubPublicKeyBase64 = await cryptoProvider.getPublicKeyEd448(hubPrivateKeyBase64);

        // Convert base64 public key to hex
        const hubPublicKeyBinary = atob(hubPublicKeyBase64);
        let hubPublicKeyHex = '';
        for (let i = 0; i < hubPublicKeyBinary.length; i++) {
          hubPublicKeyHex += hubPublicKeyBinary.charCodeAt(i).toString(16).padStart(2, '0');
        }

        saveSpaceKey({
          spaceId: space.spaceId,
          keyId: 'hub',
          address: space.hubAddress,
          publicKey: hubPublicKeyHex,
          privateKey: inviteInfo.hubKey,
        });

        logger.log('[JoinSpace] Saved hub key with derived public key');
      }

      // 5. Generate inbox keypair for this space
      const inboxKeypair = await cryptoProvider.generateEd448();
      const inboxAddress = deriveAddress(new Uint8Array(inboxKeypair.public_key));

      saveSpaceKey({
        spaceId: space.spaceId,
        keyId: 'inbox',
        address: inboxAddress,
        publicKey: bytesToHex(new Uint8Array(inboxKeypair.public_key)),
        privateKey: bytesToHex(new Uint8Array(inboxKeypair.private_key)),
      });

      // 6. Register inbox with hub if we have hub key
      if (inviteInfo.hubKey && space.hubAddress) {
        try {
          // Get hub public key (we derived it in step 4)
          const hubPrivateKeyBytes = hexToBytes(inviteInfo.hubKey);
          const hubPrivateKeyBase64 = btoa(String.fromCharCode(...hubPrivateKeyBytes));
          const hubPublicKeyBase64 = await cryptoProvider.getPublicKeyEd448(hubPrivateKeyBase64);
          const hubPublicKeyBinary = atob(hubPublicKeyBase64);
          let hubPublicKeyHex = '';
          for (let i = 0; i < hubPublicKeyBinary.length; i++) {
            hubPublicKeyHex += hubPublicKeyBinary.charCodeAt(i).toString(16).padStart(2, '0');
          }

          const inboxPublicKeyHex = bytesToHex(new Uint8Array(inboxKeypair.public_key));

          // Hub signature: sign("add" + inbox_public_key_hex)
          const addInboxMessage = 'add' + inboxPublicKeyHex;
          const addInboxMessageBytes = new TextEncoder().encode(addInboxMessage);
          const addInboxMessageBase64 = btoa(String.fromCharCode(...addInboxMessageBytes));
          const hubSignatureBase64 = await cryptoProvider.signEd448(
            hubPrivateKeyBase64,
            addInboxMessageBase64
          );
          const hubSignatureHex = base64ToHex(hubSignatureBase64);

          // Inbox signature: sign("add" + hub_public_key_hex)
          const addHubMessage = 'add' + hubPublicKeyHex;
          const addHubMessageBytes = new TextEncoder().encode(addHubMessage);
          const addHubMessageBase64 = btoa(String.fromCharCode(...addHubMessageBytes));
          const inboxPrivateKeyBase64 = numberArrayToBase64(inboxKeypair.private_key);
          const inboxSignatureBase64 = await cryptoProvider.signEd448(
            inboxPrivateKeyBase64,
            addHubMessageBase64
          );
          const inboxSignatureHex = base64ToHex(inboxSignatureBase64);

          // Register inbox with hub
          await client.postHubAdd({
            hub_address: space.hubAddress,
            hub_public_key: hubPublicKeyHex,
            hub_signature: hubSignatureHex,
            inbox_public_key: inboxPublicKeyHex,
            inbox_signature: inboxSignatureHex,
          });

          logger.log('[JoinSpace] Inbox registered with hub successfully');
        } catch (e) {
          logger.log('[JoinSpace] Hub registration failed:', e);
          // Continue without hub registration - can still send but won't receive
        }
      } else {
        logger.warn('[JoinSpace] Skipping hub registration - missing hubKey or hubAddress');
      }

      // 6.5. Save joiner as a member of the space
      if (user?.address) {
        await adapter.saveSpaceMember(space.spaceId, {
          address: user.address,
          display_name: user.displayName || user.username,
          profile_image: user.profileImage,
          inbox_address: inboxAddress,
        });
        logger.log('[JoinSpace] Joiner saved as space member');
      }

      // 7. Process template and secret to build proper encryption state
      if (inviteInfo.template && inviteInfo.secret) {
        try {
          const conversationId = `${space.spaceId}/${space.spaceId}`;
          logger.log('[JoinSpace] Processing template/secret for conversationId:', conversationId);
          logger.log('[JoinSpace] Template hex length:', inviteInfo.template.length);
          logger.log('[JoinSpace] Secret hex length:', inviteInfo.secret.length);

          // Decode template from hex to JSON (matches desktop InvitationService line 662-664)
          const templateHex = inviteInfo.template;
          let templateJson = '';
          for (let i = 0; i < templateHex.length; i += 2) {
            templateJson += String.fromCharCode(parseInt(templateHex.substring(i, i + 2), 16));
          }
          logger.log('[JoinSpace] Decoded template JSON length:', templateJson.length);
          logger.log('[JoinSpace] Template JSON preview:', templateJson.substring(0, 200));

          const template = JSON.parse(templateJson);
          logger.log('[JoinSpace] Parsed template keys:', Object.keys(template));

          // Log peer_id_map to debug AEAD errors
          if (template.peer_id_map) {
            logger.log('[JoinSpace] peer_id_map keys (base64):', Object.keys(template.peer_id_map));
            logger.log('[JoinSpace] peer_id_map entries:', Object.entries(template.peer_id_map).length);
          } else {
            logger.warn('[JoinSpace] No peer_id_map in template!');
          }
          if (template.id_peer_map) {
            logger.log('[JoinSpace] id_peer_map keys:', Object.keys(template.id_peer_map));
          } else {
            logger.warn('[JoinSpace] No id_peer_map in template!');
          }

          // Generate new keypairs for this session (matches desktop lines 681-682)
          const secretPair = await cryptoProvider.generateX448();
          const ephPair = await cryptoProvider.generateX448();

          // Parse and modify dkg_ratchet (matches desktop lines 683-708)
          const ratchet = JSON.parse(template.dkg_ratchet);
          logger.log('[JoinSpace] Original ratchet.id:', ratchet.id, 'ratchet.total:', ratchet.total);
          ratchet.total++;
          logger.log('[JoinSpace] After increment, ratchet.total:', ratchet.total);

          // Set secret from keypair
          ratchet.secret = btoa(String.fromCharCode(...secretPair.private_key));

          // Set scalar from invite secret (hex to base64)
          const secretBytes = hexToBytes(inviteInfo.secret);
          ratchet.scalar = btoa(String.fromCharCode(...secretBytes));

          // Compute point from secret (getPublicKeyX448 takes base64, returns base64)
          // The point should be a base64 string, not an array
          const secretBase64 = btoa(String.fromCharCode(...secretBytes));
          const pointBase64 = await cryptoProvider.getPublicKeyX448(secretBase64);
          // Set point as base64 string (matches desktop which does JSON.parse on the WASM result)
          ratchet.point = pointBase64;
          ratchet.random_commitment_point = pointBase64;

          // Update template with modified ratchet
          template.dkg_ratchet = JSON.stringify(ratchet);
          template.next_dkg_ratchet = JSON.stringify(ratchet);

          // Set peer_key from device's inbox encryption private key (X448)
          // This is critical for Triple Ratchet encryption to work
          const deviceKeyset = await getDeviceKeyset();
          if (!deviceKeyset) {
            logger.log('[JoinSpace] Device keyset not found - cannot set peer_key');
            throw new Error('Device keyset not found');
          }
          logger.log('[JoinSpace] Setting peer_key from device inbox encryption key, length:', deviceKeyset.inboxEncryptionPrivateKey.length);

          // Convert our public key to base64 (same format as peer_id_map keys)
          const ourPublicKeyBase64 = btoa(String.fromCharCode(...deviceKeyset.inboxEncryptionPublicKey));
          logger.log('[JoinSpace] Our inbox encryption public key (base64):', ourPublicKeyBase64);

          // Check if our key is in the peer_id_map
          if (template.peer_id_map) {
            const ourPeerId = template.peer_id_map[ourPublicKeyBase64];
            if (ourPeerId !== undefined) {
              logger.log('[JoinSpace] Our key IS in peer_id_map with ID:', ourPeerId);
            } else {
              // Our key is NOT in the peer_id_map - this is expected for generic invite links
              // We need to add ourselves with the ID from our dkg_ratchet
              const ourId = ratchet.id;
              logger.log('[JoinSpace] Adding ourselves to peer_id_map with ID:', ourId);

              // Add our entry to peer_id_map (maps our public key to our ID)
              template.peer_id_map[ourPublicKeyBase64] = ourId;

              // Add our entry to id_peer_map (maps our ID to our peer info)
              // This matches the structure from EstablishTripleRatchetSessionForSpace
              if (!template.id_peer_map) {
                template.id_peer_map = {};
              }
              template.id_peer_map[ourId] = {
                public_key: ourPublicKeyBase64,
                identity_public_key: btoa(String.fromCharCode(...deviceKeyset.identityPublicKey)),
                signed_pre_public_key: btoa(String.fromCharCode(...deviceKeyset.preKeyPublicKey)),
              };

              logger.log('[JoinSpace] peer_id_map now has entries:', Object.keys(template.peer_id_map).length);
              logger.log('[JoinSpace] id_peer_map now has entries:', Object.keys(template.id_peer_map).length);
            }
          } else {
            logger.log('[JoinSpace] No peer_id_map in template - cannot set up encryption');
          }

          template.peer_key = btoa(String.fromCharCode(...deviceKeyset.inboxEncryptionPrivateKey));

          // Set ephemeral private key - Rust expects sending_ephemeral_private_key
          logger.log('[JoinSpace] Setting sending_ephemeral_private_key, length:', ephPair.private_key.length);
          template.sending_ephemeral_private_key = btoa(String.fromCharCode(...ephPair.private_key));

          // Note: We do NOT add ourselves to receiving_ephemeral_keys
          // receiving_ephemeral_keys is used to decrypt messages FROM other participants
          // When we receive a message from the creator, the Rust code will:
          // 1. See that the sender is not in receiving_ephemeral_keys
          // 2. Call ratchet_receiver_ephemeral_keys to bootstrap their chain key
          // 3. This requires receiving_group_key to be set (which should come from template)
          logger.log('[JoinSpace] receiving_ephemeral_keys has:', template.receiving_ephemeral_keys ? Object.keys(template.receiving_ephemeral_keys).length : 0, 'entries from template');

          // Build nested session structure (matches desktop lines 709-714)
          const session = {
            state: JSON.stringify(template),
          };

          const finalState = JSON.stringify(session);
          logger.log('[JoinSpace] Final state length:', finalState.length);
          logger.log('[JoinSpace] Final state preview:', finalState.substring(0, 300));

          // Log critical fields for debugging AEAD errors
          logger.log('[JoinSpace] DEBUG template keys:', Object.keys(template));
          logger.log('[JoinSpace] DEBUG root_key exists:', !!template.root_key);
          logger.log('[JoinSpace] DEBUG root_key preview:', template.root_key?.substring?.(0, 30));
          logger.log('[JoinSpace] DEBUG root_key length:', template.root_key?.length);
          logger.log('[JoinSpace] DEBUG peer_key set to length:', template.peer_key?.length);
          logger.log('[JoinSpace] DEBUG sending_ephemeral_private_key set to length:', template.sending_ephemeral_private_key?.length);
          logger.log('[JoinSpace] DEBUG receiving_ephemeral_keys:', template.receiving_ephemeral_keys ? Object.keys(template.receiving_ephemeral_keys).length : 'MISSING');
          logger.log('[JoinSpace] DEBUG receiving_group_key exists:', !!template.receiving_group_key);
          logger.log('[JoinSpace] DEBUG receiving_group_key preview:', template.receiving_group_key?.substring?.(0, 30));
          logger.log('[JoinSpace] DEBUG sending_chain_key exists:', !!template.sending_chain_key);
          logger.log('[JoinSpace] DEBUG sending_chain_key preview:', template.sending_chain_key?.substring?.(0, 30));
          logger.log('[JoinSpace] DEBUG receiving_chain_key exists:', !!template.receiving_chain_key);
          logger.log('[JoinSpace] DEBUG receiving_chain_key entries:', template.receiving_chain_key ? Object.keys(template.receiving_chain_key).length : 'MISSING');
          logger.log('[JoinSpace] DEBUG TEMPLATE current_header_key exists:', !!template.current_header_key);
          logger.log('[JoinSpace] DEBUG TEMPLATE current_header_key FULL:', template.current_header_key);
          logger.log('[JoinSpace] DEBUG TEMPLATE current_header_key length:', template.current_header_key?.length);
          logger.log('[JoinSpace] DEBUG TEMPLATE next_header_key exists:', !!template.next_header_key);
          logger.log('[JoinSpace] DEBUG TEMPLATE next_header_key FULL:', template.next_header_key);
          logger.log('[JoinSpace] DEBUG should_ratchet:', template.should_ratchet);
          // Check async DKG fields - these affect header key changes
          logger.log('[JoinSpace] DEBUG async_dkg_ratchet:', template.async_dkg_ratchet);
          logger.log('[JoinSpace] DEBUG async_dkg_pubkey exists:', !!template.async_dkg_pubkey);
          logger.log('[JoinSpace] DEBUG should_dkg_ratchet:', template.should_dkg_ratchet ? Object.keys(template.should_dkg_ratchet).length : 'N/A');
          logger.log('[JoinSpace] DEBUG threshold:', template.threshold);
          logger.log('[JoinSpace] DEBUG dkg_ratchet.id:', ratchet.id);
          logger.log('[JoinSpace] DEBUG dkg_ratchet.total:', ratchet.total);
          logger.log('[JoinSpace] DEBUG dkg_ratchet.round:', ratchet.round);
          logger.log('[JoinSpace] DEBUG dkg_ratchet.threshold:', ratchet.threshold);
          logger.log('[JoinSpace] DEBUG dkg_ratchet.scalar preview:', ratchet.scalar?.substring?.(0, 30));
          logger.log('[JoinSpace] DEBUG dkg_ratchet.scalar length:', ratchet.scalar?.length);
          logger.log('[JoinSpace] DEBUG dkg_ratchet.point type:', typeof ratchet.point);
          logger.log('[JoinSpace] DEBUG dkg_ratchet.point preview:', JSON.stringify(ratchet.point)?.substring?.(0, 50));
          logger.log('[JoinSpace] DEBUG dkg_ratchet.secret preview:', ratchet.secret?.substring?.(0, 30));
          logger.log('[JoinSpace] DEBUG dkg_ratchet.public_key preview:', ratchet.public_key?.substring?.(0, 30));

          // Save as double-nested JSON (state contains JSON of session which contains JSON of template)
          encryptionStateStorage.saveEncryptionState({
            conversationId,
            inboxId: inboxAddress,
            state: finalState,
            timestamp: Date.now(),
          });

          // Also save as fallback state - this is the original working state before any evolution
          // Desktop may not advance its ratchet, so we need this for decrypting its messages
          logger.log('[JoinSpace] Saving initial state as fallback for future decrypts');
          encryptionStateStorage.saveFallbackState({
            conversationId,
            inboxId: inboxAddress,
            state: finalState,
            timestamp: Date.now(),
          });

          logger.log('[JoinSpace] Processed template/secret and saved encryption state');

          // 9. Prepare join control message to announce ourselves to other participants
          // This is critical for other members to be able to:
          // - Add us to their peer_id_map/id_peer_map
          // - Decrypt messages FROM us
          // - Encrypt messages TO us
          try {
            const { sendJoinMessage } = await import('@/services/space/spaceMessageService');

            // Get the inbox public key hex (Ed448)
            const inboxPubKeyHex = bytesToHex(new Uint8Array(inboxKeypair.public_key));

            // Get the X448 public key from the secret (same as we set in ratchet.point)
            const secretBytes = hexToBytes(inviteInfo.secret);
            const secretBase64 = btoa(String.fromCharCode(...secretBytes));
            const pubKeyBase64 = await cryptoProvider.getPublicKeyX448(secretBase64);
            const pubKeyBinary = atob(pubKeyBase64);
            let pubKeyHex = '';
            for (let i = 0; i < pubKeyBinary.length; i++) {
              pubKeyHex += pubKeyBinary.charCodeAt(i).toString(16).padStart(2, '0');
            }

            // Get inbox encryption public key (X448)
            const inboxKeyHex = bytesToHex(deviceKeyset.inboxEncryptionPublicKey);

            // Get identity and pre-key public keys
            const identityKeyHex = bytesToHex(deviceKeyset.identityPublicKey);
            const preKeyHex = bytesToHex(deviceKeyset.preKeyPublicKey);

            // Build the message to sign (same as desktop)
            // address + id + inboxAddress + pubKey + inboxKey + identityKey + preKey + userIcon + displayName
            const userIcon = user?.profileImage || '';
            const displayName = user?.displayName || user?.username || '';
            const msgToSign = user!.address +
              ratchet.id +
              inboxAddress +
              pubKeyHex +
              inboxKeyHex +
              identityKeyHex +
              preKeyHex +
              userIcon +
              displayName;
            const msgToSignBase64 = btoa(msgToSign);

            // Sign with the inbox private key (Ed448)
            const inboxPrivateKeyBase64 = numberArrayToBase64(inboxKeypair.private_key);
            const signatureBase64 = await cryptoProvider.signEd448(inboxPrivateKeyBase64, msgToSignBase64);

            const participant = {
              address: user!.address,
              id: ratchet.id,
              inboxAddress: inboxAddress,
              inboxPubKey: inboxPubKeyHex,
              pubKey: pubKeyHex,
              inboxKey: inboxKeyHex,
              identityKey: identityKeyHex,
              preKey: preKeyHex,
              userIcon: userIcon,
              displayName: displayName,
              signature: signatureBase64,
            };

            logger.log('[JoinSpace] Prepared join participant:', {
              address: participant.address,
              id: participant.id,
              inboxAddress: participant.inboxAddress,
              pubKeyLength: participant.pubKey.length,
              inboxKeyLength: participant.inboxKey.length,
            });

            // Create the join message envelope
            const joinMessageEnvelope = await sendJoinMessage({
              spaceId: space.spaceId,
              participant,
            });

            logger.log('[JoinSpace] Join message envelope created, length:', joinMessageEnvelope.length);

            // Return the join message to be sent via WebSocket
            logger.log('[JoinSpace] Successfully joined space:', space.spaceName);
            return {
              spaceId: space.spaceId,
              channelId: space.defaultChannelId,
              inboxAddress: inboxAddress,
              joinMessageEnvelope: joinMessageEnvelope,
            };
          } catch (joinMsgError) {
            logger.log('[JoinSpace] Failed to create join message:', joinMsgError);
            // Continue without join message - others won't be able to see us properly
          }
        } catch (e) {
          logger.log('[JoinSpace] Failed to process template/secret:', e);
          if (e instanceof Error) {
            logger.log('[JoinSpace] Error details:', e.message, e.stack);
          }
          // Continue without encryption state - space can still be viewed but not send messages
        }
      } else {
        logger.warn('[JoinSpace] No template/secret in invite - cannot set up encryption');
      }

      logger.log('[JoinSpace] Successfully joined space:', space.spaceName);

      return {
        spaceId: space.spaceId,
        channelId: space.defaultChannelId,
        inboxAddress: inboxAddress,
      };
    },
    onSuccess: () => {
      // Invalidate spaces query to refresh list
      queryClient.invalidateQueries({ queryKey: ['spaces'] });
    },
  });
}

/**
 * Hook to create a new space with full API registration
 */
export function useCreateSpace() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (params: CreateSpaceParams): Promise<CreateSpaceResult> => {
      // Import the space service dynamically to avoid circular dependencies
      const { createSpace } = await import('@/services/space/spaceService');

      if (!user?.address) {
        throw new Error('User must be logged in to create a space');
      }

      const result = await createSpace({
        name: params.name,
        description: params.description,
        iconData: params.iconData,
        isRepudiable: params.isRepudiable,
        isPublic: params.isPublic,
        userAddress: user.address,
        userDisplayName: user.displayName || user.username,
        userIcon: user.profileImage,
      });

      return {
        spaceId: result.spaceId,
        channelId: result.channelId,
        inboxAddress: result.inboxAddress,
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['spaces'] });
    },
  });
}
