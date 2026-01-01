/**
 * Secure storage service for sensitive data
 *
 * Uses expo-secure-store for encrypted storage on device
 * Keys are stored with WHEN_UNLOCKED_THIS_DEVICE_ONLY for maximum security
 */

import * as SecureStore from 'expo-secure-store';

const STORAGE_KEYS = {
  // Quorum keys (Ed448 - for signing/identity)
  QUORUM_PRIVATE_KEY: 'quorum.privateKey',
  QUORUM_PUBLIC_KEY: 'quorum.publicKey',
  QUORUM_MNEMONIC: 'quorum.mnemonic',

  // X448 identity key for E2E encryption (X3DH)
  QUORUM_IDENTITY_X448_PRIVATE: 'quorum.identityX448Private',
  QUORUM_IDENTITY_X448_PUBLIC: 'quorum.identityX448Public',

  // X448 pre-key for E2E encryption (X3DH signed pre-key)
  QUORUM_PREKEY_PRIVATE: 'quorum.preKeyPrivate',
  QUORUM_PREKEY_PUBLIC: 'quorum.preKeyPublic',

  // X448 inbox encryption key (for unsealing envelopes)
  QUORUM_INBOX_ENCRYPTION_PRIVATE: 'quorum.inboxEncryptionPrivate',
  QUORUM_INBOX_ENCRYPTION_PUBLIC: 'quorum.inboxEncryptionPublic',

  // Ed448 inbox signing key (for signing delete requests)
  QUORUM_INBOX_SIGNING_PRIVATE: 'quorum.inboxSigningPrivate',
  QUORUM_INBOX_SIGNING_PUBLIC: 'quorum.inboxSigningPublic',

  // Inbox address (derived from inbox encryption key)
  QUORUM_INBOX_ADDRESS: 'quorum.inboxAddress',

  // Farcaster keys
  FARCASTER_SIGNER_KEY: 'farcaster.signerKey',
  FARCASTER_CUSTODY_KEY: 'farcaster.custodyKey',  // secp256k1 private key for SIWE signing
  FARCASTER_FID: 'farcaster.fid',
  FARCASTER_AUTH_TOKEN: 'farcaster.authToken',  // API auth token for Farcaster API calls

  // Onboarding state (for resume)
  ONBOARDING_STATE: 'onboarding.state',
} as const;

const SECURE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

// ============ Quorum Keys ============

/**
 * Store the Quorum private key securely
 */
export async function storePrivateKey(privateKey: string): Promise<void> {
  await SecureStore.setItemAsync(
    STORAGE_KEYS.QUORUM_PRIVATE_KEY,
    privateKey,
    SECURE_OPTIONS
  );
}

/**
 * Retrieve the Quorum private key
 */
export async function getPrivateKey(): Promise<string | null> {
  return SecureStore.getItemAsync(STORAGE_KEYS.QUORUM_PRIVATE_KEY);
}

/**
 * Delete the Quorum private key
 */
export async function deletePrivateKey(): Promise<void> {
  await SecureStore.deleteItemAsync(STORAGE_KEYS.QUORUM_PRIVATE_KEY);
}

/**
 * Check if a private key exists
 */
export async function hasPrivateKey(): Promise<boolean> {
  const key = await getPrivateKey();
  return key !== null;
}

/**
 * Store the Quorum public key
 */
export async function storePublicKey(publicKey: string): Promise<void> {
  await SecureStore.setItemAsync(
    STORAGE_KEYS.QUORUM_PUBLIC_KEY,
    publicKey,
    SECURE_OPTIONS
  );
}

/**
 * Retrieve the Quorum public key
 */
export async function getPublicKey(): Promise<string | null> {
  return SecureStore.getItemAsync(STORAGE_KEYS.QUORUM_PUBLIC_KEY);
}

// ============ X448 Pre-Key Storage (for E2E Encryption) ============

/**
 * Device keyset for E2E encryption
 *
 * Matches desktop SDK's DeviceKeyset structure:
 * - identity_key: X448 key for X3DH (NOT the Ed448 user signing key)
 * - pre_key: X448 signed pre-key for X3DH
 * - inbox_keyset: X448 encryption key for unsealing + address
 */
export interface DeviceKeyset {
  /** X448 identity key for X3DH - private key */
  identityPrivateKey: number[];
  /** X448 identity key for X3DH - public key */
  identityPublicKey: number[];
  /** X448 signed pre-key for X3DH - private key */
  preKeyPrivateKey: number[];
  /** X448 signed pre-key for X3DH - public key */
  preKeyPublicKey: number[];
  /** X448 inbox encryption key for unsealing envelopes - private key */
  inboxEncryptionPrivateKey: number[];
  /** X448 inbox encryption key for unsealing envelopes - public key */
  inboxEncryptionPublicKey: number[];
  /** Ed448 inbox signing key for signing delete requests - private key */
  inboxSigningPrivateKey: number[];
  /** Ed448 inbox signing key for signing delete requests - public key */
  inboxSigningPublicKey: number[];
  /** Device inbox address (derived from inbox encryption public key) */
  inboxAddress: string;
}

/**
 * Store X448 pre-key pair for E2E encryption
 * @param privateKey Array of bytes as JSON string
 * @param publicKey Array of bytes as JSON string
 */
export async function storePreKey(privateKey: string, publicKey: string): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(STORAGE_KEYS.QUORUM_PREKEY_PRIVATE, privateKey, SECURE_OPTIONS),
    SecureStore.setItemAsync(STORAGE_KEYS.QUORUM_PREKEY_PUBLIC, publicKey, SECURE_OPTIONS),
  ]);
}

/**
 * Retrieve X448 pre-key pair
 */
export async function getPreKey(): Promise<{ privateKey: number[]; publicKey: number[] } | null> {
  const [privateKey, publicKey] = await Promise.all([
    SecureStore.getItemAsync(STORAGE_KEYS.QUORUM_PREKEY_PRIVATE),
    SecureStore.getItemAsync(STORAGE_KEYS.QUORUM_PREKEY_PUBLIC),
  ]);

  if (!privateKey || !publicKey) return null;

  try {
    return {
      privateKey: JSON.parse(privateKey),
      publicKey: JSON.parse(publicKey),
    };
  } catch {
    return null;
  }
}

/**
 * Check if pre-key exists
 */
export async function hasPreKey(): Promise<boolean> {
  const preKey = await getPreKey();
  return preKey !== null;
}

/**
 * Delete pre-keys
 */
export async function deletePreKey(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(STORAGE_KEYS.QUORUM_PREKEY_PRIVATE),
    SecureStore.deleteItemAsync(STORAGE_KEYS.QUORUM_PREKEY_PUBLIC),
  ]);
}

// ============ X448 Identity Key Storage (for X3DH) ============

/**
 * Store X448 identity key pair for X3DH
 */
export async function storeIdentityX448(privateKey: string, publicKey: string): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(STORAGE_KEYS.QUORUM_IDENTITY_X448_PRIVATE, privateKey, SECURE_OPTIONS),
    SecureStore.setItemAsync(STORAGE_KEYS.QUORUM_IDENTITY_X448_PUBLIC, publicKey, SECURE_OPTIONS),
  ]);
}

/**
 * Retrieve X448 identity key pair
 */
export async function getIdentityX448(): Promise<{ privateKey: number[]; publicKey: number[] } | null> {
  const [privateKey, publicKey] = await Promise.all([
    SecureStore.getItemAsync(STORAGE_KEYS.QUORUM_IDENTITY_X448_PRIVATE),
    SecureStore.getItemAsync(STORAGE_KEYS.QUORUM_IDENTITY_X448_PUBLIC),
  ]);

  if (!privateKey || !publicKey) return null;

  try {
    return {
      privateKey: JSON.parse(privateKey),
      publicKey: JSON.parse(publicKey),
    };
  } catch {
    return null;
  }
}

// ============ X448 Inbox Encryption Key Storage ============

/**
 * Store X448 inbox encryption key pair (for unsealing envelopes)
 */
export async function storeInboxEncryptionKey(privateKey: string, publicKey: string): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(STORAGE_KEYS.QUORUM_INBOX_ENCRYPTION_PRIVATE, privateKey, SECURE_OPTIONS),
    SecureStore.setItemAsync(STORAGE_KEYS.QUORUM_INBOX_ENCRYPTION_PUBLIC, publicKey, SECURE_OPTIONS),
  ]);
}

/**
 * Retrieve X448 inbox encryption key pair
 */
export async function getInboxEncryptionKey(): Promise<{ privateKey: number[]; publicKey: number[] } | null> {
  const [privateKey, publicKey] = await Promise.all([
    SecureStore.getItemAsync(STORAGE_KEYS.QUORUM_INBOX_ENCRYPTION_PRIVATE),
    SecureStore.getItemAsync(STORAGE_KEYS.QUORUM_INBOX_ENCRYPTION_PUBLIC),
  ]);

  if (!privateKey || !publicKey) return null;

  try {
    return {
      privateKey: JSON.parse(privateKey),
      publicKey: JSON.parse(publicKey),
    };
  } catch {
    return null;
  }
}

// ============ Ed448 Inbox Signing Key Storage ============

/**
 * Store Ed448 inbox signing key pair (for signing delete requests)
 */
export async function storeInboxSigningKey(privateKey: string, publicKey: string): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(STORAGE_KEYS.QUORUM_INBOX_SIGNING_PRIVATE, privateKey, SECURE_OPTIONS),
    SecureStore.setItemAsync(STORAGE_KEYS.QUORUM_INBOX_SIGNING_PUBLIC, publicKey, SECURE_OPTIONS),
  ]);
}

/**
 * Retrieve Ed448 inbox signing key pair
 */
export async function getInboxSigningKey(): Promise<{ privateKey: number[]; publicKey: number[] } | null> {
  const [privateKey, publicKey] = await Promise.all([
    SecureStore.getItemAsync(STORAGE_KEYS.QUORUM_INBOX_SIGNING_PRIVATE),
    SecureStore.getItemAsync(STORAGE_KEYS.QUORUM_INBOX_SIGNING_PUBLIC),
  ]);

  if (!privateKey || !publicKey) return null;

  try {
    return {
      privateKey: JSON.parse(privateKey),
      publicKey: JSON.parse(publicKey),
    };
  } catch {
    return null;
  }
}

// ============ Inbox Address Storage ============

/**
 * Store inbox address
 */
export async function storeInboxAddress(address: string): Promise<void> {
  await SecureStore.setItemAsync(STORAGE_KEYS.QUORUM_INBOX_ADDRESS, address, SECURE_OPTIONS);
}

/**
 * Retrieve inbox address
 */
export async function getInboxAddress(): Promise<string | null> {
  return SecureStore.getItemAsync(STORAGE_KEYS.QUORUM_INBOX_ADDRESS);
}

/**
 * Get full device keyset for E2E encryption
 * Returns null if any required key is missing
 *
 * Note: This returns X448 keys for encryption and Ed448 inbox signing key.
 */
export async function getDeviceKeyset(): Promise<DeviceKeyset | null> {
  const [identityX448, preKey, inboxEncryptionKey, inboxSigningKey, inboxAddress] = await Promise.all([
    getIdentityX448(),
    getPreKey(),
    getInboxEncryptionKey(),
    getInboxSigningKey(),
    getInboxAddress(),
  ]);

  if (!identityX448 || !preKey || !inboxEncryptionKey || !inboxSigningKey || !inboxAddress) {
    return null;
  }

  return {
    identityPrivateKey: identityX448.privateKey,
    identityPublicKey: identityX448.publicKey,
    preKeyPrivateKey: preKey.privateKey,
    preKeyPublicKey: preKey.publicKey,
    inboxEncryptionPrivateKey: inboxEncryptionKey.privateKey,
    inboxEncryptionPublicKey: inboxEncryptionKey.publicKey,
    inboxSigningPrivateKey: inboxSigningKey.privateKey,
    inboxSigningPublicKey: inboxSigningKey.publicKey,
    inboxAddress,
  };
}

/**
 * Convert hex string to number array
 */
function hexToNumberArray(hex: string): number[] {
  const cleanHex = hex.replace('0x', '');
  const bytes: number[] = [];
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes.push(parseInt(cleanHex.substring(i, i + 2), 16));
  }
  return bytes;
}

// ============ Mnemonic Storage ============

/**
 * Store the mnemonic phrase securely (optional backup)
 */
export async function storeMnemonic(words: string[]): Promise<void> {
  await SecureStore.setItemAsync(
    STORAGE_KEYS.QUORUM_MNEMONIC,
    JSON.stringify(words),
    SECURE_OPTIONS
  );
}

/**
 * Retrieve the mnemonic phrase
 */
export async function getMnemonic(): Promise<string[] | null> {
  const stored = await SecureStore.getItemAsync(STORAGE_KEYS.QUORUM_MNEMONIC);
  return stored ? JSON.parse(stored) : null;
}

/**
 * Delete the mnemonic phrase
 */
export async function deleteMnemonic(): Promise<void> {
  await SecureStore.deleteItemAsync(STORAGE_KEYS.QUORUM_MNEMONIC);
}

// ============ Farcaster Keys ============

/**
 * Store Farcaster signer key
 */
export async function storeFarcasterSignerKey(signerKey: string): Promise<void> {
  await SecureStore.setItemAsync(
    STORAGE_KEYS.FARCASTER_SIGNER_KEY,
    signerKey,
    SECURE_OPTIONS
  );
}

/**
 * Retrieve Farcaster signer key
 */
export async function getFarcasterSignerKey(): Promise<string | null> {
  return SecureStore.getItemAsync(STORAGE_KEYS.FARCASTER_SIGNER_KEY);
}

/**
 * Delete Farcaster signer key
 */
export async function deleteFarcasterSignerKey(): Promise<void> {
  await SecureStore.deleteItemAsync(STORAGE_KEYS.FARCASTER_SIGNER_KEY);
}

/**
 * Store Farcaster custody private key (for SIWE signing)
 */
export async function storeFarcasterCustodyKey(custodyKey: string): Promise<void> {
  await SecureStore.setItemAsync(
    STORAGE_KEYS.FARCASTER_CUSTODY_KEY,
    custodyKey,
    SECURE_OPTIONS
  );
}

/**
 * Retrieve Farcaster custody private key
 */
export async function getFarcasterCustodyKey(): Promise<string | null> {
  return SecureStore.getItemAsync(STORAGE_KEYS.FARCASTER_CUSTODY_KEY);
}

/**
 * Delete Farcaster custody key
 */
export async function deleteFarcasterCustodyKey(): Promise<void> {
  await SecureStore.deleteItemAsync(STORAGE_KEYS.FARCASTER_CUSTODY_KEY);
}

/**
 * Store Farcaster FID
 */
export async function storeFarcasterFid(fid: number): Promise<void> {
  await SecureStore.setItemAsync(
    STORAGE_KEYS.FARCASTER_FID,
    fid.toString(),
    SECURE_OPTIONS
  );
}

/**
 * Retrieve Farcaster FID
 */
export async function getFarcasterFid(): Promise<number | null> {
  const stored = await SecureStore.getItemAsync(STORAGE_KEYS.FARCASTER_FID);
  return stored ? parseInt(stored, 10) : null;
}

/**
 * Store Farcaster auth token (for API calls)
 */
export async function storeFarcasterAuthToken(authToken: string): Promise<void> {
  await SecureStore.setItemAsync(
    STORAGE_KEYS.FARCASTER_AUTH_TOKEN,
    authToken,
    SECURE_OPTIONS
  );
}

/**
 * Retrieve Farcaster auth token
 */
export async function getFarcasterAuthToken(): Promise<string | null> {
  return SecureStore.getItemAsync(STORAGE_KEYS.FARCASTER_AUTH_TOKEN);
}

/**
 * Delete Farcaster auth token
 */
export async function deleteFarcasterAuthToken(): Promise<void> {
  await SecureStore.deleteItemAsync(STORAGE_KEYS.FARCASTER_AUTH_TOKEN);
}

// ============ Onboarding State ============

export interface OnboardingStateData {
  currentStep: string;
  completedSteps: string[];
  quorumAddress?: string;
  quorumPublicKey?: string;
  farcasterEnabled?: boolean;
  farcasterUsername?: string;
  profile?: {
    username?: string;
    displayName?: string;
    bio?: string;
    profileImageUri?: string;
  };
  privacyLevel?: string;
}

/**
 * Save onboarding progress (for resume if app closes)
 */
export async function saveOnboardingState(state: OnboardingStateData): Promise<void> {
  await SecureStore.setItemAsync(
    STORAGE_KEYS.ONBOARDING_STATE,
    JSON.stringify(state),
    SECURE_OPTIONS
  );
}

/**
 * Load onboarding progress
 */
export async function loadOnboardingState(): Promise<OnboardingStateData | null> {
  const stored = await SecureStore.getItemAsync(STORAGE_KEYS.ONBOARDING_STATE);
  return stored ? JSON.parse(stored) : null;
}

/**
 * Clear onboarding state (after completion or reset)
 */
export async function clearOnboardingState(): Promise<void> {
  await SecureStore.deleteItemAsync(STORAGE_KEYS.ONBOARDING_STATE);
}

// ============ Device Keys Reset ============

/**
 * Clear all device-specific encryption keys
 * Call this when importing an existing user to ensure fresh device keys are generated
 * This does NOT clear the user's main Ed448 identity key or mnemonic
 */
export async function clearDeviceKeys(): Promise<void> {
  await Promise.all([
    // X448 identity key for X3DH
    SecureStore.deleteItemAsync(STORAGE_KEYS.QUORUM_IDENTITY_X448_PRIVATE),
    SecureStore.deleteItemAsync(STORAGE_KEYS.QUORUM_IDENTITY_X448_PUBLIC),
    // X448 pre-key for X3DH
    deletePreKey(),
    // X448 inbox encryption key
    SecureStore.deleteItemAsync(STORAGE_KEYS.QUORUM_INBOX_ENCRYPTION_PRIVATE),
    SecureStore.deleteItemAsync(STORAGE_KEYS.QUORUM_INBOX_ENCRYPTION_PUBLIC),
    // Ed448 inbox signing key
    SecureStore.deleteItemAsync(STORAGE_KEYS.QUORUM_INBOX_SIGNING_PRIVATE),
    SecureStore.deleteItemAsync(STORAGE_KEYS.QUORUM_INBOX_SIGNING_PUBLIC),
    // Inbox address
    SecureStore.deleteItemAsync(STORAGE_KEYS.QUORUM_INBOX_ADDRESS),
  ]);
}

// ============ Full Reset ============

/**
 * Clear all secure storage (for account reset/logout)
 */
export async function clearAllSecureStorage(): Promise<void> {
  await Promise.all([
    deletePrivateKey(),
    SecureStore.deleteItemAsync(STORAGE_KEYS.QUORUM_PUBLIC_KEY),
    clearDeviceKeys(),
    deleteMnemonic(),
    deleteFarcasterSignerKey(),
    deleteFarcasterCustodyKey(),
    SecureStore.deleteItemAsync(STORAGE_KEYS.FARCASTER_FID),
    deleteFarcasterAuthToken(),
    clearOnboardingState(),
  ]);
}
