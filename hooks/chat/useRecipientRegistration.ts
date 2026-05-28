/**
 * useRecipientRegistration - Hook to fetch and cache recipient encryption info
 *
 * Fetches the recipient's registration (identity key, signed pre-key, inbox address)
 * needed for X3DH key exchange when sending encrypted messages.
 */

import { getQuorumClient, type UserRegistration } from '@/services/api/quorumClient';
import { encryptionStateStorage } from '@/services/crypto/encryption-state-storage';
import { useQuery } from '@tanstack/react-query';
import { logger } from '@quilibrium/quorum-shared';

const log = logger.scope('[Registration]');

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
      log.log('Fetching registration', { address: recipientAddress?.substring(0, 12) });
      const result = await apiClient.fetchUserRegistration(recipientAddress);
      log.log('Registration result', {
        address: recipientAddress?.substring(0, 12),
        found: !!result,
        deviceCount: result?.device_registrations?.length ?? 0,
      });
      return result;
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

/** Device info for a single device/inbox */
export interface DeviceInfo {
  identityKey: number[];
  signedPreKey: number[];
  inboxAddress: string;
  inboxEncryptionKey: number[];
}

/**
 * Convert UserRegistration to the format needed by useSendDirectMessage
 * Returns info for the first device only (for backward compatibility)
 */
export function toRecipientInfo(registration: UserRegistration): DeviceInfo | null {
  const devices = toAllDeviceInfos(registration);
  return devices.length > 0 ? devices[0] : null;
}

/**
 * Convert UserRegistration to info for ALL devices
 * Used for multi-device DM support - messages are sent to all recipient devices
 */
export function toAllDeviceInfos(registration: UserRegistration): DeviceInfo[] {
  const devices = registration.device_registrations ?? [];

  if (devices.length === 0) {
    return [];
  }

  const deviceInfos: DeviceInfo[] = [];

  for (const device of devices) {
    const identityKey = device.identity_public_key;
    const preKey = device.pre_public_key;
    const inboxAddr = device.inbox_registration?.inbox_address;
    const inboxEncryptionKey = device.inbox_registration?.inbox_encryption_public_key;

    if (!identityKey || !preKey || !inboxAddr || !inboxEncryptionKey) {
      continue;
    }

    deviceInfos.push({
      identityKey: hexToBytes(identityKey),
      signedPreKey: hexToBytes(preKey),
      inboxAddress: inboxAddr,
      inboxEncryptionKey: hexToBytes(inboxEncryptionKey),
    });
  }

  return deviceInfos;
}
