/**
 * useSpaceReactions - Hook for sending reactions in encrypted space channels
 *
 * Uses the SpaceMessageService to:
 * - Send encrypted reactions via WebSocket
 * - Optimistically update local cache
 * - Handle errors
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth, useWebSocket } from '@/context';
import {
  sendReaction,
  removeReaction,
} from '@/services/space/spaceMessageService';
import type { Message, GetMessagesResult, Reaction } from '@quilibrium/quorum-shared';

export interface UseSpaceReactionParams {
  spaceId: string;
  channelId: string;
  messageId: string;
  emoji: string;
}

export function useAddSpaceReaction() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { enqueueOutbound, isConnected } = useWebSocket();

  return useMutation({
    mutationFn: async (params: UseSpaceReactionParams) => {
      if (!user?.address) {
        throw new Error('User must be logged in to add reactions');
      }

      if (!isConnected) {
        throw new Error('Not connected to server');
      }

      const result = await sendReaction({
        spaceId: params.spaceId,
        channelId: params.channelId,
        targetMessageId: params.messageId,
        reaction: params.emoji,
        senderAddress: user.address,
      });

      // Send via WebSocket
      enqueueOutbound(async () => {
        return [result.wsEnvelope];
      });

      return result;
    },

    onMutate: async (params) => {
      if (!user?.address) return;

      const key = ['messages', 'infinite', params.spaceId, params.channelId];

      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: key });

      // Snapshot previous value
      const previousData = queryClient.getQueryData(key);

      // Optimistically add reaction to message
      queryClient.setQueryData(
        key,
        (old: { pages: GetMessagesResult[]; pageParams: unknown[] } | undefined) => {
          if (!old) return old;

          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              messages: page.messages.map((m: Message) => {
                if (m.messageId !== params.messageId) return m;

                // Find existing reaction or create new one
                const existingReactions = m.reactions || [];
                const existingReaction = existingReactions.find(
                  (r) => r.emojiName === params.emoji || r.emojiId === params.emoji
                );

                if (existingReaction) {
                  // Add user to existing reaction
                  if (!existingReaction.memberIds.includes(user.address!)) {
                    return {
                      ...m,
                      reactions: existingReactions.map((r) =>
                        r === existingReaction
                          ? {
                              ...r,
                              count: r.count + 1,
                              memberIds: [...r.memberIds, user.address!],
                            }
                          : r
                      ),
                    };
                  }
                  return m; // Already reacted
                } else {
                  // Create new reaction
                  const newReaction: Reaction = {
                    emojiId: params.emoji,
                    emojiName: params.emoji,
                    spaceId: params.spaceId,
                    count: 1,
                    memberIds: [user.address!],
                  };
                  return {
                    ...m,
                    reactions: [...existingReactions, newReaction],
                  };
                }
              }),
            })),
          };
        }
      );

      return { previousData };
    },

    onError: (err, params, context) => {
      console.error('[useAddSpaceReaction] Error:', err);

      // Rollback on error
      if (context?.previousData) {
        const key = ['messages', 'infinite', params.spaceId, params.channelId];
        queryClient.setQueryData(key, context.previousData);
      }
    },
  });
}

export function useRemoveSpaceReaction() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { enqueueOutbound, isConnected } = useWebSocket();

  return useMutation({
    mutationFn: async (params: UseSpaceReactionParams) => {
      if (!user?.address) {
        throw new Error('User must be logged in to remove reactions');
      }

      if (!isConnected) {
        throw new Error('Not connected to server');
      }

      const result = await removeReaction({
        spaceId: params.spaceId,
        channelId: params.channelId,
        targetMessageId: params.messageId,
        reaction: params.emoji,
        senderAddress: user.address,
      });

      // Send via WebSocket
      enqueueOutbound(async () => {
        return [result.wsEnvelope];
      });

      return result;
    },

    onMutate: async (params) => {
      if (!user?.address) return;

      const key = ['messages', 'infinite', params.spaceId, params.channelId];

      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: key });

      // Snapshot previous value
      const previousData = queryClient.getQueryData(key);

      // Optimistically remove reaction from message
      queryClient.setQueryData(
        key,
        (old: { pages: GetMessagesResult[]; pageParams: unknown[] } | undefined) => {
          if (!old) return old;

          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              messages: page.messages.map((m: Message) => {
                if (m.messageId !== params.messageId) return m;

                const existingReactions = m.reactions || [];
                return {
                  ...m,
                  reactions: existingReactions
                    .map((r) => {
                      if (r.emojiName !== params.emoji && r.emojiId !== params.emoji) {
                        return r;
                      }
                      // Remove user from reaction
                      const newMemberIds = r.memberIds.filter((id) => id !== user.address);
                      if (newMemberIds.length === 0) {
                        return null; // Remove reaction entirely
                      }
                      return {
                        ...r,
                        count: newMemberIds.length,
                        memberIds: newMemberIds,
                      };
                    })
                    .filter((r): r is Reaction => r !== null),
                };
              }),
            })),
          };
        }
      );

      return { previousData };
    },

    onError: (err, params, context) => {
      console.error('[useRemoveSpaceReaction] Error:', err);

      // Rollback on error
      if (context?.previousData) {
        const key = ['messages', 'infinite', params.spaceId, params.channelId];
        queryClient.setQueryData(key, context.previousData);
      }
    },
  });
}
