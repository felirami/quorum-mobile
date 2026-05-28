/**
 * Blind RSA Token Service
 *
 * Implements RSA blind signatures for anonymous relay circuit authorization.
 *
 * Flow:
 * 1. Fetch server's RSA public key (n, e)
 * 2. Generate a random 32-byte token
 * 3. Blind it: blinded = (token * r^e) mod n
 * 4. Send blinded token to server (with Ed448 auth) -> get blind signature
 * 5. Unblind: signature = (blindSig * r^(-1)) mod n
 * 6. Use token + signature to anonymously allocate a circuit
 *
 * The server signs the blinded value without seeing the real token, so it
 * cannot link issuance (which requires identity) to redemption (anonymous).
 */

import { getApiConfig } from '../api/config';
import { logger } from '@quilibrium/quorum-shared';
// --- BigInt hex helpers ---

function hexToBigInt(hex: string): bigint {
  if (hex.length === 0) return 0n;
  return BigInt('0x' + hex);
}

function bigIntToHex(n: bigint): string {
  const hex = n.toString(16);
  // Ensure even length for proper byte encoding
  return hex.length % 2 === 0 ? hex : '0' + hex;
}

// --- Modular arithmetic ---

function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  if (mod === 1n) return 0n;
  let result = 1n;
  base = ((base % mod) + mod) % mod;
  while (exp > 0n) {
    if (exp % 2n === 1n) {
      result = (result * base) % mod;
    }
    exp = exp >> 1n;
    base = (base * base) % mod;
  }
  return result;
}

/**
 * Extended Euclidean algorithm.
 * Returns [gcd, x, y] such that a*x + b*y = gcd.
 */
function extGcd(a: bigint, b: bigint): [bigint, bigint, bigint] {
  if (a === 0n) return [b, 0n, 1n];
  const [g, x, y] = extGcd(b % a, a);
  return [g, y - (b / a) * x, x];
}

function modInverse(a: bigint, m: bigint): bigint {
  const [g, x] = extGcd(((a % m) + m) % m, m);
  if (g !== 1n) {
    throw new Error('modular inverse does not exist');
  }
  return ((x % m) + m) % m;
}

// --- Random bytes ---

function randomBytes(length: number): Uint8Array {
  const arr = new Uint8Array(length);
  // React Native has global crypto.getRandomValues
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(arr);
  } else {
    // Fallback: Math.random (not cryptographically secure, but better than nothing)
    for (let i = 0; i < length; i++) {
      arr[i] = Math.floor(Math.random() * 256);
    }
  }
  return arr;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// --- RSA Public Key Cache ---

interface RSAPublicKey {
  n: bigint;
  e: bigint;
  nHex: string; // for size reference
}

let cachedPublicKey: RSAPublicKey | null = null;
let publicKeyFetchPromise: Promise<RSAPublicKey> | null = null;

async function fetchRSAPublicKey(): Promise<RSAPublicKey> {
  // Deduplicate concurrent fetches
  if (publicKeyFetchPromise) {
    return publicKeyFetchPromise;
  }

  publicKeyFetchPromise = (async () => {
    try {
      const url = `${getApiConfig().baseUrl}/relay/token/public-key`;
      logger.debug(`[BlindToken] Fetching RSA public key from ${url}`);

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch public key: ${response.status}`);
      }

      const data = await response.json();
      const key: RSAPublicKey = {
        n: hexToBigInt(data.n),
        e: BigInt(data.e),
        nHex: data.n,
      };

      cachedPublicKey = key;
      logger.debug(
        `[BlindToken] Cached RSA public key (${key.nHex.length * 4}-bit modulus)`,
      );
      return key;
    } finally {
      publicKeyFetchPromise = null;
    }
  })();

  return publicKeyFetchPromise;
}

async function getRSAPublicKey(): Promise<RSAPublicKey> {
  if (cachedPublicKey) return cachedPublicKey;
  return fetchRSAPublicKey();
}

/** Force-refresh the cached public key (e.g. after server key rotation). */
export function invalidatePublicKeyCache(): void {
  cachedPublicKey = null;
}

// --- Blind Token ---

export interface BlindToken {
  /** The raw token (hex), to be sent with the circuit request. */
  token: string;
  /** The unblinded RSA signature (hex) proving the token was server-authorized. */
  signature: string;
}

/**
 * Obtain a blind token from the server.
 *
 * This requires Ed448 authentication (the server needs to verify the requester
 * is a valid user), but the resulting token is unlinkable to this identity.
 *
 * @param callerAddress - The user's address for Ed448 auth
 * @param signMessage - Signs a string payload, returns hex signature
 */
export async function obtainBlindToken(
  callerAddress: string,
  signMessage: (msg: string) => Promise<string>,
): Promise<BlindToken> {
  const pubKey = await getRSAPublicKey();
  const { n, e } = pubKey;

  // 1. Generate a random 32-byte token
  const tokenBytes = randomBytes(32);
  const tokenHex = bytesToHex(tokenBytes);
  const tokenInt = hexToBigInt(tokenHex);

  // Ensure token is in range [2, n-1]
  // For a 2048-bit modulus and 256-bit token, this is always true,
  // but we check anyway.
  if (tokenInt < 2n || tokenInt >= n) {
    throw new Error('token out of range (astronomically unlikely)');
  }

  // 2. Generate random blinding factor r, coprime with n
  //    For RSA-2048, a random 256-byte value reduced mod n works.
  //    We need gcd(r, n) = 1, which is virtually certain for random r.
  let r: bigint;
  for (;;) {
    const rBytes = randomBytes(256);
    r = hexToBigInt(bytesToHex(rBytes)) % n;
    if (r >= 2n) break; // effectively always true
  }

  // 3. Blind the token: blinded = (token * r^e) mod n
  const rE = modPow(r, e, n);
  const blinded = (tokenInt * rE) % n;
  const blindedHex = bigIntToHex(blinded);

  // 4. Send to server for signing (with Ed448 auth)
  const timestamp = Date.now().toString();
  const signPayload = `relay:token:issue:${callerAddress}:${timestamp}`;
  const signature = await signMessage(signPayload);

  const url = `${getApiConfig().baseUrl}/relay/token/issue`;
  logger.debug(`[BlindToken] Requesting blind signature from ${url}`);

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      caller_address: callerAddress,
      signature,
      timestamp,
      blinded_token: blindedHex,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    logger.debug(`[BlindToken] Issue failed: ${response.status} ${body}`);
    throw new Error(`Blind token issuance failed: ${response.status}`);
  }

  const data = await response.json();
  const blindSigHex: string = data.blind_signature;

  // 5. Unblind: sig = (blindSig * r^(-1)) mod n
  const blindSigInt = hexToBigInt(blindSigHex);
  const rInv = modInverse(r, n);
  const sigInt = (blindSigInt * rInv) % n;
  const sigHex = bigIntToHex(sigInt);

  logger.debug('[BlindToken] Successfully obtained blind token');

  return {
    token: tokenHex,
    signature: sigHex,
  };
}

// --- Token Cache ---
// We keep one pre-fetched token ready so circuit allocation doesn't
// have the latency of token issuance on the critical path.

let cachedToken: BlindToken | null = null;
let tokenFetchPromise: Promise<BlindToken | null> | null = null;

/**
 * Get a blind token, using cache if available.
 * Falls back to null if issuance fails (caller should use Ed448 path).
 */
export async function getBlindToken(
  callerAddress: string,
  signMessage: (msg: string) => Promise<string>,
): Promise<BlindToken | null> {
  // Return cached token and start fetching a replacement
  if (cachedToken) {
    const token = cachedToken;
    cachedToken = null;
    // Pre-fetch next token in the background
    prefetchBlindToken(callerAddress, signMessage);
    return token;
  }

  // If already fetching, wait for that
  if (tokenFetchPromise) {
    return tokenFetchPromise;
  }

  // Fetch fresh
  tokenFetchPromise = (async () => {
    try {
      return await obtainBlindToken(callerAddress, signMessage);
    } catch (err) {
      logger.debug('[BlindToken] Failed to obtain token, will fall back to Ed448:', err);
      return null;
    } finally {
      tokenFetchPromise = null;
    }
  })();

  return tokenFetchPromise;
}

/**
 * Pre-fetch a blind token in the background so it's ready when needed.
 * Call this after login or after using a token.
 */
export function prefetchBlindToken(
  callerAddress: string,
  signMessage: (msg: string) => Promise<string>,
): void {
  if (cachedToken || tokenFetchPromise) return;

  tokenFetchPromise = (async () => {
    try {
      const token = await obtainBlindToken(callerAddress, signMessage);
      cachedToken = token;
      logger.debug('[BlindToken] Pre-fetched token cached');
      return token;
    } catch (err) {
      logger.debug('[BlindToken] Pre-fetch failed:', err);
      return null;
    } finally {
      tokenFetchPromise = null;
    }
  })();
}
