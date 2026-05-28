/**
 * notificationPrefs — persisted notification opt-out state.
 *
 * Three levels of granularity:
 *   1. Global on/off (user settings toggle).
 *   2. Per-space on/off (any member, not just admins).
 *   3. Per-channel on/off within a space.
 *
 * Resolution order at presentation time: global → space → channel.
 * If the global is off, nothing else matters. If the space is off,
 * channel-level "on" doesn't re-enable. (Standard mute-mention rules.)
 *
 * Storage: small dedicated MMKV instance to avoid coupling with the
 * encryption store. Keys are namespaced so future per-DM opt-outs can
 * live here too without collision.
 *
 * No App Group mirror needed — the iOS NSE doesn't read these; it
 * gates on its own content-type suppression rules. Local notification
 * presentation (the surface that this gates) all happens in the JS
 * runtime where this module is reachable.
 */

import { type MMKV } from 'react-native-mmkv';
import { createMirroredMMKV } from '@/services/storage/mirroredMMKV';

const STORE_ID = 'quorum-notification-prefs';
const K_GLOBAL = 'global:enabled';
const K_SPACE_PREFIX = 'space:';
const K_CHANNEL_PREFIX = 'channel:';

// Mirrored to the App Group container on iOS so the NSE can read
// global / per-space / per-channel mute state and apply it to
// lock-screen notification suppression. Read happens in
// HubLogClassifier.swift via the same MMKV id at the App Group path.
let store: MMKV | null = null;
function getStore(): MMKV {
  if (!store) store = createMirroredMMKV({ id: STORE_ID });
  return store;
}

function spaceKey(spaceId: string): string {
  return `${K_SPACE_PREFIX}${spaceId}`;
}

function channelKey(spaceId: string, channelId: string): string {
  return `${K_CHANNEL_PREFIX}${spaceId}:${channelId}`;
}

// Global

/** True (default) when the user has push notifications enabled overall. */
export function getGlobalNotificationsEnabled(): boolean {
  const v = getStore().getBoolean(K_GLOBAL);
  return v === undefined ? true : v;
}

export function setGlobalNotificationsEnabled(enabled: boolean): void {
  getStore().set(K_GLOBAL, enabled);
}

// Per-space

/** True (default) when this space is allowed to notify the user. */
export function getSpaceNotificationsEnabled(spaceId: string): boolean {
  const v = getStore().getBoolean(spaceKey(spaceId));
  return v === undefined ? true : v;
}

export function setSpaceNotificationsEnabled(spaceId: string, enabled: boolean): void {
  getStore().set(spaceKey(spaceId), enabled);
}

// Per-channel

/** True (default) when this channel is allowed to notify the user. */
export function getChannelNotificationsEnabled(spaceId: string, channelId: string): boolean {
  const v = getStore().getBoolean(channelKey(spaceId, channelId));
  return v === undefined ? true : v;
}

export function setChannelNotificationsEnabled(
  spaceId: string,
  channelId: string,
  enabled: boolean,
): void {
  getStore().set(channelKey(spaceId, channelId), enabled);
}

// Resolution

/**
 * Top-level "should this notification be shown?" gate. Global wins
 * outright; otherwise space + channel both need to be enabled. Pass
 * `spaceId`/`channelId` when the context is known (e.g. when a
 * hub-log push is being processed). Omit for context-less paths like
 * the generic "you have new messages" wake notification — those still
 * respect the global toggle but can't filter by space.
 */
export function shouldNotifyForContext(params: {
  spaceId?: string;
  channelId?: string;
}): boolean {
  if (!getGlobalNotificationsEnabled()) return false;
  if (params.spaceId) {
    if (!getSpaceNotificationsEnabled(params.spaceId)) return false;
    if (params.channelId && !getChannelNotificationsEnabled(params.spaceId, params.channelId)) {
      return false;
    }
  }
  return true;
}
