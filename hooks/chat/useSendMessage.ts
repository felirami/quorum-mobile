/**
 * useSendMessage mutation hook wrapper
 */

import { useSendMessage as useSendMessageBase } from '@quilibrium/quorum-shared';
import { useStorageAdapter } from '../../context/StorageContext';
import { useApiClient } from '../../context/ApiClientContext';

export interface UseSendMessageOptions {
  currentUserId?: string;
}

export function useSendMessage(options?: UseSendMessageOptions) {
  const storage = useStorageAdapter();
  const apiClient = useApiClient();

  return useSendMessageBase({
    storage,
    apiClient,
    currentUserId: options?.currentUserId ?? 'current-user',
  });
}
