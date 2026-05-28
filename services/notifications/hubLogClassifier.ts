/**
 * hubLogClassifier — fetch + decrypt a single hub-log entry to find out
 * its `content.type`. Used by the Android background push task (and the
 * iOS NSE via a Swift port) to suppress notifications for control-type
 * messages that shouldn't surface to the user (update-profile,
 * edit-message, remove-message).
 *
 * Flow:
 *   1. GET /hub/:hub_address/log?after=seq-1&limit=1 returns the sealed
 *      HubSealedMessage JSON for the entry.
 *   2. Look up the (spaceId, hub/config keys, current TR state) for the
 *      hub locally from MMKV.
 *   3. Pass to `batchProcessMessages` as a one-entry BatchSpaceGroup —
 *      reuses the exact same native decrypt path the WebSocket pipeline
 *      uses, so state mutations stay consistent.
 *   4. Parse the decrypted JSON, return `content.type`.
 *
 * Returns `null` on any failure (network, state missing, decrypt fail,
 * malformed JSON). The caller should treat `null` as "don't know,
 * default to surfacing the notification."
 */

import { getQuorumClient } from '@/services/api/quorumClient';
import { getSpaceByHubAddress, getSpaceKey } from '@/services/config/spaceStorage';
import { encryptionStateStorage } from '@/services/crypto/encryption-state-storage';
import { NativeCryptoProvider, type BatchSpaceGroup } from '@/services/crypto/native-provider';
import { hexToBytes } from '@quilibrium/quorum-shared';

/** Content types whose notifications should be suppressed. */
export const SUPPRESSED_CONTENT_TYPES: ReadonlySet<string> = new Set([
  'update-profile',
  'edit-message',
  'remove-message',
]);

interface HubSealedJSON {
  ephemeral_public_key?: string;
  envelope?: string;
  hub_address?: string;
  hub_public_key?: string;
  hub_signature?: string;
}

/** The decrypted classification of a hub-log entry. Both fields are
 *  optional because either may be unavailable in malformed/legacy
 *  messages. The caller decides what to do with each. */
export interface HubLogClassification {
  contentType: string | null;
  channelId: string | null;
  /** SpaceId that owns this hub address. Surfaced so callers don't
   *  have to repeat the lookup. */
  spaceId: string | null;
}

/**
 * Decrypt a hub-log entry and return its content metadata. Returns
 * `null` on any failure (which means "fall back to showing the
 * notification" — never throws).
 */
export async function classifyHubLogEntry(params: {
  hubAddress: string;
  seq: number;
  userAddress: string;
}): Promise<HubLogClassification | null> {
  try {
    const space = getSpaceByHubAddress(params.hubAddress);
    if (!space) return null;

    const hubKey = getSpaceKey(space.spaceId, 'hub');
    if (!hubKey?.privateKey) return null;
    const configKey = getSpaceKey(space.spaceId, 'config');

    const spaceConversationId = `${space.spaceId}/${space.spaceId}`;
    const encryptionStates = encryptionStateStorage.getEncryptionStates(spaceConversationId);
    if (encryptionStates.length === 0) return null;

    let trState = '';
    let trFallbackState: string | null = null;
    let trStateIsNested = false;

    const parsed = JSON.parse(encryptionStates[0].state);
    if (parsed.state && typeof parsed.state === 'string') {
      trState = parsed.state;
      trStateIsNested = true;
    } else {
      trState = encryptionStates[0].state;
    }

    const fallback = encryptionStateStorage.getFallbackState(
      spaceConversationId,
      encryptionStates[0].inboxId,
    );
    if (fallback) {
      const fallbackParsed = JSON.parse(fallback.state);
      trFallbackState =
        fallbackParsed.state && typeof fallbackParsed.state === 'string'
          ? fallbackParsed.state
          : fallback.state;
    }

    const client = getQuorumClient();
    const entries = await client.fetchHubLog({
      hubAddress: params.hubAddress,
      after: Math.max(0, params.seq - 1),
      limit: 1,
    });
    if (entries.length === 0) return null;
    const entry = entries[0];

    // `payload` is the json-marshaled HubSealedMessage written by
    // appendHubLog. Re-parse the JSON to pull out the envelope fields.
    let sealed: HubSealedJSON;
    try {
      sealed =
        typeof entry.payload === 'string'
          ? (JSON.parse(entry.payload) as HubSealedJSON)
          : (entry.payload as HubSealedJSON);
    } catch {
      return null;
    }
    if (!sealed.ephemeral_public_key || !sealed.envelope) return null;

    const provider = new NativeCryptoProvider();
    const group: BatchSpaceGroup = {
      space_id: space.spaceId,
      hub_private_key: hexToBytes(hubKey.privateKey),
      config_private_key: configKey ? hexToBytes(configKey.privateKey) : null,
      tr_state: trState,
      tr_fallback_state: trFallbackState,
      tr_state_is_nested: trStateIsNested,
      sent_envelope_fingerprints: [],
      messages: [
        {
          inbox_address: '',
          timestamp: entry.ts,
          envelope_type: 'hub',
          ephemeral_public_key: sealed.ephemeral_public_key,
          envelope: sealed.envelope,
        },
      ],
    };

    const result = await provider.batchProcessMessages({
      user_address: params.userAddress,
      space_groups: [group],
      dm_groups: [],
    });

    const msgResult = result.space_results[0]?.messages[0];
    if (!msgResult) return null;
    if (msgResult.status !== 'decrypted' && msgResult.status !== 'control') return null;

    const cleartext = msgResult.decrypted_message ?? msgResult.control_payload;
    if (!cleartext) return null;
    let message: { channelId?: string; content?: { type?: string } };
    try {
      message = JSON.parse(cleartext) as { channelId?: string; content?: { type?: string } };
    } catch {
      return null;
    }
    return {
      contentType: message.content?.type ?? null,
      channelId: message.channelId ?? null,
      spaceId: space.spaceId,
    };
  } catch {
    return null;
  }
}

/**
 * Convenience: returns true if this push should be suppressed (i.e. don't
 * surface a notification for it) based on content type alone. Doesn't
 * check per-channel mute prefs — caller does that with the channelId
 * from classifyHubLogEntry.
 */
export async function shouldSuppressHubLogPush(params: {
  hubAddress: string;
  seq: number;
  userAddress: string;
}): Promise<boolean> {
  const cls = await classifyHubLogEntry(params);
  if (!cls?.contentType) return false;
  return SUPPRESSED_CONTENT_TYPES.has(cls.contentType);
}
