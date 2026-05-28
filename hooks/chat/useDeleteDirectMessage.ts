/**
 * useDeleteDirectMessage - Hook for deleting direct messages locally
 *
 * Since DMs are end-to-end encrypted, deletion only removes the message
 * from the current user's device. The other participant will still have
 * the message on their device.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useStorageAdapter } from '@/context/StorageContext';
import { queryKeys, type Message } from '@quilibrium/quorum-shared';

export interface UseDeleteDirectMessageParams {
  conversationId: string;
  recipientAddress: string;
  messageId: string;
}

import type { MessagesPage, InfiniteMessagesData } from './queryTypes';

export function useDeleteDirectMessage() {
  const queryClient = useQueryClient();
  const storage = useStorageAdapter();

  return useMutation({
    mutationFn: async (params: UseDeleteDirectMessageParams) => {
      // Delete from local storage
      await storage.deleteMessage(params.messageId);

      return params.messageId;
    },

    onMutate: async (params) => {
      // Use the same query key format as useMessages hook (spaceId, channelId = recipientAddress)
      const key = queryKeys.messages.infinite(params.recipientAddress, params.recipientAddress);

      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: key });

      // Snapshot previous value
      const previousData = queryClient.getQueryData<InfiniteMessagesData>(key);

      // Optimistically remove from cache
      queryClient.setQueryData<InfiniteMessagesData>(key, (old) => {
        if (!old) return old;

        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            messages: page.messages.filter((m) => m.messageId !== params.messageId),
          })),
        };
      });

      return { previousData };
    },

    onError: (err, params, context) => {
      // Rollback on error
      if (context?.previousData) {
        const key = queryKeys.messages.infinite(params.recipientAddress, params.recipientAddress);
        queryClient.setQueryData(key, context.previousData);
      }
    },

    onSettled: (data, err, params) => {
      // Invalidate to ensure consistency
      queryClient.invalidateQueries({
        queryKey: queryKeys.messages.infinite(params.recipientAddress, params.recipientAddress),
      });

      // Also invalidate conversations to update last message if needed
      queryClient.invalidateQueries({
        queryKey: queryKeys.conversations.all('direct'),
      });
    },
  });
}
