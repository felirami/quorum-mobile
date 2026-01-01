/**
 * ConfigService - Handles user configuration sync with server
 *
 * Manages encrypted config sync between mobile and server:
 * - AES-GCM encryption with key derived from SHA-512(user_private_key)[0:32]
 * - Ed448 signature for verification
 * - Timestamp-based conflict resolution
 * - Bookmark merging with tombstone tracking
 * - NavItems validation
 * - Full UserConfig compatibility with desktop
 */

import { logger } from '@quilibrium/quorum-shared';
import { sha512 } from '@noble/hashes/sha2';
import { gcm } from '@noble/ciphers/aes';
import { randomBytes } from '@noble/ciphers/webcrypto';
import { createMMKV, type MMKV } from 'react-native-mmkv';
import { getQuorumClient } from '../api/quorumClient';
import { getPrivateKey, getPublicKey } from '../onboarding/secureStorage';
import { NativeCryptoProvider } from '../crypto/native-provider';
import {
  type UserConfig,
  type Bookmark,
  type NavItem,
  type EncryptionState,
  BOOKMARKS_CONFIG,
  int64ToBytes,
  hexToBytes,
  bytesToHex,
} from '@quilibrium/quorum-shared';
import { getAllSpaces, getSpaceKeys, clearSpaceStorage } from './spaceStorage';
import { encryptionStateStorage } from '../crypto/encryption-state-storage';
import type { SpaceKeyInfo } from './spaceSyncService';

// Storage for user config
const configStorage: MMKV = createMMKV({ id: 'quorum-config' });

// Storage for bookmarks (separate for efficiency)
const bookmarkStorage: MMKV = createMMKV({ id: 'quorum-bookmarks' });

const CONFIG_KEY_PREFIX = 'user_config:';
const BOOKMARKS_KEY_PREFIX = 'bookmarks:';
const DELETED_BOOKMARKS_KEY = 'deleted_bookmark_ids:';

// ============ NavItems Validation ============

const MAX_FOLDERS = 20;
const MAX_SPACES_PER_FOLDER = 100;

/**
 * Validate and sanitize NavItems array
 * Enforces limits: max 20 folders, max 100 spaces per folder
 */
function validateItems(items: NavItem[]): NavItem[] {
  let folderCount = 0;
  return items.filter((item) => {
    if (item.type === 'folder') {
      if (folderCount >= MAX_FOLDERS) {
        logger.warn(`[ConfigService] Folder limit exceeded, skipping folder: ${item.name}`);
        return false;
      }
      folderCount++;
      // Limit spaces per folder
      if (item.spaceIds.length > MAX_SPACES_PER_FOLDER) {
        item.spaceIds = item.spaceIds.slice(0, MAX_SPACES_PER_FOLDER);
        logger.warn(`[ConfigService] Truncated folder ${item.name} to ${MAX_SPACES_PER_FOLDER} spaces`);
      }
    }
    return true;
  });
}

// ============ Bookmark Storage ============

/**
 * Get all bookmarks for a user from local storage
 */
export function getLocalBookmarks(address: string): Bookmark[] {
  const key = `${BOOKMARKS_KEY_PREFIX}${address}`;
  const data = bookmarkStorage.getString(key);
  if (!data) return [];
  try {
    return JSON.parse(data) as Bookmark[];
  } catch {
    return [];
  }
}

/**
 * Save bookmarks to local storage
 */
function saveLocalBookmarks(address: string, bookmarks: Bookmark[]): void {
  const key = `${BOOKMARKS_KEY_PREFIX}${address}`;
  // Enforce max bookmarks limit
  const limitedBookmarks = bookmarks.slice(0, BOOKMARKS_CONFIG.MAX_BOOKMARKS);
  bookmarkStorage.set(key, JSON.stringify(limitedBookmarks));
}

/**
 * Add a bookmark
 */
export function addBookmark(address: string, bookmark: Bookmark): void {
  const bookmarks = getLocalBookmarks(address);
  // Check for duplicate messageId
  const existingIndex = bookmarks.findIndex((b) => b.messageId === bookmark.messageId);
  if (existingIndex >= 0) {
    // Replace if newer
    if (bookmark.createdAt > bookmarks[existingIndex].createdAt) {
      bookmarks[existingIndex] = bookmark;
    }
  } else {
    bookmarks.unshift(bookmark); // Add to beginning (newest first)
  }
  saveLocalBookmarks(address, bookmarks);
}

/**
 * Remove a bookmark
 */
export function removeBookmark(address: string, bookmarkId: string): void {
  const bookmarks = getLocalBookmarks(address);
  const filtered = bookmarks.filter((b) => b.bookmarkId !== bookmarkId);
  saveLocalBookmarks(address, filtered);

  // Add to deleted tombstones
  const deletedIds = getDeletedBookmarkIds(address);
  if (!deletedIds.includes(bookmarkId)) {
    deletedIds.push(bookmarkId);
    saveDeletedBookmarkIds(address, deletedIds);
  }
}

/**
 * Get deleted bookmark IDs (tombstones)
 */
function getDeletedBookmarkIds(address: string): string[] {
  const key = `${DELETED_BOOKMARKS_KEY}${address}`;
  const data = bookmarkStorage.getString(key);
  if (!data) return [];
  try {
    return JSON.parse(data) as string[];
  } catch {
    return [];
  }
}

/**
 * Save deleted bookmark IDs
 */
function saveDeletedBookmarkIds(address: string, ids: string[]): void {
  const key = `${DELETED_BOOKMARKS_KEY}${address}`;
  bookmarkStorage.set(key, JSON.stringify(ids));
}

/**
 * Clear deleted bookmark IDs (after successful sync)
 */
function clearDeletedBookmarkIds(address: string): void {
  const key = `${DELETED_BOOKMARKS_KEY}${address}`;
  bookmarkStorage.remove(key);
}

/**
 * Merge local and remote bookmarks with conflict resolution
 * Strategy: Last-write-wins with tombstone tracking for deletions
 * Deduplication: Prevents multiple bookmarks pointing to same message
 */
function mergeBookmarks(
  local: Bookmark[],
  remote: Bookmark[],
  deletedIds: string[]
): Bookmark[] {
  const bookmarkMap = new Map<string, Bookmark>();
  const messageIdToBookmarkId = new Map<string, string>();

  const addBookmark = (bookmark: Bookmark) => {
    if (deletedIds.includes(bookmark.bookmarkId)) return;

    // Check for existing bookmark pointing to same message
    const existingBookmarkId = messageIdToBookmarkId.get(bookmark.messageId);
    const existing = existingBookmarkId ? bookmarkMap.get(existingBookmarkId) : undefined;

    if (!existing || bookmark.createdAt > existing.createdAt) {
      // Remove old duplicate if exists
      if (existingBookmarkId) {
        bookmarkMap.delete(existingBookmarkId);
      }
      bookmarkMap.set(bookmark.bookmarkId, bookmark);
      messageIdToBookmarkId.set(bookmark.messageId, bookmark.bookmarkId);
    }
  };

  // Add local and remote bookmarks with deduplication
  local.forEach(addBookmark);
  remote.forEach(addBookmark);

  // Convert back to array and sort by creation time (newest first)
  return Array.from(bookmarkMap.values()).sort((a, b) => b.createdAt - a.createdAt);
}

// ============ Default Config ============

/**
 * Get default user config for a new user
 */
function getDefaultUserConfig(address: string): UserConfig {
  return {
    address,
    spaceIds: [],
    items: [],
    allowSync: false,
    nonRepudiable: true,
    timestamp: 0,
    notificationSettings: {},
    bookmarks: [],
    deletedBookmarkIds: [],
  };
}

/**
 * Get local user config from storage
 */
export function getLocalUserConfig(address: string): UserConfig | null {
  const key = `${CONFIG_KEY_PREFIX}${address}`;
  const data = configStorage.getString(key);
  if (!data) return null;
  try {
    return JSON.parse(data) as UserConfig;
  } catch {
    return null;
  }
}

/**
 * Save user config to local storage
 */
export function saveLocalUserConfig(config: UserConfig): void {
  const key = `${CONFIG_KEY_PREFIX}${config.address}`;
  configStorage.set(key, JSON.stringify(config));
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
 * Derive AES-256 key from user private key using SHA-512
 * Key = SHA-512(private_key)[0:32]
 * Returns raw key bytes for use with @noble/ciphers
 */
function deriveConfigKey(privateKeyHex: string): Uint8Array {
  const privateKeyBytes = hexToBytes(privateKeyHex);
  const hash = sha512(new Uint8Array(privateKeyBytes));
  return hash.slice(0, 32);
}

/**
 * Encrypt config using AES-GCM via @noble/ciphers
 * Returns hex string of (ciphertext + IV)
 */
function encryptConfig(config: UserConfig, key: Uint8Array): string {
  const iv = randomBytes(12);
  const configJson = JSON.stringify(config);
  const encoded = new TextEncoder().encode(configJson);

  const cipher = gcm(key, iv);
  const ciphertext = cipher.encrypt(encoded);

  // Concatenate ciphertext + IV as hex
  const ciphertextHex = bytesToHex(ciphertext);
  const ivHex = bytesToHex(iv);
  return ciphertextHex + ivHex;
}

/**
 * Decrypt config using AES-GCM via @noble/ciphers
 * Input is hex string of (ciphertext + IV) where IV is last 24 chars (12 bytes)
 */
function decryptConfig(encryptedHex: string, key: Uint8Array): UserConfig {
  // Extract IV from last 24 hex chars (12 bytes)
  const ivHex = encryptedHex.slice(-24);
  const ciphertextHex = encryptedHex.slice(0, -24);

  const iv = new Uint8Array(hexToBytes(ivHex));
  const ciphertext = new Uint8Array(hexToBytes(ciphertextHex));

  const cipher = gcm(key, iv);
  const decrypted = cipher.decrypt(ciphertext);

  const decoded = new TextDecoder().decode(decrypted);
  return JSON.parse(decoded) as UserConfig;
}

/**
 * Sign config data with Ed448
 * Signs: (encrypted_config_bytes + timestamp_bytes)
 */
async function signConfigData(
  encryptedConfig: string,
  timestamp: number,
  privateKeyHex: string
): Promise<string> {
  const cryptoProvider = new NativeCryptoProvider();

  // Build data to sign: UTF-8 bytes of encrypted string + timestamp bytes
  const configBytes = new TextEncoder().encode(encryptedConfig);
  const timestampBytes = int64ToBytes(timestamp);

  const dataToSign = new Uint8Array([...configBytes, ...timestampBytes]);

  // Convert to base64 for native module
  const privateKeyBase64 = btoa(
    String.fromCharCode(...hexToBytes(privateKeyHex))
  );
  const messageBase64 = numberArrayToBase64(Array.from(dataToSign));

  const signatureBase64 = await cryptoProvider.signEd448(privateKeyBase64, messageBase64);
  return base64ToHex(signatureBase64);
}

/**
 * Verify config signature with Ed448
 */
async function verifyConfigSignature(
  encryptedConfig: string,
  timestamp: number,
  signature: string,
  publicKeyHex: string
): Promise<boolean> {
  const cryptoProvider = new NativeCryptoProvider();

  // Build data that was signed
  const configBytes = new TextEncoder().encode(encryptedConfig);
  const timestampBytes = int64ToBytes(timestamp);
  const dataToVerify = new Uint8Array([...configBytes, ...timestampBytes]);

  // Convert to base64 for native module
  const publicKeyBase64 = btoa(
    String.fromCharCode(...hexToBytes(publicKeyHex))
  );
  const messageBase64 = numberArrayToBase64(Array.from(dataToVerify));
  const signatureBase64 = btoa(
    String.fromCharCode(...hexToBytes(signature))
  );

  try {
    // Use native verify - QuorumCrypto.verifyEd448 returns 'true' or 'false' string
    const result = await (await import('../../modules/quorum-crypto/src')).verifyEd448(
      publicKeyBase64,
      messageBase64,
      signatureBase64
    );
    return result;
  } catch (error) {
    logger.warn('[ConfigService] Signature verification failed:', error);
    return false;
  }
}

/**
 * Fetch and decrypt user config from server
 * Returns remote config if newer than local, otherwise local config
 */
export async function getConfig(address: string): Promise<UserConfig> {
  const client = getQuorumClient();
  const privateKey = await getPrivateKey();
  const publicKey = await getPublicKey();

  if (!privateKey || !publicKey) {
    logger.warn('[ConfigService] No user keys found');
    return getLocalUserConfig(address) ?? getDefaultUserConfig(address);
  }

  // Try to fetch remote config
  let remoteConfig: { user_config: string; timestamp: number; signature: string } | undefined;
  try {
    remoteConfig = (await client.getUserSettings(address)) ?? undefined;
  } catch (error) {
    logger.log('[ConfigService] No remote config found or error fetching:', error);
  }

  const localConfig = getLocalUserConfig(address);

  // If no remote config, return local or default
  if (!remoteConfig || !remoteConfig.user_config) {
    if (!localConfig) {
      return getDefaultUserConfig(address);
    }
    return localConfig;
  }

  // Check timestamp - if local is newer, use local
  if (remoteConfig.timestamp < (localConfig?.timestamp ?? 0)) {
    logger.warn('[ConfigService] Remote config is older than local');
    return localConfig!;
  }

  // If timestamps match, use local (no update needed)
  if (remoteConfig.timestamp === localConfig?.timestamp) {
    return localConfig;
  }

  // Verify signature
  const signatureValid = await verifyConfigSignature(
    remoteConfig.user_config,
    remoteConfig.timestamp,
    remoteConfig.signature,
    publicKey
  );

  if (!signatureValid) {
    logger.warn('[ConfigService] Remote config has invalid signature!');
    return localConfig ?? getDefaultUserConfig(address);
  }

  // Decrypt config
  try {
    const key = deriveConfigKey(privateKey);
    const decryptedConfig = decryptConfig(remoteConfig.user_config, key);

    // Validate NavItems
    if (decryptedConfig.items) {
      decryptedConfig.items = validateItems(decryptedConfig.items);
    }

    // Merge bookmarks from remote with local
    if (decryptedConfig.bookmarks && decryptedConfig.bookmarks.length > 0) {
      const localBookmarks = getLocalBookmarks(address);
      const mergedBookmarks = mergeBookmarks(
        localBookmarks,
        decryptedConfig.bookmarks,
        decryptedConfig.deletedBookmarkIds ?? []
      );
      saveLocalBookmarks(address, mergedBookmarks);
      logger.log(
        `[ConfigService] Bookmark sync: ${mergedBookmarks.length} total after merge`
      );
    }

    // Sync spaces from spaceKeys
    if (decryptedConfig.spaceKeys && decryptedConfig.spaceKeys.length > 0) {
      logger.log(
        `[ConfigService] Config contains ${decryptedConfig.spaceKeys.length} space keys, syncing...`
      );
      try {
        const { syncSpacesFromConfig } = await import('./spaceSyncService');
        // Pass user info so the user gets saved as a member of each synced space
        const userInfo = {
          address,
          displayName: decryptedConfig.name,
          profileImage: decryptedConfig.profile_image,
        };
        const syncedCount = await syncSpacesFromConfig(
          decryptedConfig.spaceKeys,
          userInfo,
          // WebSocket listen callback - will be handled by caller if needed
          undefined
        );
        logger.log(
          `[ConfigService] Synced ${syncedCount}/${decryptedConfig.spaceKeys.length} spaces`
        );
      } catch (spaceSyncError) {
        console.error('[ConfigService] Failed to sync spaces:', spaceSyncError);
        // Continue with rest of config - space sync failure shouldn't block
      }
    }

    // Save to local storage
    // IMPORTANT: Preserve name and profile_image fields from remote config
    const configWithTimestamp: UserConfig = {
      ...decryptedConfig,
      timestamp: remoteConfig.timestamp,
      // Include merged bookmarks in the stored config
      bookmarks: getLocalBookmarks(address),
      // Ensure profile fields are preserved
      name: decryptedConfig.name,
      profile_image: decryptedConfig.profile_image,
    };
    saveLocalUserConfig(configWithTimestamp);

    logger.log('[ConfigService] Successfully synced remote config', {
      spaceIds: configWithTimestamp.spaceIds?.length ?? 0,
      items: configWithTimestamp.items?.length ?? 0,
      bookmarks: configWithTimestamp.bookmarks?.length ?? 0,
      hasSpaceKeys: !!configWithTimestamp.spaceKeys?.length,
      name: configWithTimestamp.name,
      hasProfileImage: !!configWithTimestamp.profile_image,
    });
    return configWithTimestamp;
  } catch (error) {
    console.error('[ConfigService] Failed to decrypt remote config:', error);
    return localConfig ?? getDefaultUserConfig(address);
  }
}

/**
 * Collect space keys and encryption states for config sync
 * Matches desktop behavior: only includes spaces with valid encryption state
 */
function collectSpaceKeysForSync(): SpaceKeyInfo[] {
  const spaces = getAllSpaces();
  const spaceKeyInfos: SpaceKeyInfo[] = [];

  for (const space of spaces) {
    // Get all keys for this space
    const keys = getSpaceKeys(space.spaceId);
    if (keys.length === 0) continue;

    // Get encryption state for this space
    // Space conversations use conversationId = spaceId/spaceId
    const conversationId = `${space.spaceId}/${space.spaceId}`;
    const encryptionStates = encryptionStateStorage.getEncryptionStates(conversationId);

    if (encryptionStates.length === 0) {
      logger.warn(`[ConfigService] Space ${space.spaceId} has no encryption state, skipping from sync`);
      continue;
    }

    // Use the first (and typically only) encryption state
    const state = encryptionStates[0];

    spaceKeyInfos.push({
      spaceId: space.spaceId,
      encryptionState: {
        conversationId: state.conversationId,
        inboxId: state.inboxId,
        state: state.state,
        timestamp: state.timestamp,
      },
      keys: keys.map((k) => ({
        keyId: k.keyId,
        address: k.address,
        publicKey: k.publicKey,
        privateKey: k.privateKey,
        spaceId: k.spaceId,
      })),
    });
  }

  return spaceKeyInfos;
}

/**
 * Save config and optionally sync to server
 * Only syncs if config.allowSync is true
 */
export async function saveConfig(config: UserConfig): Promise<void> {
  const privateKey = await getPrivateKey();
  const publicKey = await getPublicKey();

  const ts = Date.now();
  config.timestamp = ts;

  // Include current bookmarks and deleted bookmark IDs in config for sync
  const address = config.address;
  config.bookmarks = getLocalBookmarks(address);
  config.deletedBookmarkIds = getDeletedBookmarkIds(address);

  // Sync to server if allowed
  if (config.allowSync && privateKey && publicKey) {
    try {
      // Collect space keys before encryption (matches desktop behavior)
      const spaceKeys = collectSpaceKeysForSync();
      config.spaceKeys = spaceKeys;

      // Log warning if spaces are being filtered out
      const allSpaces = getAllSpaces();
      if (allSpaces.length > spaceKeys.length) {
        logger.warn(
          `[ConfigService] ${allSpaces.length - spaceKeys.length} space(s) filtered from sync (missing encryption state)`
        );
      }

      // Ensure spaceIds and items only include spaces that have encryption keys
      // This prevents server validation errors
      const validSpaceIds = new Set(spaceKeys.map((sk) => sk.spaceId));
      config.spaceIds = (config.spaceIds ?? []).filter((id) => validSpaceIds.has(id));

      if (config.items) {
        config.items = config.items.filter((item) => {
          if (item.type === 'space') {
            return validSpaceIds.has(item.id);
          } else {
            // For folders, filter out spaces without encryption keys
            item.spaceIds = item.spaceIds.filter((id) => validSpaceIds.has(id));
            // Remove empty folders
            return item.spaceIds.length > 0;
          }
        });
      }

      const key = deriveConfigKey(privateKey);
      const encryptedConfig = encryptConfig(config, key);
      const signature = await signConfigData(encryptedConfig, ts, privateKey);

      const client = getQuorumClient();
      await client.postUserSettings(config.address, {
        user_address: config.address,
        user_public_key: publicKey,
        user_config: encryptedConfig,
        timestamp: ts,
        signature,
      });

      logger.log('[ConfigService] Config synced to server', {
        spaceIds: config.spaceIds?.length ?? 0,
        items: config.items?.length ?? 0,
        bookmarks: config.bookmarks?.length ?? 0,
        spaceKeys: config.spaceKeys?.length ?? 0,
      });

      // Clear deleted bookmark tombstones after successful sync
      clearDeletedBookmarkIds(address);
      config.deletedBookmarkIds = [];
    } catch (error) {
      console.error('[ConfigService] Failed to sync config to server:', error);
      // Continue to save locally even if sync fails
    }
  }

  // Always save locally
  saveLocalUserConfig(config);
}

/**
 * Clear all config data (for sign out)
 */
export function clearConfigStorage(): void {
  configStorage.clearAll();
  bookmarkStorage.clearAll();
  clearSpaceStorage();
}

/**
 * Update specific fields in config and save
 */
export async function updateConfig(
  address: string,
  updates: Partial<UserConfig>
): Promise<UserConfig> {
  const currentConfig = getLocalUserConfig(address) ?? getDefaultUserConfig(address);
  const updatedConfig = { ...currentConfig, ...updates };
  await saveConfig(updatedConfig);
  return updatedConfig;
}

/**
 * Get user's display name from config
 */
export function getDisplayName(address: string): string | undefined {
  const config = getLocalUserConfig(address);
  return config?.name;
}

/**
 * Get user's profile image from config
 */
export function getProfileImage(address: string): string | undefined {
  const config = getLocalUserConfig(address);
  return config?.profile_image;
}
