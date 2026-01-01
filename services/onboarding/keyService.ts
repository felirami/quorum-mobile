/**
 * Key generation and management service for Quorum accounts
 *
 * Uses ed448 for Quorum keys (57-byte private keys, 57-byte public keys)
 * Derivation path: m/44'/1776'/0'/1/0
 */

import { logger } from '@quilibrium/quorum-shared';
import { ed448 } from '@noble/curves/ed448';
import { bytesToHex, hexToBytes, concatBytes } from '@noble/hashes/utils';
import { sha256 } from '@noble/hashes/sha2';
import { sha512 } from '@noble/hashes/sha2';
import { hmac } from '@noble/hashes/hmac';
import * as bip39 from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import * as multihashes from 'multihashes';
import bs58 from 'bs58';

// Quorum derivation path: m/44'/1776'/0'/1/0
const DERIVATION_PATH = [
  0x8000002c, // 44' (hardened)
  0x800006f0, // 1776' (hardened)
  0x80000000, // 0' (hardened)
  1,          // 1
  0,          // 0
];

export interface KeyPair {
  publicKey: string;   // hex-encoded
  privateKey: string;  // hex-encoded
  address: string;     // 0x-prefixed address
}

export interface MnemonicResult {
  mnemonic: string[];
  keyPair: KeyPair;
}

export interface ValidationResult {
  valid: boolean;
  invalidWords: number[];  // indices of invalid words
}

/**
 * Generate a new ed448 key pair
 */
export function generateKeyPair(): KeyPair {
  const privateKeyBytes = ed448.utils.randomPrivateKey();
  const publicKeyBytes = ed448.getPublicKey(privateKeyBytes);

  const privateKey = bytesToHex(privateKeyBytes);
  const publicKey = bytesToHex(publicKeyBytes);
  const address = deriveAddress(publicKeyBytes);

  return { publicKey, privateKey, address };
}

/**
 * Derive address from public key using libp2p multihash approach
 * SHA-256 hashes the public key, wraps in multihash, encodes as base58
 * Produces a "Qm..." style address
 */
export function deriveAddress(publicKey: Uint8Array | string): string {
  const keyBytes = typeof publicKey === 'string'
    ? hexToBytes(publicKey)
    : publicKey;

  // SHA-256 hash the public key
  const hash = sha256(keyBytes);

  // Wrap in multihash format (SHA-256 = 0x12)
  const multihash = multihashes.encode(hash, 'sha2-256');

  // Base58 encode to get "Qm..." address
  return bs58.encode(multihash);
}

/**
 * Generate a 24-word mnemonic and derive ed448 key pair
 */
export function generateMnemonic(): MnemonicResult {
  // Generate 256-bit entropy for 24 words
  const mnemonic = bip39.generateMnemonic(wordlist, 256);
  const words = mnemonic.split(' ');

  const keyPair = keyPairFromMnemonic(words);

  return { mnemonic: words, keyPair };
}

/**
 * Serialize a 32-bit unsigned integer as big-endian bytes
 */
function ser32(i: number): Uint8Array {
  const buf = new Uint8Array(4);
  buf[0] = (i >>> 24) & 0xff;
  buf[1] = (i >>> 16) & 0xff;
  buf[2] = (i >>> 8) & 0xff;
  buf[3] = i & 0xff;
  return buf;
}

// HMAC key for ed448 derivation (similar to SLIP-0010's "ed25519 seed")
const ED448_SEED_KEY = new TextEncoder().encode('ed448 seed');

/**
 * Derive master key and chain code from seed using SLIP-0010 style derivation
 * Returns 57 bytes key + 32 bytes chain code
 */
function deriveMasterKey(seed: Uint8Array): { key: Uint8Array; chainCode: Uint8Array } {
  // Use HMAC-SHA512 with "ed448 seed" as key (similar to SLIP-0010)
  const I = hmac(sha512, ED448_SEED_KEY, seed);

  // For ed448, we need 57 bytes for the key
  // Do a second round of HMAC to get more key material
  const I2 = hmac(sha512, ED448_SEED_KEY, I);

  // Combine first 57 bytes from I and I2 for the key
  const key = new Uint8Array(57);
  key.set(I.slice(0, 32), 0);
  key.set(I2.slice(0, 25), 32);

  // Chain code is last 32 bytes of I
  const chainCode = I.slice(32, 64);

  return { key, chainCode };
}

/**
 * Derive child key at index using SLIP-0010 style derivation
 */
function deriveChildKey(
  parentKey: Uint8Array,
  parentChainCode: Uint8Array,
  index: number
): { key: Uint8Array; chainCode: Uint8Array } {
  const isHardened = index >= 0x80000000;

  let data: Uint8Array;
  if (isHardened) {
    // Hardened: 0x00 || key || ser32(index)
    data = concatBytes(new Uint8Array([0]), parentKey, ser32(index));
  } else {
    // Normal: pubkey || ser32(index)
    const pubKey = ed448.getPublicKey(parentKey);
    data = concatBytes(pubKey, ser32(index));
  }

  const I = hmac(sha512, parentChainCode, data);
  const I2 = hmac(sha512, parentChainCode, I);

  // Combine for 57-byte key
  const key = new Uint8Array(57);
  key.set(I.slice(0, 32), 0);
  key.set(I2.slice(0, 25), 32);

  const chainCode = I.slice(32, 64);

  return { key, chainCode };
}

/**
 * Derive ed448 key pair from mnemonic phrase using path m/44'/1776'/0'/1/0
 */
export function keyPairFromMnemonic(words: string[]): KeyPair {
  const mnemonic = words.map(w => w.toLowerCase().trim()).join(' ');

  if (!bip39.validateMnemonic(mnemonic, wordlist)) {
    throw new Error('Invalid mnemonic phrase');
  }

  // Derive seed from mnemonic (64 bytes)
  const seed = bip39.mnemonicToSeedSync(mnemonic);

  // Derive master key
  let { key, chainCode } = deriveMasterKey(seed);

  // Derive through path m/44'/1776'/0'/1/0
  for (const index of DERIVATION_PATH) {
    ({ key, chainCode } = deriveChildKey(key, chainCode, index));
  }

  const privateKeyBytes = key;
  const publicKeyBytes = ed448.getPublicKey(privateKeyBytes);

  return {
    privateKey: bytesToHex(privateKeyBytes),
    publicKey: bytesToHex(publicKeyBytes),
    address: deriveAddress(publicKeyBytes),
  };
}

/**
 * Import key pair from hex-encoded private key
 */
export function keyPairFromHex(hexPrivateKey: string): KeyPair {
  const cleanHex = hexPrivateKey.replace('0x', '').trim();
  const privateKeyBytes = hexToBytes(cleanHex);

  if (privateKeyBytes.length !== 57) {
    throw new Error(`Invalid ed448 private key length: expected 57 bytes, got ${privateKeyBytes.length}`);
  }

  const publicKeyBytes = ed448.getPublicKey(privateKeyBytes);

  return {
    privateKey: cleanHex,
    publicKey: bytesToHex(publicKeyBytes),
    address: deriveAddress(publicKeyBytes),
  };
}

/**
 * Validate mnemonic words
 * Returns validation result with indices of any invalid words
 */
export function validateMnemonic(words: string[]): ValidationResult {
  const invalidWords: number[] = [];

  for (let i = 0; i < words.length; i++) {
    const word = words[i].toLowerCase().trim();
    if (word && !wordlist.includes(word)) {
      invalidWords.push(i);
    }
  }

  // Check if we have correct word count (12, 15, 18, 21, or 24)
  const validWordCounts = [12, 15, 18, 21, 24];
  const nonEmptyWords = words.filter(w => w.trim().length > 0);

  if (!validWordCounts.includes(nonEmptyWords.length)) {
    return { valid: false, invalidWords };
  }

  // Final validation using bip39
  const mnemonic = nonEmptyWords.map(w => w.toLowerCase().trim()).join(' ');
  const valid = invalidWords.length === 0 && bip39.validateMnemonic(mnemonic, wordlist);

  return { valid, invalidWords };
}

/**
 * Get a single word suggestion from partial input
 */
export function suggestWord(partial: string): string[] {
  const lower = partial.toLowerCase().trim();
  if (lower.length < 2) return [];

  return wordlist
    .filter(word => word.startsWith(lower))
    .slice(0, 5);
}

/**
 * Format address for display (shortened)
 * For Qm... addresses, show first and last N chars
 */
export function formatAddress(address: string, chars: number = 6): string {
  if (address.length <= chars * 2) return address;
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

/**
 * Validate a hex string
 */
export function isValidHex(hex: string): boolean {
  const clean = hex.replace('0x', '');
  return /^[0-9a-fA-F]+$/.test(clean);
}

// ============ X448 Pre-Key for E2E Encryption ============

import { NativeCryptoProvider } from '../crypto';
import {
  storePreKey,
  storeIdentityX448,
  storeInboxEncryptionKey,
  storeInboxSigningKey,
  storeInboxAddress,
  storePublicKey,
  getPreKey,
  getIdentityX448,
  getInboxEncryptionKey,
  getInboxSigningKey,
  getInboxAddress,
  type DeviceKeyset as StoredDeviceKeyset,
} from './secureStorage';

export interface EncryptionKeyPair {
  publicKey: number[];
  privateKey: number[];
  inboxAddress: string;
}

/**
 * Full device encryption keyset matching desktop SDK structure
 */
export interface DeviceEncryptionKeyset {
  /** X448 identity key for X3DH */
  identityKey: { publicKey: number[]; privateKey: number[] };
  /** X448 signed pre-key for X3DH */
  preKey: { publicKey: number[]; privateKey: number[] };
  /** X448 inbox encryption key for unsealing */
  inboxEncryptionKey: { publicKey: number[]; privateKey: number[] };
  /** Ed448 inbox signing key for signing delete requests */
  inboxSigningKey: { publicKey: number[]; privateKey: number[] };
  /** Inbox address derived from inbox encryption public key */
  inboxAddress: string;
}

/**
 * Generate all keys needed for E2E encryption
 * Uses the native crypto module for key generation
 * - X448 keys for encryption (identity, pre-key, inbox encryption)
 * - Ed448 key for inbox signing (used for delete requests)
 */
export async function generateDeviceEncryptionKeyset(): Promise<DeviceEncryptionKeyset> {
  const cryptoProvider = new NativeCryptoProvider();

  // Generate three X448 key pairs and one Ed448 key pair
  const [identityKeypair, preKeypair, inboxEncryptionKeypair, inboxSigningKeypair] = await Promise.all([
    cryptoProvider.generateX448(),
    cryptoProvider.generateX448(),
    cryptoProvider.generateX448(),
    cryptoProvider.generateEd448(),
  ]);

  // Derive inbox address from Ed448 inbox signing public key (NOT X448 encryption key)
  // This matches desktop SDK's NewInboxKeyset which derives from inbox_key (Ed448)
  const inboxAddress = deriveAddress(new Uint8Array(inboxSigningKeypair.public_key));

  return {
    identityKey: {
      publicKey: identityKeypair.public_key,
      privateKey: identityKeypair.private_key,
    },
    preKey: {
      publicKey: preKeypair.public_key,
      privateKey: preKeypair.private_key,
    },
    inboxEncryptionKey: {
      publicKey: inboxEncryptionKeypair.public_key,
      privateKey: inboxEncryptionKeypair.private_key,
    },
    inboxSigningKey: {
      publicKey: inboxSigningKeypair.public_key,
      privateKey: inboxSigningKeypair.private_key,
    },
    inboxAddress,
  };
}

/**
 * Initialize encryption keys for E2E messaging
 * Generates all keys needed for X3DH, envelope unsealing, and inbox signing
 * Also stores the Ed448 identity public key (for signing, not encryption)
 *
 * @param identityPublicKey The user's Ed448 identity public key (hex string) - for signing
 * @returns The generated device encryption keyset
 */
export async function initializeEncryptionKeys(
  identityPublicKey: string
): Promise<DeviceEncryptionKeyset> {
  // Store Ed448 identity public key (for signing operations)
  await storePublicKey(identityPublicKey);

  // Check if we already have encryption keys
  const [existingIdentityX448, existingPreKey, existingInboxEncKey, existingInboxSignKey, existingInboxAddress] = await Promise.all([
    getIdentityX448(),
    getPreKey(),
    getInboxEncryptionKey(),
    getInboxSigningKey(),
    getInboxAddress(),
  ]);

  if (existingIdentityX448 && existingPreKey && existingInboxEncKey && existingInboxSignKey && existingInboxAddress) {
    return {
      identityKey: existingIdentityX448,
      preKey: existingPreKey,
      inboxEncryptionKey: existingInboxEncKey,
      inboxSigningKey: existingInboxSignKey,
      inboxAddress: existingInboxAddress,
    };
  }

  // Generate new device encryption keyset
  const keyset = await generateDeviceEncryptionKeyset();

  // Store all keys securely
  await Promise.all([
    storeIdentityX448(
      JSON.stringify(keyset.identityKey.privateKey),
      JSON.stringify(keyset.identityKey.publicKey)
    ),
    storePreKey(
      JSON.stringify(keyset.preKey.privateKey),
      JSON.stringify(keyset.preKey.publicKey)
    ),
    storeInboxEncryptionKey(
      JSON.stringify(keyset.inboxEncryptionKey.privateKey),
      JSON.stringify(keyset.inboxEncryptionKey.publicKey)
    ),
    storeInboxSigningKey(
      JSON.stringify(keyset.inboxSigningKey.privateKey),
      JSON.stringify(keyset.inboxSigningKey.publicKey)
    ),
    storeInboxAddress(keyset.inboxAddress),
  ]);

  return keyset;
}

// Legacy function for backward compatibility
export async function generateEncryptionKeys(): Promise<EncryptionKeyPair> {
  const keyset = await generateDeviceEncryptionKeyset();
  return {
    publicKey: keyset.preKey.publicKey,
    privateKey: keyset.preKey.privateKey,
    inboxAddress: keyset.inboxAddress,
  };
}

// ============ Registration Upload ============

import { getQuorumClient, type UserRegistration, type DeviceRegistration, type InboxRegistration } from '../api/quorumClient';

/**
 * Convert stored device keyset to encryption keyset format
 */
export function storedKeysetToEncryptionKeyset(stored: StoredDeviceKeyset): DeviceEncryptionKeyset {
  return {
    identityKey: {
      publicKey: stored.identityPublicKey,
      privateKey: stored.identityPrivateKey,
    },
    preKey: {
      publicKey: stored.preKeyPublicKey,
      privateKey: stored.preKeyPrivateKey,
    },
    inboxEncryptionKey: {
      publicKey: stored.inboxEncryptionPublicKey,
      privateKey: stored.inboxEncryptionPrivateKey,
    },
    inboxSigningKey: {
      publicKey: stored.inboxSigningPublicKey,
      privateKey: stored.inboxSigningPrivateKey,
    },
    inboxAddress: stored.inboxAddress,
  };
}

/**
 * Build UserRegistration from user keys and device encryption keyset
 *
 * This creates the structure the server expects for E2E messaging registration
 */
export function buildUserRegistration(
  userAddress: string,
  userPublicKey: string,  // Ed448 public key (hex)
  peerPublicKey: string,  // Ed448 peer public key (hex) - same as user for now
  deviceKeyset: DeviceEncryptionKeyset,
  signature: string       // Ed448 signature of the registration data (hex)
): UserRegistration {
  // Convert byte arrays to hex strings
  const identityPublicKeyHex = deviceKeyset.identityKey.publicKey
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  const prePublicKeyHex = deviceKeyset.preKey.publicKey
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  const inboxEncryptionPublicKeyHex = deviceKeyset.inboxEncryptionKey.publicKey
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  // Ed448 inbox signing key for verifying delete requests
  const inboxSigningPublicKeyHex = deviceKeyset.inboxSigningKey.publicKey
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  const inboxRegistration: InboxRegistration = {
    inbox_address: deviceKeyset.inboxAddress,
    inbox_encryption_public_key: inboxEncryptionPublicKeyHex,
    inbox_public_key: inboxSigningPublicKeyHex,
  };

  const deviceRegistration: DeviceRegistration = {
    identity_public_key: identityPublicKeyHex,
    pre_public_key: prePublicKeyHex,
    inbox_registration: inboxRegistration,
  };

  return {
    user_address: userAddress,
    user_public_key: userPublicKey,
    peer_public_key: peerPublicKey,
    device_registrations: [deviceRegistration],
    signature,
  };
}

/**
 * Convert a number array to a base64 string
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
 * Convert a base64 string to a hex string
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
 * Build device registration from keyset
 */
function buildDeviceRegistration(keyset: DeviceEncryptionKeyset): DeviceRegistration {
  const identityPublicKeyHex = keyset.identityKey.publicKey
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  const prePublicKeyHex = keyset.preKey.publicKey
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  const inboxEncryptionPublicKeyHex = keyset.inboxEncryptionKey.publicKey
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  const inboxSigningPublicKeyHex = keyset.inboxSigningKey.publicKey
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  return {
    identity_public_key: identityPublicKeyHex,
    pre_public_key: prePublicKeyHex,
    inbox_registration: {
      inbox_address: keyset.inboxAddress,
      inbox_encryption_public_key: inboxEncryptionPublicKeyHex,
      inbox_public_key: inboxSigningPublicKeyHex,
    },
  };
}

/**
 * Upload user registration to the server
 * This makes the user's encryption keys available for others to initiate E2E conversations
 *
 * IMPORTANT: This function MERGES the new device with existing devices rather than overwriting.
 * This ensures multi-device support when importing an existing account on a new device.
 *
 * @param userAddress - User's address (Qm...)
 * @param userPublicKey - User's Ed448 public key (hex)
 * @param userPrivateKey - User's Ed448 private key (hex) - for signing
 * @param deviceKeyset - Device encryption keyset (X448 keys) - can be either format
 */
export async function uploadUserRegistration(
  userAddress: string,
  userPublicKey: string,
  userPrivateKey: string,
  deviceKeyset: DeviceEncryptionKeyset | StoredDeviceKeyset
): Promise<void> {
  const cryptoProvider = new NativeCryptoProvider();
  const client = getQuorumClient();

  // Convert StoredDeviceKeyset to DeviceEncryptionKeyset if needed
  const keyset: DeviceEncryptionKeyset = 'identityKey' in deviceKeyset
    ? deviceKeyset
    : storedKeysetToEncryptionKeyset(deviceKeyset);

  // Build our new device registration
  const newDeviceReg = buildDeviceRegistration(keyset);

  // Fetch existing registration to merge with (if any)
  let existingDevices: DeviceRegistration[] = [];
  try {
    const existingReg = await client.fetchUserRegistration(userAddress);
    if (existingReg && existingReg.device_registrations) {
      // Filter out any existing registration with the same inbox address (replacing our own)
      existingDevices = existingReg.device_registrations.filter(
        (d) => d.inbox_registration.inbox_address !== keyset.inboxAddress
      );
      logger.log('[Registration] Found existing registration with', existingReg.device_registrations.length, 'devices');
    }
  } catch (fetchError) {
    // No existing registration or fetch failed - that's fine, we'll create a new one
    logger.log('[Registration] No existing registration found, creating new');
  }

  // Merge: existing devices + our new device
  const allDevices = [...existingDevices, newDeviceReg];

  logger.log('[Registration] Merging devices:', {
    existingCount: existingDevices.length,
    newDevice: keyset.inboxAddress.substring(0, 12),
    totalCount: allDevices.length,
  });

  // Build the data to sign (matching desktop SDK format):
  // peer_public_key + for each device: (identity_public_key + pre_public_key + inbox_address_bytes + inbox_encryption_public_key)
  const peerPublicKeyBytes = hexToBytes(userPublicKey);

  // Concatenate data for ALL devices
  const deviceDataArrays: Uint8Array[] = [];
  for (const device of allDevices) {
    const identityBytes = hexToBytes(device.identity_public_key);
    const preBytes = hexToBytes(device.pre_public_key);
    const inboxAddressBytes = bs58.decode(device.inbox_registration.inbox_address);
    const inboxEncryptionBytes = hexToBytes(device.inbox_registration.inbox_encryption_public_key);

    deviceDataArrays.push(new Uint8Array([
      ...identityBytes,
      ...preBytes,
      ...inboxAddressBytes,
      ...inboxEncryptionBytes,
    ]));
  }

  // Concatenate: peer_public_key + all device data
  const allDeviceData = deviceDataArrays.reduce((acc, arr) => new Uint8Array([...acc, ...arr]), new Uint8Array());
  const dataToSign = new Uint8Array([
    ...peerPublicKeyBytes,
    ...allDeviceData,
  ]);

  // Sign with Ed448 - native module expects base64 inputs
  const privateKeyBase64 = btoa(
    String.fromCharCode(...hexToBytes(userPrivateKey))
  );
  const messageBase64 = numberArrayToBase64(Array.from(dataToSign));

  const signatureBase64 = await cryptoProvider.signEd448(privateKeyBase64, messageBase64);
  const signatureHex = base64ToHex(signatureBase64);

  // Build registration with all devices and new signature
  const registration: UserRegistration = {
    user_address: userAddress,
    user_public_key: userPublicKey,
    peer_public_key: userPublicKey,
    device_registrations: allDevices,
    signature: signatureHex,
  };

  logger.log('[Registration] Uploading merged registration:', {
    user_address: registration.user_address,
    device_count: registration.device_registrations.length,
    inbox_addresses: registration.device_registrations.map(d => d.inbox_registration.inbox_address.substring(0, 12)),
    signature_length: registration.signature.length,
  });

  await client.uploadRegistration(registration);

  logger.log('[Registration] Upload successful');
}
