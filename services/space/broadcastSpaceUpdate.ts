/**
 * broadcastSpaceUpdate - Broadcast space manifest updates to all members
 *
 * This module provides the core functionality to:
 * 1. Encrypt the space manifest with the config key
 * 2. Sign with the owner key
 * 3. Post to the API
 * 4. Create the WebSocket envelope for hub broadcast
 *
 * Used by useUpdateSpace and useRoleManagement hooks.
 */

import { logger } from '@quilibrium/quorum-shared';
import { bytesToHex, hexToBytes, int64ToBytes } from '@quilibrium/quorum-shared';
import { getSpaceKey } from '@/services/config/spaceStorage';
import { getQuorumClient } from '@/services/api/quorumClient';
import { NativeCryptoProvider } from '@/services/crypto/native-provider';
import { sendSpaceManifestMessage, type SpaceManifest } from './spaceMessageService';
import type { Space } from '@quilibrium/quorum-shared';

/**
 * Helper to convert number array to base64
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
 * Helper to convert base64 to hex
 */
function base64ToHex(base64: string): string {
  const binary = atob(base64);
  let hex = '';
  for (let i = 0; i < binary.length; i++) {
    hex += binary.charCodeAt(i).toString(16).padStart(2, '0');
  }
  return hex;
}

export interface BroadcastSpaceUpdateResult {
  manifest: SpaceManifest;
  wsEnvelope: string;
}

/**
 * Create and broadcast a space manifest update
 *
 * This performs the full flow matching desktop SpaceService.updateSpace:
 * 1. Encrypt space manifest with config key
 * 2. Sign with owner key
 * 3. Post to API
 * 4. Return WebSocket envelope for hub broadcast
 *
 * @param space - The updated space object
 * @returns The manifest and WebSocket envelope, or null if keys are missing
 */
export async function broadcastSpaceUpdate(
  space: Space
): Promise<BroadcastSpaceUpdateResult | null> {
  const configKey = getSpaceKey(space.spaceId, 'config');
  const ownerKey = getSpaceKey(space.spaceId, 'owner');

  if (!configKey || !ownerKey) {
    logger.log('[broadcastSpaceUpdate] Missing keys for space:', space.spaceId);
    return null;
  }

  const timestamp = Date.now();
  const cryptoProvider = new NativeCryptoProvider();

  try {
    // 1. Encrypt space manifest with config key
    const ephemeralKeypair = await cryptoProvider.generateX448();
    const spaceJson = JSON.stringify(space);
    const spaceBytes = new TextEncoder().encode(spaceJson);

    const configPublicKeyBytes = hexToBytes(configKey.publicKey);

    const ciphertext = await cryptoProvider.encryptInboxMessage({
      inbox_public_key: Array.from(configPublicKeyBytes),
      ephemeral_private_key: ephemeralKeypair.private_key,
      plaintext: Array.from(spaceBytes),
    });

    // 2. Sign with owner key
    const timestampBytes = int64ToBytes(timestamp);
    const manifestWithTimestamp = new Uint8Array([
      ...new TextEncoder().encode(ciphertext),
      ...timestampBytes,
    ]);
    const manifestPayloadBase64 = numberArrayToBase64(Array.from(manifestWithTimestamp));

    const ownerPrivateKeyBytes = hexToBytes(ownerKey.privateKey);
    const ownerPrivateKeyBase64 = numberArrayToBase64(Array.from(ownerPrivateKeyBytes));
    const manifestSignatureBase64 = await cryptoProvider.signEd448(ownerPrivateKeyBase64, manifestPayloadBase64);
    const manifestSignatureHex = base64ToHex(manifestSignatureBase64);

    const manifest: SpaceManifest = {
      space_address: space.spaceId,
      space_manifest: ciphertext,
      ephemeral_public_key: bytesToHex(new Uint8Array(ephemeralKeypair.public_key)),
      timestamp,
      owner_public_key: ownerKey.publicKey,
      owner_signature: manifestSignatureHex,
    };

    // 3. Post to API
    const client = getQuorumClient();
    try {
      await client.postSpaceManifest(space.spaceId, manifest);
      logger.log('[broadcastSpaceUpdate] Manifest uploaded to API');
    } catch (apiError) {
      logger.log('[broadcastSpaceUpdate] Failed to upload manifest to API:', apiError);
      // Continue - hub broadcast is more important for real-time sync
    }

    // 4. Create WebSocket envelope
    const wsEnvelope = await sendSpaceManifestMessage(space.spaceId, manifest);
    logger.log('[broadcastSpaceUpdate] WebSocket envelope created');

    return { manifest, wsEnvelope };
  } catch (error) {
    console.error('[broadcastSpaceUpdate] Failed to create broadcast:', error);
    return null;
  }
}
