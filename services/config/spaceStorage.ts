/**
 * SpaceStorage - Storage for spaces and space keys
 *
 * Handles persistent storage for:
 * - Space metadata (Space objects)
 * - Space keys (config, hub, inbox keys)
 * - Space encryption states
 *
 * Uses MMKV for fast key-value storage
 */

import { logger } from '@quilibrium/quorum-shared';
import { createMMKV, type MMKV } from 'react-native-mmkv';
import { type Space } from '@quilibrium/quorum-shared';

// Storage instance for spaces
const spaceStorage: MMKV = createMMKV({ id: 'quorum-spaces' });

// Storage keys
const SPACE_PREFIX = 'space:';
const SPACE_KEY_PREFIX = 'space_key:';
const SPACE_IDS_KEY = 'space_ids';

// ============ Space Key Types ============

/**
 * Space key - encryption key for a space
 * Key types:
 * - config: Space config encryption key (for decrypting manifest)
 * - hub: Hub signing key (for hub messages)
 * - inbox: Per-space inbox key (for receiving space messages)
 */
export interface SpaceKey {
  spaceId: string;
  keyId: string;
  address?: string;
  publicKey: string;
  privateKey: string;
}

// ============ Space Storage ============

/**
 * Get all space IDs
 */
export function getSpaceIds(): string[] {
  const data = spaceStorage.getString(SPACE_IDS_KEY);
  if (!data) return [];
  try {
    return JSON.parse(data) as string[];
  } catch {
    return [];
  }
}

/**
 * Save space IDs list
 */
function saveSpaceIds(ids: string[]): void {
  spaceStorage.set(SPACE_IDS_KEY, JSON.stringify(ids));
}

/**
 * Get a space by ID
 */
export function getSpace(spaceId: string): Space | null {
  const key = `${SPACE_PREFIX}${spaceId}`;
  const data = spaceStorage.getString(key);
  if (!data) return null;
  try {
    return JSON.parse(data) as Space;
  } catch {
    return null;
  }
}

/**
 * Get all spaces
 */
export function getAllSpaces(): Space[] {
  const ids = getSpaceIds();
  const spaces: Space[] = [];
  for (const id of ids) {
    const space = getSpace(id);
    if (space) {
      spaces.push(space);
    }
  }
  return spaces;
}

/**
 * Save a space
 */
export function saveSpace(space: Space): void {
  const key = `${SPACE_PREFIX}${space.spaceId}`;
  spaceStorage.set(key, JSON.stringify(space));

  // Update space IDs list
  const ids = getSpaceIds();
  if (!ids.includes(space.spaceId)) {
    ids.push(space.spaceId);
    saveSpaceIds(ids);
  }
}

/**
 * Delete a space
 */
export function deleteSpace(spaceId: string): void {
  const key = `${SPACE_PREFIX}${spaceId}`;
  spaceStorage.remove(key);

  // Remove from space IDs list
  const ids = getSpaceIds();
  const index = ids.indexOf(spaceId);
  if (index !== -1) {
    ids.splice(index, 1);
    saveSpaceIds(ids);
  }

  // Delete all keys for this space
  deleteSpaceKeys(spaceId);
}

/**
 * Check if space exists
 */
export function hasSpace(spaceId: string): boolean {
  const key = `${SPACE_PREFIX}${spaceId}`;
  return spaceStorage.contains(key);
}

// ============ Space Key Storage ============

/**
 * Generate composite key for space key storage
 */
function getSpaceKeyStorageKey(spaceId: string, keyId: string): string {
  return `${SPACE_KEY_PREFIX}${spaceId}:${keyId}`;
}

/**
 * Get a space key
 */
export function getSpaceKey(spaceId: string, keyId: string): SpaceKey | null {
  const key = getSpaceKeyStorageKey(spaceId, keyId);
  const data = spaceStorage.getString(key);
  if (!data) {
    logger.log('[SpaceStorage] Key not found:', key);
    return null;
  }
  try {
    return JSON.parse(data) as SpaceKey;
  } catch (e) {
    console.error('[SpaceStorage] Failed to parse key:', key, e);
    return null;
  }
}

/**
 * Get all keys for a space
 */
export function getSpaceKeys(spaceId: string): SpaceKey[] {
  const keys: SpaceKey[] = [];
  const allKeys = spaceStorage.getAllKeys();

  const prefix = `${SPACE_KEY_PREFIX}${spaceId}:`;
  for (const key of allKeys) {
    if (key.startsWith(prefix)) {
      const data = spaceStorage.getString(key);
      if (data) {
        try {
          keys.push(JSON.parse(data) as SpaceKey);
        } catch {
          // Skip malformed entries
        }
      }
    }
  }

  return keys;
}

/**
 * Save a space key
 */
export function saveSpaceKey(spaceKey: SpaceKey): void {
  const key = getSpaceKeyStorageKey(spaceKey.spaceId, spaceKey.keyId);
  spaceStorage.set(key, JSON.stringify(spaceKey));
}

/**
 * Delete a space key
 */
export function deleteSpaceKey(spaceId: string, keyId: string): void {
  const key = getSpaceKeyStorageKey(spaceId, keyId);
  spaceStorage.remove(key);
}

/**
 * Delete all keys for a space
 */
export function deleteSpaceKeys(spaceId: string): void {
  const allKeys = spaceStorage.getAllKeys();
  const prefix = `${SPACE_KEY_PREFIX}${spaceId}:`;

  for (const key of allKeys) {
    if (key.startsWith(prefix)) {
      spaceStorage.remove(key);
    }
  }
}

// ============ Utility Functions ============

/**
 * Clear all space storage (for sign out)
 */
export function clearSpaceStorage(): void {
  spaceStorage.clearAll();
}

/**
 * Get space by hub address
 */
export function getSpaceByHubAddress(hubAddress: string): Space | null {
  const spaces = getAllSpaces();
  for (const space of spaces) {
    const hubKey = getSpaceKey(space.spaceId, 'hub');
    if (hubKey && hubKey.address === hubAddress) {
      return space;
    }
  }
  return null;
}

/**
 * Get space inbox address
 * Returns the inbox address used for receiving space messages
 */
export function getSpaceInboxAddress(spaceId: string): string | null {
  const inboxKey = getSpaceKey(spaceId, 'inbox');
  return inboxKey?.address ?? null;
}

/**
 * Get all space inbox addresses
 * Used for subscribing to space messages via WebSocket
 */
export function getAllSpaceInboxAddresses(): string[] {
  const addresses: string[] = [];
  const ids = getSpaceIds();

  for (const spaceId of ids) {
    const address = getSpaceInboxAddress(spaceId);
    if (address) {
      addresses.push(address);
    }
  }

  return addresses;
}
