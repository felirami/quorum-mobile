/**
 * useUnifiedConversations - Merges E2EE (Quorum) and Farcaster conversations
 * into a single sorted list by timestamp
 */

import { useMemo } from 'react';
import { useConversations } from './useConversations';
import { useFarcasterConversations } from './useFarcasterDirectCasts';
import type { Conversation } from '@quilibrium/quorum-shared';

export interface UnifiedConversationsResult {
  conversations: Conversation[];
  isLoading: boolean;
  isRefreshing: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  fetchNextPage: () => void;
  hasNextPage: boolean;
}

export function useUnifiedConversations(options?: { enabled?: boolean }): UnifiedConversationsResult {
  // Fetch E2EE conversations from local storage
  const quorumQuery = useConversations({ type: 'direct', enabled: options?.enabled });

  // Fetch Farcaster direct cast conversations
  const farcasterQuery = useFarcasterConversations({ enabled: options?.enabled });

  // Merge and sort conversations by timestamp
  const conversations = useMemo(() => {
    const quorumConversations: Conversation[] = (
      quorumQuery.data?.pages.flatMap((page) => page.conversations) ?? []
    ).map((conv) => ({
      ...conv,
      source: 'quorum' as const,
    }));

    const farcasterConversations: Conversation[] =
      farcasterQuery.data?.pages.flatMap((page) => page.conversations) ?? [];

    // Merge both lists
    const all = [...quorumConversations, ...farcasterConversations];

    // Sort by timestamp (newest first)
    return all.sort((a, b) => b.timestamp - a.timestamp);
  }, [quorumQuery.data, farcasterQuery.data]);

  const isLoading = quorumQuery.isLoading || farcasterQuery.isLoading;
  const isRefreshing = quorumQuery.isRefetching || farcasterQuery.isRefetching;
  const error = quorumQuery.error ?? farcasterQuery.error ?? null;

  const refetch = async () => {
    await Promise.all([
      quorumQuery.refetch(),
      farcasterQuery.refetch(),
    ]);
  };

  const fetchNextPage = () => {
    if (quorumQuery.hasNextPage) {
      quorumQuery.fetchNextPage();
    }
    if (farcasterQuery.hasNextPage) {
      farcasterQuery.fetchNextPage();
    }
  };

  const hasNextPage = quorumQuery.hasNextPage || farcasterQuery.hasNextPage;

  return {
    conversations,
    isLoading,
    isRefreshing,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
  };
}
