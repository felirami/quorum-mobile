/**
 * useSendSpaceMessage - Hook for sending encrypted messages to space channels
 *
 * Uses the SpaceMessageService to:
 * - Create optimistic UI updates
 * - Send encrypted messages via WebSocket
 * - Handle errors with rollback
 */

import { logger } from '@quilibrium/quorum-shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth, useWebSocket } from '@/context';
import {
  sendSpaceMessage,
  createOptimisticMessage,
  type SendSpaceMessageParams,
} from '@/services/space/spaceMessageService';
import { getMMKVAdapter } from '@/services/storage/mmkvAdapter';
import type { Message, GetMessagesResult } from '@quilibrium/quorum-shared';

export interface UseSendSpaceMessageParams {
  spaceId: string;
  channelId: string;
  text: string;
  repliesToMessageId?: string;
}

export function useSendSpaceMessage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { enqueueOutbound, isConnected } = useWebSocket();

  return useMutation({
    mutationFn: async (params: UseSendSpaceMessageParams) => {
      logger.log('[useSendSpaceMessage] mutationFn called with:', params);
      logger.log('[useSendSpaceMessage] user?.address:', user?.address);
      logger.log('[useSendSpaceMessage] WebSocket connected:', isConnected);

      if (!user?.address) {
        console.error('[useSendSpaceMessage] No user address!');
        throw new Error('User must be logged in to send messages');
      }

      if (!isConnected) {
        console.error('[useSendSpaceMessage] WebSocket not connected!');
        throw new Error('Not connected to server. Please wait for connection.');
      }

      logger.log('[useSendSpaceMessage] Calling sendSpaceMessage...');
      const result = await sendSpaceMessage({
        spaceId: params.spaceId,
        channelId: params.channelId,
        text: params.text,
        senderAddress: user.address,
        repliesToMessageId: params.repliesToMessageId,
      });

      // Send via WebSocket
      logger.log('[useSendSpaceMessage] Sending via WebSocket...');
      enqueueOutbound(async () => {
        return [result.wsEnvelope];
      });

      logger.log('[useSendSpaceMessage] Message queued successfully:', result.message.messageId);
      return result.message;
    },

    onMutate: async (params) => {
      if (!user?.address) return;

      const key = ['messages', 'infinite', params.spaceId, params.channelId];

      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: key });

      // Snapshot previous value
      const previousData = queryClient.getQueryData(key);

      // Create optimistic message
      const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const optimisticMessage = createOptimisticMessage(
        {
          spaceId: params.spaceId,
          channelId: params.channelId,
          text: params.text,
          senderAddress: user.address,
          repliesToMessageId: params.repliesToMessageId,
        },
        tempId
      );

      // Optimistically add to cache
      queryClient.setQueryData(
        key,
        (old: { pages: GetMessagesResult[]; pageParams: unknown[] } | undefined) => {
          if (!old) return old;

          return {
            ...old,
            pages: old.pages.map((page, index) => {
              if (index === 0) {
                return {
                  ...page,
                  messages: [...page.messages, optimisticMessage],
                };
              }
              return page;
            }),
          };
        }
      );

      return { previousData, optimisticMessage, tempId };
    },

    onError: (err, params, context) => {
      console.error('[useSendSpaceMessage] Error:', err);

      // Rollback on error
      if (context?.previousData) {
        const key = ['messages', 'infinite', params.spaceId, params.channelId];
        queryClient.setQueryData(key, context.previousData);
      }
    },

    onSuccess: async (message, params, context) => {
      const key = ['messages', 'infinite', params.spaceId, params.channelId];

      // Replace optimistic message with real one
      queryClient.setQueryData(
        key,
        (old: { pages: GetMessagesResult[]; pageParams: unknown[] } | undefined) => {
          if (!old) return old;

          return {
            ...old,
            pages: old.pages.map((page, index) => {
              if (index === 0) {
                return {
                  ...page,
                  messages: page.messages.map((m: Message) =>
                    m.messageId === context?.tempId ? { ...message, sendStatus: 'sent' } : m
                  ),
                };
              }
              return page;
            }),
          };
        }
      );

      // Persist to storage
      const adapter = getMMKVAdapter();
      await adapter.saveMessage(
        message,
        message.createdDate,
        user?.address ?? '',
        'space',
        '',
        ''
      );
    },

    onSettled: (data, err, params) => {
      // Always refetch after mutation settles
      queryClient.invalidateQueries({
        queryKey: ['messages', 'infinite', params.spaceId, params.channelId],
      });
    },
  });
}
