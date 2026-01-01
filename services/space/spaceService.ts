/**
 * SpaceService - Full space creation and management
 *
 * Handles the complete space creation flow:
 * 1. Generate all required keypairs (space, config, hub, inbox, owner, channel)
 * 2. Register space with API
 * 3. Encrypt and upload space manifest
 * 4. Register inbox with hub
 * 5. Save keys and space locally
 * 6. Update user config
 *
 * Matches desktop SpaceService behavior for full compatibility.
 */

import { logger } from '@quilibrium/quorum-shared';
import { sha256 } from '@noble/hashes/sha2';
import { bytesToHex, int64ToBytes, type KickMessage, type Message, type NavItem, type Space } from '@quilibrium/quorum-shared';
import bs58 from 'bs58';
import * as multihashes from 'multihashes';
import { getQuorumClient } from '../api/quorumClient';
import { getLocalUserConfig, saveConfig } from '../config/configService';
import {
  getAllSpaces,
  getSpace,
  getSpaceKey,
  saveSpace,
  saveSpaceKey,
} from '../config/spaceStorage';
import { encryptionStateStorage } from '../crypto/encryption-state-storage';
import { NativeCryptoProvider } from '../crypto/native-provider';
import {
  constructUserRegistration,
  establishTripleRatchetSessionForSpace,
  newUserKeyset,
  type DeviceKeyset,
  type UserKeyset
} from '../crypto/space-session';
import { getMMKVAdapter } from '../storage/mmkvAdapter';

export interface CreateSpaceParams {
  name: string;
  description?: string;
  iconData?: string; // Base64 data URL for icon
  isRepudiable?: boolean;
  isPublic?: boolean;
  userAddress: string;
  userDisplayName?: string;
  userIcon?: string;
}

export interface CreateSpaceResult {
  spaceId: string;
  channelId: string;
  hubAddress: string;
  inboxAddress: string;
}

/**
 * Derive address from public key using multihash (same as Quorum address derivation)
 */
function deriveAddress(publicKeyBytes: Uint8Array): string {
  const hash = sha256(publicKeyBytes);
  const mhash = multihashes.encode(hash, 'sha2-256');
  return bs58.encode(mhash);
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
 * Create a new space with full API registration
 */
export async function createSpace(params: CreateSpaceParams): Promise<CreateSpaceResult> {
  const client = getQuorumClient();
  const cryptoProvider = new NativeCryptoProvider();
  const timestamp = Date.now();

  logger.log('[SpaceService] Creating space:', params.name);

  // 1. Generate all required keypairs
  // Space key (Ed448) - for signing space operations
  const spaceKeypair = await cryptoProvider.generateEd448();
  const spaceAddress = deriveAddress(new Uint8Array(spaceKeypair.public_key));
  const spacePublicKeyHex = bytesToHex(new Uint8Array(spaceKeypair.public_key));
  const spacePrivateKeyHex = bytesToHex(new Uint8Array(spaceKeypair.private_key));

  // Config key (X448) - for encrypting space manifest
  const configKeypair = await cryptoProvider.generateX448();
  const configPublicKeyHex = bytesToHex(new Uint8Array(configKeypair.public_key));
  const configPrivateKeyHex = bytesToHex(new Uint8Array(configKeypair.private_key));

  // Channel/Group key (Ed448) - for the default channel
  const channelKeypair = await cryptoProvider.generateEd448();
  const channelAddress = deriveAddress(new Uint8Array(channelKeypair.public_key));
  const channelPublicKeyHex = bytesToHex(new Uint8Array(channelKeypair.public_key));
  const channelPrivateKeyHex = bytesToHex(new Uint8Array(channelKeypair.private_key));

  // Hub key (Ed448) - for hub messages
  const hubKeypair = await cryptoProvider.generateEd448();
  const hubAddress = deriveAddress(new Uint8Array(hubKeypair.public_key));
  const hubPublicKeyHex = bytesToHex(new Uint8Array(hubKeypair.public_key));
  const hubPrivateKeyHex = bytesToHex(new Uint8Array(hubKeypair.private_key));

  // Inbox key (Ed448) - for receiving messages
  const inboxKeypair = await cryptoProvider.generateEd448();
  const inboxAddress = deriveAddress(new Uint8Array(inboxKeypair.public_key));
  const inboxPublicKeyHex = bytesToHex(new Uint8Array(inboxKeypair.public_key));
  const inboxPrivateKeyHex = bytesToHex(new Uint8Array(inboxKeypair.private_key));

  // Owner key (Ed448) - space owner signing
  const ownerKeypair = await cryptoProvider.generateEd448();
  const ownerPublicKeyHex = bytesToHex(new Uint8Array(ownerKeypair.public_key));
  const ownerPrivateKeyHex = bytesToHex(new Uint8Array(ownerKeypair.private_key));

  logger.log('[SpaceService] Generated keypairs, spaceAddress:', spaceAddress);

  // 2. Build and sign payloads for space registration
  // Payload: space_public_key + config_public_key + owner_public_key + timestamp
  const timestampBytes = int64ToBytes(timestamp);
  const payloadBytes = new Uint8Array([
    ...spaceKeypair.public_key,
    ...configKeypair.public_key,
    ...ownerKeypair.public_key,
    ...timestampBytes,
  ]);
  const payloadBase64 = numberArrayToBase64(Array.from(payloadBytes));

  // Sign with space key
  const spacePrivateKeyBase64 = numberArrayToBase64(spaceKeypair.private_key);
  const spaceSignatureBase64 = await cryptoProvider.signEd448(spacePrivateKeyBase64, payloadBase64);
  const spaceSignatureHex = base64ToHex(spaceSignatureBase64);

  // Sign with owner key
  const ownerPrivateKeyBase64 = numberArrayToBase64(ownerKeypair.private_key);
  const ownerSignatureBase64 = await cryptoProvider.signEd448(ownerPrivateKeyBase64, payloadBase64);
  const ownerSignatureHex = base64ToHex(ownerSignatureBase64);

  logger.log('[SpaceService] Signed payloads, registering with API');

  // 3. Register space with API
  try {
    await client.postSpace(spaceAddress, {
      space_address: spaceAddress,
      space_public_key: spacePublicKeyHex,
      space_signature: spaceSignatureHex,
      config_public_key: configPublicKeyHex,
      owner_public_keys: [ownerPublicKeyHex],
      owner_signatures: [ownerSignatureHex],
      timestamp,
    });
    logger.log('[SpaceService] Space registered with API');
  } catch (error) {
    logger.log('[SpaceService] Failed to register space:', error);
    throw new Error(`Failed to register space: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  // 4. Build space object
  const space: Space = {
    spaceId: spaceAddress,
    spaceName: params.name,
    description: params.description || '',
    vanityUrl: '',
    inviteUrl: '',
    iconUrl: params.iconData || '',
    bannerUrl: '',
    defaultChannelId: channelAddress,
    hubAddress,
    createdDate: timestamp,
    modifiedDate: timestamp,
    isRepudiable: params.isRepudiable ?? false,
    isPublic: params.isPublic ?? true,
    groups: [
      {
        groupName: 'Text Channels',
        channels: [
          {
            spaceId: spaceAddress,
            channelId: channelAddress,
            channelName: 'general',
            channelTopic: 'General Chat',
            createdDate: timestamp,
            modifiedDate: timestamp,
          },
        ],
      },
    ],
    roles: [],
    emojis: [],
    stickers: [],
  };

  // 5. Encrypt and upload space manifest
  const ephemeralKeypair = await cryptoProvider.generateX448();
  const spaceJson = JSON.stringify(space);
  const spaceBytes = new TextEncoder().encode(spaceJson);

  // Encrypt the manifest using config public key
  const ciphertext = await cryptoProvider.encryptInboxMessage({
    inbox_public_key: configKeypair.public_key,
    ephemeral_private_key: ephemeralKeypair.private_key,
    plaintext: Array.from(spaceBytes),
  });

  // Sign the manifest with owner key
  const manifestWithTimestamp = new Uint8Array([
    ...new TextEncoder().encode(ciphertext),
    ...timestampBytes,
  ]);
  const manifestPayloadBase64 = numberArrayToBase64(Array.from(manifestWithTimestamp));
  const manifestSignatureBase64 = await cryptoProvider.signEd448(ownerPrivateKeyBase64, manifestPayloadBase64);
  const manifestSignatureHex = base64ToHex(manifestSignatureBase64);

  try {
    await client.postSpaceManifest(spaceAddress, {
      space_address: spaceAddress,
      space_manifest: ciphertext,
      ephemeral_public_key: bytesToHex(new Uint8Array(ephemeralKeypair.public_key)),
      timestamp,
      owner_public_key: ownerPublicKeyHex,
      owner_signature: manifestSignatureHex,
    });
    logger.log('[SpaceService] Space manifest uploaded');
  } catch (error) {
    logger.log('[SpaceService] Failed to upload manifest:', error);
    // Continue - the space is registered, just won't have manifest
  }

  // 6. Register inbox with hub
  // Hub signature: sign("add" + inbox_public_key_hex)
  const addInboxMessage = 'add' + inboxPublicKeyHex;
  const addInboxMessageBytes = new TextEncoder().encode(addInboxMessage);
  const addInboxMessageBase64 = numberArrayToBase64(Array.from(addInboxMessageBytes));
  const hubPrivateKeyBase64 = numberArrayToBase64(hubKeypair.private_key);
  const hubSignatureBase64 = await cryptoProvider.signEd448(hubPrivateKeyBase64, addInboxMessageBase64);
  const hubSignatureHex = base64ToHex(hubSignatureBase64);

  // Inbox signature: sign("add" + hub_public_key_hex)
  const addHubMessage = 'add' + hubPublicKeyHex;
  const addHubMessageBytes = new TextEncoder().encode(addHubMessage);
  const addHubMessageBase64 = numberArrayToBase64(Array.from(addHubMessageBytes));
  const inboxPrivateKeyBase64 = numberArrayToBase64(inboxKeypair.private_key);
  const inboxSignatureBase64 = await cryptoProvider.signEd448(inboxPrivateKeyBase64, addHubMessageBase64);
  const inboxSignatureHex = base64ToHex(inboxSignatureBase64);

  try {
    await client.postHubAdd({
      hub_address: hubAddress,
      hub_public_key: hubPublicKeyHex,
      hub_signature: hubSignatureHex,
      inbox_public_key: inboxPublicKeyHex,
      inbox_signature: inboxSignatureHex,
    });
    logger.log('[SpaceService] Inbox registered with hub');
  } catch (error) {
    logger.log('[SpaceService] Failed to register with hub:', error);
    // Continue - space is created, just won't receive real-time updates
  }

  // 7. Save all keys locally
  saveSpaceKey({
    spaceId: spaceAddress,
    keyId: 'config',
    publicKey: configPublicKeyHex,
    privateKey: configPrivateKeyHex,
  });

  logger.log('[SpaceService] Saving hub key for space:', spaceAddress, 'address:', hubAddress);
  saveSpaceKey({
    spaceId: spaceAddress,
    keyId: 'hub',
    address: hubAddress,
    publicKey: hubPublicKeyHex,
    privateKey: hubPrivateKeyHex,
  });

  // Verify the key was saved
  const savedHubKey = getSpaceKey(spaceAddress, 'hub');
  if (!savedHubKey) {
    logger.log('[SpaceService] Hub key was not saved correctly!');
  } else {
    logger.log('[SpaceService] Hub key verified:', {
      hasAddress: !!savedHubKey.address,
      hasPublicKey: !!savedHubKey.publicKey,
      hasPrivateKey: !!savedHubKey.privateKey,
    });
  }

  saveSpaceKey({
    spaceId: spaceAddress,
    keyId: 'owner',
    publicKey: ownerPublicKeyHex,
    privateKey: ownerPrivateKeyHex,
  });

  saveSpaceKey({
    spaceId: spaceAddress,
    keyId: 'inbox',
    address: inboxAddress,
    publicKey: inboxPublicKeyHex,
    privateKey: inboxPrivateKeyHex,
  });

  saveSpaceKey({
    spaceId: spaceAddress,
    keyId: channelAddress,
    publicKey: channelPublicKeyHex,
    privateKey: channelPrivateKeyHex,
  });

  saveSpaceKey({
    spaceId: spaceAddress,
    keyId: spaceAddress,
    publicKey: spacePublicKeyHex,
    privateKey: spacePrivateKeyHex,
  });

  // 8. Save space locally (both storages for compatibility)
  saveSpace(space);
  // Also save to mmkvAdapter so useSpaces hook can find it
  const adapter = getMMKVAdapter();
  await adapter.saveSpace(space);
  logger.log('[SpaceService] Space saved locally');

  // 8.1 Save creator as a member of the space
  await adapter.saveSpaceMember(spaceAddress, {
    address: params.userAddress,
    display_name: params.userDisplayName,
    profile_image: params.userIcon,
    inbox_address: inboxAddress,
  });
  logger.log('[SpaceService] Creator saved as space member');

  // 9. Establish Triple Ratchet session for space messaging with invite pool
  const conversationId = `${spaceAddress}/${spaceAddress}`;

  try {
    // Create keysets for the Triple Ratchet session establishment
    // This follows the desktop's EstablishTripleRatchetSessionForSpace pattern

    // User keyset uses Ed448 owner key + X448 peer key
    const peerKeypair = await cryptoProvider.generateX448();
    const userKeyset: UserKeyset = newUserKeyset(
      { type: 'ed448', public_key: ownerKeypair.public_key, private_key: ownerKeypair.private_key },
      { type: 'x448', public_key: peerKeypair.public_key, private_key: peerKeypair.private_key }
    );

    // Device keyset for the space's inbox
    const identityKeypair = await cryptoProvider.generateX448();
    const preKeypair = await cryptoProvider.generateX448();
    const inboxEncryptionKeypair = await cryptoProvider.generateX448();

    const deviceKeyset: DeviceKeyset = {
      identity_key: { type: 'x448', public_key: identityKeypair.public_key, private_key: identityKeypair.private_key },
      pre_key: { type: 'x448', public_key: preKeypair.public_key, private_key: preKeypair.private_key },
      inbox_keyset: {
        inbox_address: inboxAddress,
        inbox_key: { type: 'ed448', public_key: inboxKeypair.public_key, private_key: inboxKeypair.private_key },
        inbox_encryption_key: { type: 'x448', public_key: inboxEncryptionKeypair.public_key, private_key: inboxEncryptionKeypair.private_key },
      },
    };

    // Construct user registration
    const registration = await constructUserRegistration(userKeyset, [], [deviceKeyset]);

    // Establish the Triple Ratchet session with invite pool generation
    // This runs a 4-party DKG and generates the evals pool for invites
    logger.log('[SpaceService] Establishing Triple Ratchet session with invite pool...');
    const sessionResult = await establishTripleRatchetSessionForSpace(
      userKeyset,
      deviceKeyset,
      registration,
      10000 // Generate 10000 invite slots
    );

    // Save the session state with template and evals for invite generation
    // The state structure matches what inviteService expects:
    // { state: <ratchet state>, template: <template for invites>, evals: <invite secrets pool> }
    const stateToSave = JSON.stringify({
      state: sessionResult.state,
      template: sessionResult.template,
      evals: sessionResult.evals,
    });

    // DEBUG: Verify structure before saving
    const debugParsed = JSON.parse(stateToSave);
    logger.log('[SpaceService] DEBUG - About to save state with keys:', Object.keys(debugParsed));
    logger.log('[SpaceService] DEBUG - Has template:', !!debugParsed.template);
    logger.log('[SpaceService] DEBUG - Has evals:', !!debugParsed.evals, 'count:', debugParsed.evals?.length);

    encryptionStateStorage.saveEncryptionState({
      conversationId,
      inboxId: inboxAddress,
      state: stateToSave,
      timestamp,
    });

    // DEBUG: Verify state was saved correctly
    const savedStates = encryptionStateStorage.getEncryptionStates(conversationId);
    if (savedStates.length > 0) {
      const savedParsed = JSON.parse(savedStates[0].state);
      logger.log('[SpaceService] DEBUG - Saved state has keys:', Object.keys(savedParsed));
      logger.log('[SpaceService] DEBUG - Saved has template:', !!savedParsed.template);
      logger.log('[SpaceService] DEBUG - Saved has evals:', !!savedParsed.evals, 'count:', savedParsed.evals?.length);
    }

    // Also save as fallback state - critical for mobile-to-mobile messaging
    // When a joiner sends a message and the creator decrypts it, the creator's state evolves.
    // But the joiner uses fallback state for encryption (to stay compatible with desktop).
    // So the creator must also use fallback state for encryption to match the joiner's expectations.
    encryptionStateStorage.saveFallbackState({
      conversationId,
      inboxId: inboxAddress,
      state: stateToSave,
      timestamp,
    });

    logger.log('[SpaceService] Triple Ratchet session established with', sessionResult.evals.length, 'invite slots');
    logger.log('[SpaceService] Saved fallback state for creator to match desktop behavior');
  } catch (trError) {
    logger.log('[SpaceService] Failed to establish Triple Ratchet session:', trError);
    // Save a placeholder state so we know the space exists
    // Invites won't work but messaging might still function
    encryptionStateStorage.saveEncryptionState({
      conversationId,
      inboxId: inboxAddress,
      state: JSON.stringify({
        initialized: false,
        error: 'Triple Ratchet initialization failed',
        timestamp,
      }),
      timestamp,
    });
  }

  // 10. Update user config with new space
  try {
    const config = getLocalUserConfig(params.userAddress);
    if (config) {
      const newSpaceItem: NavItem = { type: 'space', id: spaceAddress };
      const updatedConfig = {
        ...config,
        spaceIds: [...(config.spaceIds || []), spaceAddress],
        items: [...(config.items || []), newSpaceItem],
      };
      await saveConfig(updatedConfig);
      logger.log('[SpaceService] User config updated');
    }
  } catch (error) {
    logger.log('[SpaceService] Failed to update config:', error);
    // Non-fatal - space is created
  }

  logger.log('[SpaceService] Space created successfully:', spaceAddress);

  return {
    spaceId: spaceAddress,
    channelId: channelAddress,
    hubAddress,
    inboxAddress,
  };
}

export interface KickUserParams {
  spaceId: string;
  userAddress: string;
  selfAddress: string;
}

export interface KickUserResult {
  success: boolean;
  wsEnvelopes: string[];
}

/**
 * Kick a user from a space
 *
 * This is a complex cryptographic operation that:
 * 1. Generates new config keypair
 * 2. Updates space registration with new config key
 * 3. Removes user from all roles
 * 4. Re-encrypts and posts space manifest
 * 5. Re-establishes Triple Ratchet session excluding kicked user
 * 6. Sends rekey messages to remaining members
 * 7. Sends kick notification to kicked user
 * 8. Marks user as kicked locally
 * 9. Updates invite evals pool
 */
export async function kickUser(params: KickUserParams): Promise<KickUserResult> {
  const { spaceId, userAddress, selfAddress } = params;
  const client = getQuorumClient();
  const cryptoProvider = new NativeCryptoProvider();
  const adapter = getMMKVAdapter();
  const timestamp = Date.now();

  logger.log('[SpaceService.kickUser] Starting kick for:', userAddress, 'from space:', spaceId);

  // Get required keys
  const spaceKey = getSpaceKey(spaceId, spaceId);
  const ownerKey = getSpaceKey(spaceId, 'owner');
  const hubKey = getSpaceKey(spaceId, 'hub');

  if (!spaceKey || !ownerKey || !hubKey) {
    console.error('[SpaceService.kickUser] Missing required keys');
    throw new Error('Missing required keys for kick operation');
  }

  // Get current space
  const space = getSpace(spaceId);
  if (!space) {
    throw new Error('Space not found');
  }

  // Get the OLD config key BEFORE generating new one - needed for sealing rekey messages
  const oldConfigKey = getSpaceKey(spaceId, 'config');
  const oldConfigPublicKeyArray = oldConfigKey ? Array.from(hexToBytes(oldConfigKey.publicKey)) : undefined;
  logger.log('[SpaceService.kickUser] Old config key exists:', !!oldConfigKey);

  // 1. Generate new config keypair
  const newConfigKeypair = await cryptoProvider.generateX448();
  const newConfigPublicKeyHex = bytesToHex(new Uint8Array(newConfigKeypair.public_key));
  const newConfigPrivateKeyHex = bytesToHex(new Uint8Array(newConfigKeypair.private_key));

  // Save new config key
  saveSpaceKey({
    spaceId,
    keyId: 'config',
    publicKey: newConfigPublicKeyHex,
    privateKey: newConfigPrivateKeyHex,
  });

  logger.log('[SpaceService.kickUser] Generated new config key');

  // 2. Build and sign new space registration payload
  const timestampBytes = int64ToBytes(timestamp);
  const spacePublicKeyBytes = hexToBytes(spaceKey.publicKey);
  const ownerPublicKeyBytes = hexToBytes(ownerKey.publicKey);

  const payloadBytes = new Uint8Array([
    ...spacePublicKeyBytes,
    ...newConfigKeypair.public_key,
    ...ownerPublicKeyBytes,
    ...timestampBytes,
  ]);
  const payloadBase64 = numberArrayToBase64(Array.from(payloadBytes));

  // Sign with space key
  const spacePrivateKeyBase64 = numberArrayToBase64(Array.from(hexToBytes(spaceKey.privateKey)));
  const spaceSignatureBase64 = await cryptoProvider.signEd448(spacePrivateKeyBase64, payloadBase64);
  const spaceSignatureHex = base64ToHex(spaceSignatureBase64);

  // Sign with owner key
  const ownerPrivateKeyBase64 = numberArrayToBase64(Array.from(hexToBytes(ownerKey.privateKey)));
  const ownerSignatureBase64 = await cryptoProvider.signEd448(ownerPrivateKeyBase64, payloadBase64);
  const ownerSignatureHex = base64ToHex(ownerSignatureBase64);

  // Post updated space registration
  try {
    await client.postSpace(spaceId, {
      space_address: spaceId,
      space_public_key: spaceKey.publicKey,
      space_signature: spaceSignatureHex,
      config_public_key: newConfigPublicKeyHex,
      owner_public_keys: [ownerKey.publicKey],
      owner_signatures: [ownerSignatureHex],
      timestamp,
    });
    logger.log('[SpaceService.kickUser] Updated space registration');
  } catch (error) {
    console.error('[SpaceService.kickUser] Failed to update space registration:', error);
    throw error;
  }

  // 3. Remove kicked user from all roles
  const updatedSpace: Space = {
    ...space,
    roles: space.roles.map(role => ({
      ...role,
      members: role.members.filter(m => m !== userAddress),
    })),
    modifiedDate: timestamp,
  };

  // 4. Encrypt and post new space manifest
  const ephemeralKeypair = await cryptoProvider.generateX448();
  const spaceJson = JSON.stringify(updatedSpace);
  const spaceBytes = new TextEncoder().encode(spaceJson);

  const ciphertext = await cryptoProvider.encryptInboxMessage({
    inbox_public_key: newConfigKeypair.public_key,
    ephemeral_private_key: ephemeralKeypair.private_key,
    plaintext: Array.from(spaceBytes),
  });

  // Sign the manifest with owner key
  const manifestWithTimestamp = new Uint8Array([
    ...new TextEncoder().encode(ciphertext),
    ...timestampBytes,
  ]);
  const manifestPayloadBase64 = numberArrayToBase64(Array.from(manifestWithTimestamp));
  const manifestSignatureBase64 = await cryptoProvider.signEd448(ownerPrivateKeyBase64, manifestPayloadBase64);
  const manifestSignatureHex = base64ToHex(manifestSignatureBase64);

  try {
    await client.postSpaceManifest(spaceId, {
      space_address: spaceId,
      space_manifest: ciphertext,
      ephemeral_public_key: bytesToHex(new Uint8Array(ephemeralKeypair.public_key)),
      timestamp,
      owner_public_key: ownerKey.publicKey,
      owner_signature: manifestSignatureHex,
    });
    logger.log('[SpaceService.kickUser] Updated space manifest');
  } catch (error) {
    console.error('[SpaceService.kickUser] Failed to update manifest:', error);
    // Continue with kick - manifest update is not critical
  }

  // Save updated space locally
  saveSpace(updatedSpace);
  await adapter.saveSpace(updatedSpace);

  // 5. Get members for rekey distribution
  const members = await adapter.getSpaceMembers(spaceId);
  const filteredMembers = members.filter(
    m => m.inbox_address && m.inbox_address !== '' &&
         m.address !== userAddress &&
         m.address !== selfAddress
  );

  logger.log('[SpaceService.kickUser] Sending rekey to', filteredMembers.length, 'members');

  // 6. Create and send sync envelopes to remaining members
  const outbounds: string[] = [];
  const hubKeypair = {
    publicKey: Array.from(hexToBytes(hubKey.publicKey)),
    privateKey: Array.from(hexToBytes(hubKey.privateKey)),
  };
  const ownerKeypairFull = {
    publicKey: Array.from(hexToBytes(ownerKey.publicKey)),
    privateKey: Array.from(hexToBytes(ownerKey.privateKey)),
  };

  // Get the current encryption state to rebuild peer maps
  const spaceConversationId = `${spaceId}/${spaceId}`;
  const encryptionStates = encryptionStateStorage.getEncryptionStates(spaceConversationId);

  if (encryptionStates.length > 0 && filteredMembers.length > 0) {
    try {
      // Parse current Triple Ratchet state
      const stateData = encryptionStates[0];
      const parsed = JSON.parse(stateData.state);
      const trState = JSON.parse(parsed.state);

      // Get self's keyset for session re-establishment
      const inboxKey = getSpaceKey(spaceId, 'inbox');
      const userKey = getSpaceKey(spaceId, 'user') || getSpaceKey(spaceId, spaceId); // Fallback to space key for owner
      const peerKey = getSpaceKey(spaceId, 'peer');

      if (!inboxKey || !userKey) {
        logger.warn('[SpaceService.kickUser] Missing keys for full rekey, falling back to simple rekey');
      } else {
        // Build keysets for re-establishing session
        const userKeyset: UserKeyset = {
          user_key: {
            type: 'ed448',
            public_key: Array.from(hexToBytes(userKey.publicKey)),
            private_key: Array.from(hexToBytes(userKey.privateKey)),
          },
          peer_key: {
            type: 'x448',
            public_key: peerKey ? Array.from(hexToBytes(peerKey.publicKey)) : [],
            private_key: peerKey ? Array.from(hexToBytes(peerKey.privateKey)) : [],
          },
        };

        const inboxKeypairEd448 = await cryptoProvider.generateEd448();
        const inboxEncryptionKeypair = await cryptoProvider.generateX448();
        const identityKeypair = await cryptoProvider.generateX448();
        const preKeypair = await cryptoProvider.generateX448();

        const deviceKeyset: DeviceKeyset = {
          identity_key: {
            type: 'x448',
            public_key: identityKeypair.public_key,
            private_key: identityKeypair.private_key,
          },
          pre_key: {
            type: 'x448',
            public_key: preKeypair.public_key,
            private_key: preKeypair.private_key,
          },
          inbox_keyset: {
            inbox_address: inboxKey.address || '',
            inbox_key: {
              type: 'ed448',
              public_key: inboxKeypairEd448.public_key,
              private_key: inboxKeypairEd448.private_key,
            },
            inbox_encryption_key: {
              type: 'x448',
              public_key: inboxEncryptionKeypair.public_key,
              private_key: inboxEncryptionKeypair.private_key,
            },
          },
        };

        // Build user registration for session establishment
        const registration = await constructUserRegistration(userKeyset, [], [deviceKeyset]);

        // Re-establish Triple Ratchet session with enough evals for remaining members
        logger.log('[SpaceService.kickUser] Re-establishing Triple Ratchet session for rekey');
        const session = await establishTripleRatchetSessionForSpace(
          userKeyset,
          deviceKeyset,
          registration,
          filteredMembers.length + 200
        );

        // Build new peer maps excluding kicked user
        // Start with ID 1 for self (owner)
        const selfPubKeyBase64 = numberArrayToBase64(deviceKeyset.inbox_keyset.inbox_encryption_key.public_key);
        let newPeerIdMap: Record<string, number> = { [trState.id_peer_map[1]?.public_key || selfPubKeyBase64]: 1 };
        let newIdPeerMap: Record<number, any> = { 1: trState.id_peer_map[1] };
        let idCounter = 2;

        // Map remaining members to new IDs
        for (const member of filteredMembers) {
          // Find member's inbox encryption public key in the old peer map
          const memberInboxPubKey = Object.keys(trState.peer_id_map || {}).find(key => {
            const oldId = trState.peer_id_map[key];
            const peerInfo = trState.id_peer_map[oldId];
            // Try to match by inbox address or other identifying info
            return peerInfo && trState.peer_id_map[key];
          });

          if (memberInboxPubKey && trState.peer_id_map[memberInboxPubKey]) {
            const oldId = trState.peer_id_map[memberInboxPubKey];
            newPeerIdMap[memberInboxPubKey] = idCounter;
            newIdPeerMap[idCounter] = trState.id_peer_map[oldId];
            idCounter++;
          }
        }

        // Update own ratchet state with new peer maps
        const ownRatchet = JSON.parse(session.state);
        ownRatchet.peer_id_map = newPeerIdMap;
        ownRatchet.id_peer_map = newIdPeerMap;

        // Save updated encryption state
        encryptionStateStorage.saveEncryptionState({
          conversationId: spaceConversationId,
          inboxId: stateData.inboxId,
          state: JSON.stringify({ state: JSON.stringify(ownRatchet) }),
          timestamp: Date.now(),
        });

        logger.log('[SpaceService.kickUser] Updated own encryption state with new peer maps');

        // Send personalized rekey to each remaining member
        idCounter = 2;
        for (const member of filteredMembers) {
          if (!member.inbox_address) continue;

          try {
            // Find member's inbox encryption public key
            const memberInboxPubKey = Object.entries(trState.peer_id_map || {}).find(([key, id]) => {
              return newIdPeerMap[idCounter]?.public_key === key;
            })?.[0];

            if (!memberInboxPubKey || !newIdPeerMap[idCounter]) {
              logger.warn('[SpaceService.kickUser] Could not find peer info for member, sending simple rekey:', member.address);
              // Fall back to simple rekey
              const rekeyMessage = JSON.stringify({
                type: 'control',
                message: {
                  type: 'rekey',
                  info: JSON.stringify({
                    configKey: newConfigPrivateKeyHex,
                    kick: userAddress,
                  }),
                  kick: userAddress,
                },
              });

              const syncEnvelope = await cryptoProvider.sealSyncEnvelope(
                member.inbox_address,
                hubKey.address || '',
                hubKeypair,
                ownerKeypairFull,
                rekeyMessage,
                oldConfigPublicKeyArray // Use OLD config key so recipients can decrypt
              );
              outbounds.push(JSON.stringify({ type: 'sync', ...syncEnvelope }));
              idCounter++;
              continue;
            }

            // Create personalized template state for this member
            const sendState = { ...session.template };
            const ratchet = JSON.parse(sendState.dkg_ratchet);

            // Update peer maps
            sendState.peer_id_map = newPeerIdMap;
            sendState.id_peer_map = newIdPeerMap;
            ratchet.id = filteredMembers.length + 201 - session.evals.length;
            sendState.root_key = ownRatchet.root_key;

            // Get eval for this member
            const evalSecret = session.evals.shift();
            if (!evalSecret) {
              logger.warn('[SpaceService.kickUser] Ran out of evals for member:', member.address);
              idCounter++;
              continue;
            }

            // Generate new secrets for this member
            const secretPair = await cryptoProvider.generateX448();
            const ephPair = await cryptoProvider.generateX448();

            ratchet.total = Object.keys(newPeerIdMap).length;
            ratchet.secret = numberArrayToBase64(secretPair.private_key);
            ratchet.scalar = numberArrayToBase64(evalSecret);

            const evalPubBase64 = await cryptoProvider.getPublicKeyX448(numberArrayToBase64(evalSecret));
            ratchet.point = evalPubBase64;
            ratchet.random_commitment_point = evalPubBase64;

            sendState.dkg_ratchet = JSON.stringify(ratchet);
            sendState.next_dkg_ratchet = JSON.stringify(ratchet);
            sendState.ephemeral_private_key = numberArrayToBase64(ephPair.private_key);

            const template = JSON.stringify(sendState);

            // Seal the inner envelope to the member's inbox encryption public key
            const innerEnvelope = await cryptoProvider.sealInboxEnvelope(
              memberInboxPubKey, // base64 public key
              JSON.stringify({
                configKey: newConfigPrivateKeyHex,
                state: template,
              })
            );

            // Wrap in sync envelope
            const rekeyMessage = JSON.stringify({
              type: 'control',
              message: {
                type: 'rekey',
                info: JSON.stringify(innerEnvelope),
                kick: userAddress,
              },
            });

            const syncEnvelope = await cryptoProvider.sealSyncEnvelope(
              member.inbox_address,
              hubKey.address || '',
              hubKeypair,
              ownerKeypairFull,
              rekeyMessage,
              oldConfigPublicKeyArray // Use OLD config key so recipients can decrypt
            );

            outbounds.push(JSON.stringify({ type: 'sync', ...syncEnvelope }));
            logger.log('[SpaceService.kickUser] Created personalized rekey for member:', member.address);
            idCounter++;
          } catch (memberError) {
            console.error('[SpaceService.kickUser] Failed to create rekey for member:', member.address, memberError);
          }
        }

        // Update evals pool
        saveSpaceInviteEvals(spaceId, session.evals);
        logger.log('[SpaceService.kickUser] Updated invite evals pool with', session.evals.length, 'remaining evals');
      }
    } catch (rekeyError) {
      console.error('[SpaceService.kickUser] Full rekey failed, falling back to simple rekey:', rekeyError);
      // Fall back to simple rekey for all members
      for (const member of filteredMembers) {
        if (!member.inbox_address) continue;
        try {
          const rekeyMessage = JSON.stringify({
            type: 'control',
            message: {
              type: 'rekey',
              info: JSON.stringify({
                configKey: newConfigPrivateKeyHex,
                kick: userAddress,
              }),
              kick: userAddress,
            },
          });

          const syncEnvelope = await cryptoProvider.sealSyncEnvelope(
            member.inbox_address,
            hubKey.address || '',
            hubKeypair,
            ownerKeypairFull,
            rekeyMessage,
            oldConfigPublicKeyArray
          );
          outbounds.push(JSON.stringify({ type: 'sync', ...syncEnvelope }));
        } catch (error) {
          console.error('[SpaceService.kickUser] Failed to create simple rekey:', error);
        }
      }
    }
  } else {
    // No encryption state or no filtered members - send simple rekey
    for (const member of filteredMembers) {
      if (!member.inbox_address) continue;
      try {
        const rekeyMessage = JSON.stringify({
          type: 'control',
          message: {
            type: 'rekey',
            info: JSON.stringify({
              configKey: newConfigPrivateKeyHex,
              kick: userAddress,
            }),
            kick: userAddress,
          },
        });

        const syncEnvelope = await cryptoProvider.sealSyncEnvelope(
          member.inbox_address,
          hubKey.address || '',
          hubKeypair,
          ownerKeypairFull,
          rekeyMessage,
          oldConfigPublicKeyArray
        );
        outbounds.push(JSON.stringify({ type: 'sync', ...syncEnvelope }));
      } catch (error) {
        console.error('[SpaceService.kickUser] Failed to create rekey envelope:', error);
      }
    }
  }

  // 7. Send kick notification to kicked user
  const kickedMember = members.find(m => m.address === userAddress);
  if (kickedMember?.inbox_address) {
    try {
      const kickMessage = JSON.stringify({
        type: 'control',
        message: {
          type: 'kick',
          kick: userAddress,
        },
      });

      const kickEnvelope = await cryptoProvider.sealSyncEnvelope(
        kickedMember.inbox_address,
        hubKey.address || '',
        hubKeypair,
        ownerKeypairFull,
        kickMessage,
        oldConfigPublicKeyArray
      );

      outbounds.push(JSON.stringify({ type: 'sync', ...kickEnvelope }));
      logger.log('[SpaceService.kickUser] Sent kick notification to kicked user');
    } catch (error) {
      console.error('[SpaceService.kickUser] Failed to send kick notification:', error);
    }
  }

  // 8. Mark user as kicked in member storage
  if (kickedMember) {
    await adapter.saveSpaceMember(spaceId, {
      ...kickedMember,
      inbox_address: '',
      isKicked: true,
    });
    logger.log('[SpaceService.kickUser] Marked user as kicked locally');
  }

  // 8.5 Save kick event as a message (for chat history)
  const kickMessageIdBytes = sha256(new TextEncoder().encode('kick' + userAddress));
  const kickMessageId = bytesToHex(kickMessageIdBytes);
  const kickMessage: Message = {
    channelId: space.defaultChannelId,
    spaceId,
    messageId: kickMessageId,
    digestAlgorithm: 'SHA-256',
    nonce: kickMessageId,
    createdDate: timestamp,
    modifiedDate: timestamp,
    lastModifiedHash: '',
    reactions: [],
    mentions: { memberIds: [], roleIds: [], channelIds: [] },
    content: {
      senderId: userAddress,
      type: 'kick',
    } as KickMessage,
  };
  await adapter.saveMessage(kickMessage, timestamp, '', '', '', '');
  logger.log('[SpaceService.kickUser] Saved kick message to chat history');

  // 9. Update invite URL with new config key
  const inviteUrl = `quorum://join#spaceId=${spaceId}&configKey=${newConfigPrivateKeyHex}`;
  const spaceWithInvite: Space = {
    ...updatedSpace,
    inviteUrl,
  };
  saveSpace(spaceWithInvite);
  await adapter.saveSpace(spaceWithInvite);

  logger.log('[SpaceService.kickUser] Kick completed, sending', outbounds.length, 'envelopes');

  return {
    success: true,
    wsEnvelopes: outbounds,
  };
}

/**
 * Helper to convert hex string to bytes
 */
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Save updated invite evals to the space's encryption state
 */
function saveSpaceInviteEvals(spaceId: string, evals: number[][]): void {
  const spaceConversationId = `${spaceId}/${spaceId}`;
  const encryptionStates = encryptionStateStorage.getEncryptionStates(spaceConversationId);

  if (encryptionStates.length === 0) {
    logger.warn('[SpaceService] No encryption state to update with new evals');
    return;
  }

  const stateData = encryptionStates[0];
  const parsed = JSON.parse(stateData.state);

  // Preserve the structure and update evals
  const updatedState = {
    ...parsed,
    evals,
  };

  encryptionStateStorage.saveEncryptionState({
    conversationId: spaceConversationId,
    inboxId: stateData.inboxId,
    state: JSON.stringify(updatedState),
    timestamp: Date.now(),
  });

  // Also update fallback state
  encryptionStateStorage.saveFallbackState({
    conversationId: spaceConversationId,
    inboxId: stateData.inboxId,
    state: JSON.stringify(updatedState),
    timestamp: Date.now(),
  });

  logger.log('[SpaceService] Updated evals pool, remaining:', evals.length);
}

/**
 * Get all inbox addresses for WebSocket subscription
 */
export function getSpaceInboxAddresses(): string[] {
  const spaces = getAllSpaces();
  const addresses: string[] = [];

  for (const space of spaces) {
    const inboxKey = getSpace(space.spaceId);
    // Get inbox address from space key storage
    // This is already provided by getAllSpaceInboxAddresses in spaceStorage
  }

  return addresses;
}
