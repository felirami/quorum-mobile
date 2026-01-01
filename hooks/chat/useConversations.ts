/**
 * useConversations hook - Fetches direct message conversations from local storage
 */

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useStorageAdapter } from '@/context/StorageContext';
import { queryKeys } from '@quilibrium/quorum-shared';

// Re-export types from shared (they come from storage adapter)
export type { Conversation } from '@quilibrium/quorum-shared';

export interface ConversationWithPreview {
  conversationId: string;
  address: string;
  displayName?: string;
  icon?: string;
  preview?: string;
  previewIcon?: string;
  timestamp: number;
  lastReadTimestamp?: number;
  type: 'direct' | 'group';
}

export function useConversations(options?: { type?: 'direct' | 'group'; enabled?: boolean }) {
  const storage = useStorageAdapter();
  const type = options?.type ?? 'direct';

  return useInfiniteQuery({
    queryKey: queryKeys.conversations.all(type),
    queryFn: async ({ pageParam }) => {
      const result = await storage.getConversations({
        type,
        cursor: pageParam,
        limit: 50,
      });
      return result;
    },
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: options?.enabled ?? true,
    staleTime: 30000, // 30 seconds
  });
}

export function useConversation(conversationId: string | undefined, options?: { enabled?: boolean }) {
  const storage = useStorageAdapter();

  return useQuery({
    queryKey: queryKeys.conversations.detail(conversationId ?? ''),
    queryFn: async () => {
      if (!conversationId) return undefined;
      return storage.getConversation(conversationId);
    },
    enabled: (options?.enabled ?? true) && !!conversationId,
  });
}
