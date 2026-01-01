/**
 * InviteService - Handles space invite link generation and parsing
 *
 * Provides:
 * - Private invite link generation (one-time use)
 * - Invite link parsing
 * - Invite link validation
 *
 * Invite link formats:
 * - Private: https://qm.one/#spaceId={spaceId}&configKey={configKey}&template={template}&secret={secret}&hubKey={hubKey}
 * - Public: https://qm.one/invite/#spaceId={spaceId}&configKey={configKey}
 */

import { logger } from '@quilibrium/quorum-shared';
import { getSpaceKey } from '../config/spaceStorage';
import { encryptionStateStorage } from '../crypto/encryption-state-storage';
import { bytesToHex } from '@quilibrium/quorum-shared';

/**
 * Convert a UTF-8 string to hex encoding
 * React Native compatible - doesn't use Buffer
 */
function stringToHex(str: string): string {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(str);
  return bytesToHex(bytes);
}

// Invite domain configuration
const INVITE_DOMAINS = {
  production: 'qm.one',
  staging: 'test.quorummessenger.com',
  development: 'localhost:3000',
};

// Valid invite link prefixes for parsing
const VALID_INVITE_PREFIXES = [
  'https://qm.one/',
  'https://quorummessenger.com/i/',
  'https://www.quorummessenger.com/i/',
  'http://localhost:3000/',
  'http://localhost:3000/i/',
  'qm.one/',
];

export interface InviteParams {
  spaceId: string;
  configKey: string;
  template?: string;
  secret?: string;
  hubKey?: string;
}

export interface GenerateInviteResult {
  inviteLink: string;
  isOneTimeUse: boolean;
}

/**
 * Get the base URL for invite links
 */
function getInviteUrlBase(isPublicInvite: boolean = false): string {
  const domain = INVITE_DOMAINS.production;
  const path = isPublicInvite ? '/invite/' : '/';
  return `https://${domain}${path}`;
}

/**
 * Generate a private invite link for a space (one-time use)
 *
 * This creates a link with all the cryptographic material needed to join:
 * - configKey: For decrypting space manifest
 * - template: DKG ratchet state
 * - secret: One-time join secret
 * - hubKey: For registering with the hub
 */
export async function generatePrivateInviteLink(spaceId: string): Promise<GenerateInviteResult> {
  logger.log('[InviteService] Generating private invite for space:', spaceId);

  // Get required keys
  const configKey = getSpaceKey(spaceId, 'config');
  if (!configKey?.privateKey) {
    throw new Error('Config key not found for space');
  }

  const hubKey = getSpaceKey(spaceId, 'hub');
  if (!hubKey?.privateKey) {
    throw new Error('Hub key not found for space');
  }

  // Get encryption state for template and secret
  const conversationId = `${spaceId}/${spaceId}`;
  const encryptionStates = encryptionStateStorage.getEncryptionStates(conversationId);

  if (encryptionStates.length === 0) {
    throw new Error('No encryption state found for space. Cannot generate invite.');
  }

  const sets = JSON.parse(encryptionStates[0].state);

  // Debug: Log what's in the encryption state
  logger.log('[InviteService] Encryption state keys:', Object.keys(sets));
  logger.log('[InviteService] Has template:', !!sets.template);
  logger.log('[InviteService] Has evals:', !!sets.evals, 'count:', sets.evals?.length);
  logger.log('[InviteService] Has state:', !!sets.state);

  // Check if we have the template and evals
  // The evals pool is created when a space is created (via establishTripleRatchetSessionForSpace)
  // or when a rekey is received from another member who generated new invites
  if (!sets.template) {
    console.error('[InviteService] Template missing! State structure:', JSON.stringify(sets).substring(0, 500));
    throw new Error('Cannot generate invites from this space. The invite pool was not initialized.');
  }

  if (!sets.evals || sets.evals.length === 0) {
    throw new Error('No invite slots remaining. All invites have been used.');
  }

  // Build the template state matching desktop's approach
  // CRITICAL: Make a deep copy of template so we don't mutate the original!
  // The original template must remain unchanged for subsequent invites
  const state = JSON.parse(JSON.stringify(sets.template));
  const ratchet = JSON.parse(state.dkg_ratchet);

  // Calculate ratchet ID based on remaining evals (matches desktop)
  ratchet.id = 10001 - sets.evals.length;

  // Extract root_key from the state object
  if (!sets.state) {
    throw new Error('Encryption state is missing state data.');
  }

  const parsedState = typeof sets.state === 'string' ? JSON.parse(sets.state) : sets.state;

  // Match desktop exactly: only copy root_key and update dkg_ratchet
  // The template already has the correct header keys and other state from DKG initialization
  state.root_key = parsedState.root_key;
  state.dkg_ratchet = JSON.stringify(ratchet);

  logger.log('[InviteService] Template state (matching desktop):', {
    has_root_key: !!state.root_key,
    ratchet_id: ratchet.id,
  });

  // Debug: Log critical fields in the invite template
  logger.log('[InviteService] Template sending_chain_key exists:', !!state.sending_chain_key);
  logger.log('[InviteService] Template sending_chain_key preview:', state.sending_chain_key?.substring?.(0, 30));
  logger.log('[InviteService] Template receiving_group_key exists:', !!state.receiving_group_key);
  logger.log('[InviteService] Template receiving_group_key preview:', state.receiving_group_key?.substring?.(0, 30));
  logger.log('[InviteService] Template current_header_key:', state.current_header_key);
  logger.log('[InviteService] Template should_ratchet:', state.should_ratchet);

  // Convert template to hex
  const template = stringToHex(JSON.stringify(state));

  // Consume one eval for the secret
  const indexSecretRaw = sets.evals.shift();
  const secret = bytesToHex(new Uint8Array(indexSecretRaw));

  // Update encryption state after consuming eval
  encryptionStateStorage.saveEncryptionState({
    ...encryptionStates[0],
    state: JSON.stringify(sets),
    timestamp: Date.now(),
  });

  // Construct private invite link
  const inviteLink = `${getInviteUrlBase(false)}#spaceId=${spaceId}&configKey=${configKey.privateKey}&template=${template}&secret=${secret}&hubKey=${hubKey.privateKey}`;

  logger.log('[InviteService] Generated private invite link');
  logger.log('[InviteService] Link base:', getInviteUrlBase(false));
  logger.log('[InviteService] Link total length:', inviteLink.length);
  logger.log('[InviteService] Link preview:', inviteLink.substring(0, 150));
  logger.log('[InviteService] spaceId:', spaceId);
  logger.log('[InviteService] configKey length:', configKey.privateKey?.length);
  logger.log('[InviteService] template length:', template?.length);
  logger.log('[InviteService] secret length:', secret?.length);
  logger.log('[InviteService] hubKey length:', hubKey.privateKey?.length);

  return {
    inviteLink,
    isOneTimeUse: true,
  };
}

/**
 * Parse an invite link to extract parameters
 */
export function parseInviteLink(inviteLink: string): InviteParams | null {
  if (!inviteLink || typeof inviteLink !== 'string') {
    return null;
  }

  const trimmed = inviteLink.trim();

  // Check if it matches any valid prefix
  const isValidPrefix = VALID_INVITE_PREFIXES.some(
    (prefix) => trimmed.startsWith(prefix) || trimmed.startsWith(prefix.replace('https://', ''))
  );

  if (!isValidPrefix) {
    logger.warn('[InviteService] Invalid invite link prefix:', trimmed.substring(0, 50));
    return null;
  }

  // Find the hash fragment
  const hashIndex = trimmed.indexOf('#');
  if (hashIndex < 0 || hashIndex === trimmed.length - 1) {
    logger.warn('[InviteService] No hash fragment in invite link');
    return null;
  }

  const hashContent = trimmed.slice(hashIndex + 1);
  const params: Record<string, string> = {};

  // Parse key=value pairs
  for (const pair of hashContent.split('&')) {
    const [key, value] = pair.split('=');
    if (!key || !value) continue;

    if (['spaceId', 'configKey', 'template', 'secret', 'hubKey'].includes(key)) {
      params[key] = value;
    }
  }

  // spaceId and configKey are required
  if (!params.spaceId || !params.configKey) {
    logger.warn('[InviteService] Missing required params (spaceId or configKey)');
    return null;
  }

  return {
    spaceId: params.spaceId,
    configKey: params.configKey,
    template: params.template,
    secret: params.secret,
    hubKey: params.hubKey,
  };
}

/**
 * Validate an invite link format
 */
export function isValidInviteLink(inviteLink: string): boolean {
  return parseInviteLink(inviteLink) !== null;
}

/**
 * Check if an invite link is a public invite (no template/secret)
 */
export function isPublicInvite(inviteLink: string): boolean {
  const params = parseInviteLink(inviteLink);
  if (!params) return false;

  // Public invites don't have template and secret
  return !params.template && !params.secret;
}

/**
 * Get a shortened version of the invite link for display
 */
export function getShortenedInviteLink(inviteLink: string): string {
  const params = parseInviteLink(inviteLink);
  if (!params) return inviteLink;

  // Show just the domain and first 8 chars of spaceId
  const shortSpaceId = params.spaceId.substring(0, 8);
  return `qm.one/#${shortSpaceId}...`;
}
