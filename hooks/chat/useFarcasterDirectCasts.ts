/**
 * useFarcasterDirectCasts - Fetches Farcaster direct cast conversations
 */

import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { logger } from '@quilibrium/quorum-shared';
import { useAuth } from '@/context/AuthContext';
import {
  getDirectCastConversations,
  getDirectCastMessages,
  sendDirectCast,
  markDirectCastRead,
  addDirectCastReaction,
  removeDirectCastReaction,
  type DirectCastConversation,
  type DirectCastMessage,
  type DirectCastMessageMetadata,
} from '@/services/farcasterClient';
import type { Conversation } from '@quilibrium/quorum-shared';

export type { DirectCastConversation, DirectCastMessage };

// Query keys for Farcaster direct casts
export const farcasterDCQueryKeys = {
  conversations: ['farcaster-dc-conversations'] as const,
  messages: (conversationId: string) => ['farcaster-dc-messages', conversationId] as const,
};

/**
 * Convert Farcaster conversation to unified Conversation type
 */
function toUnifiedConversation(fc: DirectCastConversation, currentUserFid?: number): Conversation {
  const counterParty = fc.viewerContext?.counterParty ?? fc.participants[0];
  // Use conversation photo (for groups) or counterparty's profile picture
  const iconUrl = fc.photoUrl ?? counterParty?.pfp?.url;

  // Get all participant FIDs except current user (needed for sending messages)
  const participantFids = fc.participants
    .filter((p) => p.fid !== currentUserFid)
    .map((p) => p.fid);

  return {
    conversationId: `farcaster:${fc.conversationId}`,
    type: fc.isGroup ? 'group' : 'direct',
    timestamp: fc.lastMessage?.serverTimestamp ?? Date.now(),
    address: `fid:${counterParty?.fid ?? 0}`,
    icon: iconUrl ?? '',
    displayName: fc.name ?? counterParty?.displayName ?? counterParty?.username ?? 'Unknown',
    source: 'farcaster',
    farcasterConversationId: fc.conversationId,
    farcasterFid: counterParty?.fid,
    farcasterUsername: counterParty?.username,
    farcasterParticipantFids: participantFids,
    // Don't show read status for Farcaster conversations
  };
}

/**
 * Hook to fetch Farcaster direct cast conversations
 */
export function useFarcasterConversations(options?: { enabled?: boolean }) {
  const { farcasterAuthToken, user } = useAuth();
  const hasFarcaster = !!user?.farcaster?.fid;
  const currentUserFid = user?.farcaster?.fid;

  return useInfiniteQuery({
    queryKey: farcasterDCQueryKeys.conversations,
    queryFn: async ({ pageParam }) => {
      if (!farcasterAuthToken) {
        throw new Error('Farcaster auth token not available');
      }

      const result = await getDirectCastConversations({
        token: farcasterAuthToken,
        cursor: pageParam,
        limit: 20,
      });

      return {
        conversations: result.conversations.map((fc) => toUnifiedConversation(fc, currentUserFid)),
        nextCursor: result.nextCursor,
        requestsCount: result.requestsCount,
      };
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: (options?.enabled ?? true) && hasFarcaster && !!farcasterAuthToken,
    staleTime: 30000, // 30 seconds
    refetchInterval: 30000, // Poll every 30 seconds for new conversations/updates
  });
}

/**
 * Hook to fetch messages for a Farcaster direct cast conversation
 */
export function useFarcasterDirectCastMessages(
  conversationId: string | undefined,
  options?: { enabled?: boolean }
) {
  const { farcasterAuthToken } = useAuth();

  // Extract actual Farcaster conversation ID from unified ID
  const fcConversationId = conversationId?.startsWith('farcaster:')
    ? conversationId.slice(10)
    : conversationId;

  return useInfiniteQuery({
    queryKey: farcasterDCQueryKeys.messages(fcConversationId ?? ''),
    queryFn: async ({ pageParam }) => {
      if (!farcasterAuthToken || !fcConversationId) {
        throw new Error('Missing auth token or conversation ID');
      }

      const result = await getDirectCastMessages({
        token: farcasterAuthToken,
        conversationId: fcConversationId,
        cursor: pageParam,
        limit: 50,
      });

      return {
        messages: result.messages,
        nextCursor: result.nextCursor,
      };
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: (options?.enabled ?? true) && !!farcasterAuthToken && !!fcConversationId,
    staleTime: 5000, // 5 seconds
    refetchInterval: 5000, // Poll every 5 seconds for new messages
  });
}

/**
 * Hook to send a Farcaster direct cast
 */
export function useSendFarcasterDirectCast() {
  const { farcasterAuthToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      conversationId,
      recipientFids,
      message,
      inReplyToId,
      metadata,
    }: {
      conversationId: string;
      recipientFids: number[];
      message: string;
      inReplyToId?: string;
      metadata?: DirectCastMessageMetadata;
    }) => {
      logger.log('[useSendFarcasterDirectCast] mutationFn called:', {
        conversationId,
        recipientFids,
        messageLength: message.length,
        hasToken: !!farcasterAuthToken,
        hasMetadata: !!metadata,
      });

      if (!farcasterAuthToken) {
        throw new Error('Farcaster auth token not available');
      }

      // Extract actual Farcaster conversation ID
      const fcConversationId = conversationId.startsWith('farcaster:')
        ? conversationId.slice(10)
        : conversationId;

      logger.log('[useSendFarcasterDirectCast] Calling sendDirectCast with fcConversationId:', fcConversationId);

      return sendDirectCast({
        token: farcasterAuthToken,
        conversationId: fcConversationId,
        recipientFids,
        message,
        inReplyToId,
        metadata,
      });
    },
    onSuccess: (result, variables) => {
      logger.log('[useSendFarcasterDirectCast] onSuccess:', result);
      // Invalidate messages for this conversation
      const fcConversationId = variables.conversationId.startsWith('farcaster:')
        ? variables.conversationId.slice(10)
        : variables.conversationId;
      queryClient.invalidateQueries({
        queryKey: farcasterDCQueryKeys.messages(fcConversationId),
      });
      // Also refresh conversations list
      queryClient.invalidateQueries({
        queryKey: farcasterDCQueryKeys.conversations,
      });
    },
    onError: (error, variables) => {
      logger.log('[useSendFarcasterDirectCast] onError:', error, 'variables:', variables);
    },
  });
}

/**
 * Hook to mark a Farcaster conversation as read
 */
export function useMarkFarcasterConversationRead() {
  const { farcasterAuthToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (conversationId: string) => {
      if (!farcasterAuthToken) {
        throw new Error('Farcaster auth token not available');
      }

      const fcConversationId = conversationId.startsWith('farcaster:')
        ? conversationId.slice(10)
        : conversationId;

      return markDirectCastRead({
        token: farcasterAuthToken,
        conversationId: fcConversationId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: farcasterDCQueryKeys.conversations,
      });
    },
  });
}

/**
 * Hook to add a reaction to a Farcaster direct cast message
 */
export function useAddFarcasterDirectCastReaction() {
  const { farcasterAuthToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      conversationId,
      messageId,
      reaction,
    }: {
      conversationId: string;
      messageId: string;
      reaction: string;
    }) => {
      if (!farcasterAuthToken) {
        throw new Error('Farcaster auth token not available');
      }

      const fcConversationId = conversationId.startsWith('farcaster:')
        ? conversationId.slice(10)
        : conversationId;

      return addDirectCastReaction({
        token: farcasterAuthToken,
        conversationId: fcConversationId,
        messageId,
        reaction,
      });
    },
    onSuccess: (_, variables) => {
      const fcConversationId = variables.conversationId.startsWith('farcaster:')
        ? variables.conversationId.slice(10)
        : variables.conversationId;
      queryClient.invalidateQueries({
        queryKey: farcasterDCQueryKeys.messages(fcConversationId),
      });
    },
  });
}

/**
 * Hook to remove a reaction from a Farcaster direct cast message
 */
export function useRemoveFarcasterDirectCastReaction() {
  const { farcasterAuthToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      conversationId,
      messageId,
      reaction,
    }: {
      conversationId: string;
      messageId: string;
      reaction: string;
    }) => {
      if (!farcasterAuthToken) {
        throw new Error('Farcaster auth token not available');
      }

      const fcConversationId = conversationId.startsWith('farcaster:')
        ? conversationId.slice(10)
        : conversationId;

      return removeDirectCastReaction({
        token: farcasterAuthToken,
        conversationId: fcConversationId,
        messageId,
        reaction,
      });
    },
    onSuccess: (_, variables) => {
      const fcConversationId = variables.conversationId.startsWith('farcaster:')
        ? variables.conversationId.slice(10)
        : variables.conversationId;
      queryClient.invalidateQueries({
        queryKey: farcasterDCQueryKeys.messages(fcConversationId),
      });
    },
  });
}
