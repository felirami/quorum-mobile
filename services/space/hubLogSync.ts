/**
 * Frame builders + orchestration helpers for the per-hub log transport.
 *
 * Server validates each frame's hub_signature against the hub_public_key, then
 * cross-checks `multihash(SHA2_256, hubPublicKey) === base58(hubAddress)`.
 * Skew tolerance is 30s.
 */

import { NativeCryptoProvider } from '@/services/crypto/native-provider';
import { base64ToHex, numberArrayToBase64 } from '@/utils/encoding';
import { logger, hexToBytes } from '@quilibrium/quorum-shared';
import { getSpaceKey } from '@/services/config/spaceStorage';
import { getHubLastSeq } from './hubLogCursor';

export type HubKey = {
  publicKey: string; // hex, 228 chars (114 bytes)
  privateKey: string;
  address: string;
};

function hexToNumberArray(hex: string): number[] {
  return Array.from(hexToBytes(hex));
}

async function signWithHubKey(privateKeyHex: string, payload: string): Promise<string> {
  const cryptoProvider = new NativeCryptoProvider();
  const messageBytes = new TextEncoder().encode(payload);
  const messageBase64 = numberArrayToBase64(Array.from(messageBytes));
  const privateKeyBase64 = numberArrayToBase64(hexToNumberArray(privateKeyHex));
  const sigBase64 = await cryptoProvider.signEd448(privateKeyBase64, messageBase64);
  return base64ToHex(sigBase64);
}

export async function buildListenHubFrame(
  hubKey: HubKey,
  inboxAddress: string,
): Promise<string> {
  const timestamp = Date.now();
  const toSign = `${hubKey.address}:${inboxAddress}:${timestamp}`;
  const signatureHex = await signWithHubKey(hubKey.privateKey, toSign);
  return JSON.stringify({
    type: 'listen-hub',
    hub_address: hubKey.address,
    inbox_address: inboxAddress,
    hub_public_key: hubKey.publicKey,
    hub_signature: signatureHex,
    timestamp,
  });
}

export async function buildLogSinceFrame(
  hubKey: HubKey,
  since: number,
  limit: number,
  requestId?: string,
): Promise<string> {
  const timestamp = Date.now();
  const toSign = `${hubKey.address}:${since}:${timestamp}`;
  const signatureHex = await signWithHubKey(hubKey.privateKey, toSign);
  return JSON.stringify({
    type: 'log-since',
    hub_address: hubKey.address,
    since,
    limit,
    hub_public_key: hubKey.publicKey,
    hub_signature: signatureHex,
    timestamp,
    ...(requestId ? { request_id: requestId } : {}),
  });
}

/**
 * Subscribe to a space's hub log and replay from the stored cursor.
 * Used post-join so the space gets its history without waiting for a
 * WS reconnect (the on-connect path only iterates spaces present at
 * connect time).
 */
export async function subscribeAndCatchUpHubLog(
  spaceId: string,
  enqueueOutbound: (prepare: () => Promise<string[]>) => void,
): Promise<void> {
  const hubKey = getSpaceKey(spaceId, 'hub');
  const inboxKey = getSpaceKey(spaceId, 'inbox');
  if (
    !hubKey?.address || !hubKey.privateKey || !hubKey.publicKey ||
    !inboxKey?.address
  ) {
    logger.warn(`[hub-log] subscribeAndCatchUpHubLog skipped — missing keys for ${spaceId.slice(0, 12)}`);
    return;
  }
  const key: HubKey = {
    address: hubKey.address,
    publicKey: hubKey.publicKey,
    privateKey: hubKey.privateKey,
  };
  try {
    const listenFrame = await buildListenHubFrame(key, inboxKey.address);
    enqueueOutbound(async () => [listenFrame]);
    const since = getHubLastSeq(hubKey.address);
    const sinceFrame = await buildLogSinceFrame(key, since, 200);
    enqueueOutbound(async () => [sinceFrame]);
  } catch (e) {
    logger.warn('[hub-log] subscribeAndCatchUpHubLog failed', e);
  }
}
