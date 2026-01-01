/**
 * SpaceSyncService - Handles syncing spaces from config
 *
 * When a user config is synced from a remote device, this service:
 * 1. Decrypts the space manifest using the config key
 * 2. Saves the space and keys locally
 * 3. Subscribes to the hub for receiving space messages
 * 4. Saves the encryption state for the space
 *
 * This mirrors the desktop's ConfigService space sync logic.
 */

import { logger } from '@quilibrium/quorum-shared';
import { sha256 } from '@noble/hashes/sha2';
import bs58 from 'bs58';
import * as multihashes from 'multihashes';
import { getQuorumClient } from '../api/quorumClient';
import { NativeCryptoProvider } from '../crypto/native-provider';
import { encryptionStateStorage } from '../crypto/encryption-state-storage';
import {
  saveSpace,
  saveSpaceKey,
  getSpace,
  type SpaceKey,
} from './spaceStorage';
import { type Space } from '@quilibrium/quorum-shared';
import { hexToBytes, bytesToHex } from '@quilibrium/quorum-shared';
import { getMMKVAdapter } from '../storage/mmkvAdapter';

/**
 * Space key info from UserConfig.spaceKeys
 */
export interface SpaceKeyInfo {
  spaceId: string;
  encryptionState: {
    conversationId: string;
    inboxId: string;
    state: string;
    timestamp: number;
  };
  keys: {
    keyId: string;
    address?: string;
    publicKey: string;
    privateKey: string;
    spaceId: string;
  }[];
}

/**
 * User info for saving as space member during sync
 */
export interface SyncUserInfo {
  address: string;
  displayName?: string;
  profileImage?: string;
}

/**
 * Derive address from public key using multihash (same as Quorum address derivation)
 */
function deriveAddress(publicKeyBytes: Uint8Array): string {
  const hash = sha256(publicKeyBytes);
  const multihash = multihashes.encode(hash, 'sha2-256');
  return bs58.encode(multihash);
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
 * Sync a space from config to local storage
 *
 * @param spaceKeyInfo - Space key info from UserConfig.spaceKeys
 * @param userInfo - Current user's info to save as a member
 * @param onListenRequest - Callback to request WebSocket subscription to inbox
 * @returns true if sync was successful
 */
export async function syncSpaceFromConfig(
  spaceKeyInfo: SpaceKeyInfo,
  userInfo?: SyncUserInfo,
  onListenRequest?: (inboxAddresses: string[]) => void
): Promise<boolean> {
  const { spaceId, encryptionState, keys } = spaceKeyInfo;

  // Check if space already exists locally
  const existingSpace = getSpace(spaceId);
  if (existingSpace) {
    logger.log(`[SpaceSync] Space ${spaceId} already exists locally, skipping`);
    return true;
  }

  try {
    // Find required keys
    const configKey = keys.find((k) => k.keyId === 'config');
    const hubKey = keys.find((k) => k.keyId === 'hub');

    if (!configKey) {
      logger.warn(`[SpaceSync] Space ${spaceId} has no config key, skipping`);
      return false;
    }

    if (!hubKey) {
      logger.warn(`[SpaceSync] Space ${spaceId} has no hub key, skipping`);
      return false;
    }

    // Save all keys first
    for (const key of keys) {
      saveSpaceKey({
        spaceId: key.spaceId,
        keyId: key.keyId,
        address: key.address,
        publicKey: key.publicKey,
        privateKey: key.privateKey,
      });
    }
    logger.log(`[SpaceSync] Saved ${keys.length} keys for space ${spaceId}`);

    // Fetch space registration info
    const client = getQuorumClient();
    let spaceRegistration;
    try {
      spaceRegistration = await client.fetchSpace(spaceId);
    } catch (error) {
      console.error(`[SpaceSync] Failed to fetch space ${spaceId}:`, error);
      return false;
    }

    // Fetch space manifest
    let manifestPayload;
    try {
      manifestPayload = await client.getSpaceManifest(spaceId);
    } catch (error) {
      console.error(`[SpaceSync] Failed to fetch manifest for ${spaceId}:`, error);
      return false;
    }

    if (!manifestPayload || !manifestPayload.space_manifest) {
      logger.warn(`[SpaceSync] No manifest found for space ${spaceId}`);
      return false;
    }

    // Parse the encrypted manifest
    let ciphertext;
    try {
      ciphertext = JSON.parse(manifestPayload.space_manifest) as {
        ciphertext: string;
        initialization_vector: string;
        associated_data?: string;
      };
    } catch (error) {
      console.error(`[SpaceSync] Failed to parse manifest for ${spaceId}:`, error);
      return false;
    }

    // Decrypt the manifest using config key
    const cryptoProvider = new NativeCryptoProvider();
    const configPrivateKeyBytes = hexToBytes(configKey.privateKey);
    const ephemeralPublicKeyBytes = hexToBytes(manifestPayload.ephemeral_public_key);

    logger.log(`[SpaceSync] Decrypting manifest for ${spaceId}:`, {
      configKeyLength: configKey.privateKey.length,
      ephemeralKeyLength: manifestPayload.ephemeral_public_key.length,
      configPrivateKeyBytesLength: configPrivateKeyBytes.length,
      ephemeralPublicKeyBytesLength: ephemeralPublicKeyBytes.length,
      hasCiphertext: !!ciphertext.ciphertext,
      hasIV: !!ciphertext.initialization_vector,
      hasAD: !!ciphertext.associated_data,
      ciphertextPrefix: ciphertext.ciphertext?.substring(0, 20),
    });

    let decryptedManifest: Space;
    try {
      const decryptResult = await cryptoProvider.decryptInboxMessage({
        inbox_private_key: configPrivateKeyBytes,
        ephemeral_public_key: ephemeralPublicKeyBytes,
        ciphertext: {
          ciphertext: ciphertext.ciphertext,
          initialization_vector: ciphertext.initialization_vector,
          associated_data: ciphertext.associated_data,
        },
      });
      decryptedManifest = JSON.parse(
        new TextDecoder().decode(new Uint8Array(decryptResult))
      ) as Space;
    } catch (error) {
      // AEAD errors typically mean the key is invalid - this can happen if:
      // 1. The user was kicked from the space (manifest re-encrypted with new key)
      // 2. The config key was rotated since this sync config was created
      // 3. The manifest data is corrupted
      const errorStr = String(error);
      if (errorStr.includes('aead') || errorStr.includes('Decryption failed')) {
        logger.warn(
          `[SpaceSync] Cannot decrypt manifest for ${spaceId} - user may have been removed from this space`
        );
      } else {
        console.error(`[SpaceSync] Failed to decrypt manifest for ${spaceId}:`, error);
      }
      logger.log(`[SpaceSync] Decrypt error details:`, {
        spaceId,
        configKeyId: configKey.keyId,
        configPublicKey: configKey.publicKey?.substring(0, 20),
        error: errorStr,
      });
      return false;
    }

    // Generate new inbox keypair for this space
    const inboxKeypair = await cryptoProvider.generateEd448();
    const inboxAddress = deriveAddress(new Uint8Array(inboxKeypair.public_key));

    // Save the space
    saveSpace(decryptedManifest);
    logger.log(`[SpaceSync] Saved space: ${decryptedManifest.spaceName || spaceId}`);

    // Save encryption state with new inbox address
    encryptionStateStorage.saveEncryptionState(
      {
        ...encryptionState,
        inboxId: inboxAddress,
      },
      true
    );

    // Register inbox with hub
    try {
      // Build hub signature: sign("add" + inbox_public_key_hex)
      const hubPrivateKeyBase64 = btoa(
        String.fromCharCode(...hexToBytes(hubKey.privateKey))
      );
      const addMessage = 'add' + bytesToHex(new Uint8Array(inboxKeypair.public_key));
      const addMessageBase64 = btoa(addMessage);
      const hubSignatureBase64 = await cryptoProvider.signEd448(
        hubPrivateKeyBase64,
        addMessageBase64
      );
      const hubSignatureHex = base64ToHex(hubSignatureBase64);

      // Build inbox signature: sign("add" + hub_public_key)
      const inboxPrivateKeyBase64 = numberArrayToBase64(inboxKeypair.private_key);
      const inboxAddMessage = 'add' + hubKey.publicKey;
      const inboxAddMessageBase64 = btoa(inboxAddMessage);
      const inboxSignatureBase64 = await cryptoProvider.signEd448(
        inboxPrivateKeyBase64,
        inboxAddMessageBase64
      );
      const inboxSignatureHex = base64ToHex(inboxSignatureBase64);

      await client.postHubAdd({
        hub_address: hubKey.address!,
        hub_public_key: hubKey.publicKey,
        hub_signature: hubSignatureHex,
        inbox_public_key: bytesToHex(new Uint8Array(inboxKeypair.public_key)),
        inbox_signature: inboxSignatureHex,
      });
      logger.log(`[SpaceSync] Registered inbox with hub for ${spaceId}`);
    } catch (error) {
      console.error(`[SpaceSync] Failed to register with hub for ${spaceId}:`, error);
      // Continue - the space is saved, just won't receive real-time updates
    }

    // Request WebSocket subscription to new inbox
    if (onListenRequest) {
      onListenRequest([inboxAddress]);
    }

    // Save inbox key
    saveSpaceKey({
      spaceId,
      keyId: 'inbox',
      address: inboxAddress,
      publicKey: bytesToHex(new Uint8Array(inboxKeypair.public_key)),
      privateKey: bytesToHex(new Uint8Array(inboxKeypair.private_key)),
    });

    // Save current user as a member of the synced space
    if (userInfo?.address) {
      const adapter = getMMKVAdapter();
      await adapter.saveSpaceMember(spaceId, {
        address: userInfo.address,
        display_name: userInfo.displayName,
        profile_image: userInfo.profileImage,
        inbox_address: inboxAddress,
      });
      logger.log(`[SpaceSync] Saved user as member of space ${spaceId}`);
    }

    logger.log(`[SpaceSync] Successfully synced space ${spaceId}`);
    return true;
  } catch (error) {
    console.error(`[SpaceSync] Failed to sync space ${spaceId}:`, error);
    return false;
  }
}

/**
 * Sync all spaces from config
 *
 * @param spaceKeys - Array of space key info from UserConfig.spaceKeys
 * @param userInfo - Current user's info to save as a member
 * @param onListenRequest - Callback to request WebSocket subscriptions
 * @returns Number of spaces successfully synced
 */
export async function syncSpacesFromConfig(
  spaceKeys: SpaceKeyInfo[],
  userInfo?: SyncUserInfo,
  onListenRequest?: (inboxAddresses: string[]) => void
): Promise<number> {
  let successCount = 0;

  for (const spaceKeyInfo of spaceKeys) {
    const success = await syncSpaceFromConfig(spaceKeyInfo, userInfo, onListenRequest);
    if (success) {
      successCount++;
    }
  }

  logger.log(`[SpaceSync] Synced ${successCount}/${spaceKeys.length} spaces`);
  return successCount;
}
