/**
 * useRecipientRegistration - Hook to fetch and cache recipient encryption info
 *
 * Fetches the recipient's registration (identity key, signed pre-key, inbox address)
 * needed for X3DH key exchange when sending encrypted messages.
 */

import { logger } from '@quilibrium/quorum-shared';
import { getQuorumClient, type UserRegistration } from '@/services/api/quorumClient';
import { encryptionStateStorage } from '@/services/crypto/encryption-state-storage';
import { useQuery } from '@tanstack/react-query';

/**
 * Query key for recipient registration
 */
export function recipientRegistrationKey(address: string) {
  return ['user', 'registration', address] as const;
}

/**
 * Fetch recipient registration for E2E encryption
 *
 * @param recipientAddress - The address of the recipient
 * @param options.enabled - Whether to enable the query (default: true if address provided)
 */
export function useRecipientRegistration(
  recipientAddress: string | undefined,
  options?: { enabled?: boolean }
) {
  const apiClient = getQuorumClient();

  return useQuery({
    queryKey: recipientAddress ? recipientRegistrationKey(recipientAddress) : ['user', 'registration'],
    queryFn: async () => {
      if (!recipientAddress) {
        throw new Error('Recipient address required');
      }
      return apiClient.fetchUserRegistration(recipientAddress);
    },
    enabled: !!recipientAddress && (options?.enabled ?? true),
    staleTime: 1000 * 60 * 60, // 1 hour - keys don't change often
    gcTime: 1000 * 60 * 60 * 24, // 24 hours
  });
}

/**
 * Check if we have an existing encryption session with a recipient
 */
export function useHasEncryptionSession(conversationId: string | undefined): boolean {
  if (!conversationId) return false;
  return encryptionStateStorage.hasEncryptionState(conversationId);
}

/**
 * Convert hex string to number array
 */
function hexToBytes(hex: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.substr(i, 2), 16));
  }
  return bytes;
}

/**
 * Convert UserRegistration to the format needed by useSendDirectMessage
 */
export function toRecipientInfo(registration: UserRegistration) {
  // Get the first device registration (primary device)
  const device = registration.device_registrations?.[0];

  if (!device) {
    logger.log('[E2E] No device registrations found for user:', registration.user_address);
    return null;
  }

  // Extract fields from API structure:
  // - identity_public_key: hex string
  // - pre_public_key: hex string (the "signed pre-key" for X3DH)
  // - inbox_registration: { inbox_address, inbox_encryption_public_key }
  const identityKey = device.identity_public_key;
  const preKey = device.pre_public_key;
  const inboxAddr = device.inbox_registration?.inbox_address;

  logger.log('[E2E] Converting registration to recipientInfo:', {
    userAddress: registration.user_address,
    identityKeyLength: identityKey?.length,
    preKeyLength: preKey?.length,
    inboxAddress: inboxAddr,
  });

  if (!identityKey || !preKey || !inboxAddr) {
    logger.log('[E2E] Missing required fields in device registration:', {
      hasIdentityKey: !!identityKey,
      hasPreKey: !!preKey,
      hasInboxAddr: !!inboxAddr,
    });
    return null;
  }

  // Get the inbox encryption public key for sealing the message
  const inboxEncryptionKey = device.inbox_registration?.inbox_encryption_public_key;

  if (!inboxEncryptionKey) {
    logger.log('[E2E] Missing inbox_encryption_public_key in device registration');
    return null;
  }

  logger.log('[E2E] inbox_encryption_public_key length:', inboxEncryptionKey.length);

  // Convert hex strings to number arrays for the crypto provider
  return {
    identityKey: hexToBytes(identityKey),
    signedPreKey: hexToBytes(preKey),
    inboxAddress: inboxAddr,
    inboxEncryptionKey: hexToBytes(inboxEncryptionKey),
  };
}
