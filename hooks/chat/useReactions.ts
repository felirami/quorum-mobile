/**
 * useReactions mutation hook wrappers
 */

import { useAddReaction as useAddReactionBase, useRemoveReaction as useRemoveReactionBase } from '@quilibrium/quorum-shared';
import { useStorageAdapter } from '../../context/StorageContext';
import { useApiClient } from '../../context/ApiClientContext';

export interface UseReactionsOptions {
  currentUserId?: string;
}

export function useAddReaction(options?: UseReactionsOptions) {
  const storage = useStorageAdapter();
  const apiClient = useApiClient();

  return useAddReactionBase({
    storage,
    apiClient,
    currentUserId: options?.currentUserId ?? 'current-user',
  });
}

export function useRemoveReaction(options?: UseReactionsOptions) {
  const storage = useStorageAdapter();
  const apiClient = useApiClient();

  return useRemoveReactionBase({
    storage,
    apiClient,
    currentUserId: options?.currentUserId ?? 'current-user',
  });
}
