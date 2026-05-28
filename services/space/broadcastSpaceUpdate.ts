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

import { base64ToHex, numberArrayToBase64 } from '@/utils/encoding';
import { logger, bytesToHex, hexToBytes, int64ToBytes } from '@quilibrium/quorum-shared';
import { getSpaceKey } from '@/services/config/spaceStorage';
import { getQuorumClient } from '@/services/api/quorumClient';
import { NativeCryptoProvider } from '@/services/crypto/native-provider';
import { sendSpaceManifestMessage, type SpaceManifest } from './spaceMessageService';
import type { Space } from '@quilibrium/quorum-shared';

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

    // 3. Post to API. Surface failures so callers can decide how to react —
    // the previous silent swallow caused invites to fail forever with no
    // signal when this upload didn't land at space creation time.
    const client = getQuorumClient();
    await client.postSpaceManifest(space.spaceId, manifest);

    // 4. Create WebSocket envelope
    const wsEnvelope = await sendSpaceManifestMessage(space.spaceId, manifest);

    return { manifest, wsEnvelope };
  } catch (error) {
    // Log and rethrow so callers see the real failure instead of guessing
    // from a silent null. Previously this swallow caused invite self-heal
    // to silently fail and the user would still see "manifest missing".
    logger.warn('[broadcastSpaceUpdate] failed', error);
    throw error;
  }
}
