/**
 * Public profile publish/unpublish.
 *
 * The user opts in via the `isProfilePublic` toggle. When enabled, we
 * upload a signed plaintext profile to `POST /users/:addr/public-profile`
 * so that anyone (including users we don't share a space with yet) can
 * fetch it via `GET /users/:addr/public-profile`. When disabled, we
 * issue a signed DELETE to remove the record.
 *
 * Signature scheme matches the server's verification in main.go:
 *   POST   sign(userPrivKey, "public-profile:" + addr + ":" + displayName + ":" + profileImage + ":" + bio + ":" + BE64(timestamp))
 *   DELETE sign(userPrivKey, "delete-public-profile:" + addr + ":" + BE64(timestamp))
 *
 * The user's UserPublicKey on file (from the existing /users/:addr
 * registration) is what the server uses to verify.
 */

import { getQuorumClient } from '@/services/api/quorumClient';
import { NativeCryptoProvider } from '@/services/crypto/native-provider';
import { ensurePrivateKey } from '@/services/onboarding/keyService';
import { base64ToHex, numberArrayToBase64 } from '@/utils/encoding';
import { hexToBytes } from '@quilibrium/quorum-shared';

function int64BE(value: number): Uint8Array {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigUint64(0, BigInt(value), false);
  return bytes;
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

async function signWithUserKey(payload: Uint8Array): Promise<string> {
  const privateKeyHex = await ensurePrivateKey();
  if (!privateKeyHex) throw new Error('Private key not found');
  const privateKeyBytes = hexToBytes(privateKeyHex);
  const privateKeyBase64 = numberArrayToBase64(Array.from(privateKeyBytes));
  const messageBase64 = numberArrayToBase64(Array.from(payload));
  const crypto = new NativeCryptoProvider();
  const sigBase64 = await crypto.signEd448(privateKeyBase64, messageBase64);
  return base64ToHex(sigBase64);
}

export interface PublishProfileInput {
  address: string;
  displayName: string;
  profileImage: string;
  bio: string;
  /**
   * The user's chosen primary QNS name (e.g. "alice" → displayed as
   * "alice.q"). Carried in the public profile so cross-user lookups
   * (notably the Farcaster fid → Quorum identity badge) can show the
   * preferred name without needing a separate QNS reverse-lookup
   * round trip on every render.
   */
  primaryUsername?: string;
  /**
   * Optional bidirectional proof linking this Quorum identity to a
   * Farcaster account. When provided, the server verifies the
   * Quorum-side signature (proving this Quorum identity signed off on
   * the link) and indexes `farcaster-fid/<fid> → <address>` for
   * reverse lookup. Not part of the outer profile signature payload —
   * the FarcasterLink carries its own internal `quorumSignature` that
   * the server validates independently.
   */
  farcasterLink?: {
    fid: number;
    custodyAddress: string;
    farcasterSignature: string;
    quorumSignature: string;
  };
}

export async function publishPublicProfile(input: PublishProfileInput): Promise<void> {
  const timestamp = Date.now();
  const enc = new TextEncoder();

  // Two signing payload formats, picked by whether the user is claiming
  // a QNS primary username. v1 is preserved unchanged for backwards
  // compatibility — older builds that don't know about primary_username
  // continue to sign and verify exactly as before. v2 covers the
  // claim so a MITM can't strip or swap it while leaving the signature
  // valid. The server picks the same payload by the same condition.
  const payload = input.primaryUsername
    ? concatBytes(
        enc.encode(`public-profile-v2:${input.address}:${input.displayName}:${input.profileImage}:${input.bio}:${input.primaryUsername}:`),
        int64BE(timestamp),
      )
    : concatBytes(
        enc.encode(`public-profile:${input.address}:${input.displayName}:${input.profileImage}:${input.bio}:`),
        int64BE(timestamp),
      );
  const signature = await signWithUserKey(payload);

  await getQuorumClient().postPublicProfile(input.address, {
    display_name: input.displayName,
    profile_image: input.profileImage,
    bio: input.bio,
    ...(input.primaryUsername ? { primary_username: input.primaryUsername } : {}),
    timestamp,
    signature,
    ...(input.farcasterLink ? { farcaster: input.farcasterLink } : {}),
  });
}

export async function unpublishPublicProfile(address: string): Promise<void> {
  const timestamp = Date.now();
  const payload = concatBytes(
    new TextEncoder().encode(`delete-public-profile:${address}:`),
    int64BE(timestamp),
  );
  const signature = await signWithUserKey(payload);

  await getQuorumClient().deletePublicProfile(address, { timestamp, signature });
}
