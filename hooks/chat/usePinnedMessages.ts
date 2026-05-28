/**
 * usePinnedMessages - Hook for pinning/unpinning messages
 *
 * Pins are stored locally in MMKV (no server-side pin API exists).
 * Pin state is persisted per channel and applied to the messages cache.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context';
import { createMMKV } from 'react-native-mmkv';
import type { Message, GetMessagesResult } from '@quilibrium/quorum-shared';

const pinStorage = createMMKV({ id: 'quorum-pins' });

export interface UsePinMessageParams {
  spaceId: string;
  channelId: string;
  messageId: string;
}

interface PinEntry {
  messageId: string;
  pinnedAt: number;
  pinnedBy: string;
}

function getPinKey(spaceId: string, channelId: string): string {
  return `pins:${spaceId}:${channelId}`;
}

function getPinnedEntries(spaceId: string, channelId: string): PinEntry[] {
  const raw = pinStorage.getString(getPinKey(spaceId, channelId));
  if (!raw) return [];
  try {
    return JSON.parse(raw) as PinEntry[];
  } catch {
    return [];
  }
}

function savePinnedEntries(spaceId: string, channelId: string, entries: PinEntry[]): void {
  pinStorage.set(getPinKey(spaceId, channelId), JSON.stringify(entries));
}

const MAX_PINS = 50;

/**
 * Check if a message is pinned (for hydrating message list display).
 */
export function isMessagePinned(spaceId: string, channelId: string, messageId: string): boolean {
  const entries = getPinnedEntries(spaceId, channelId);
  return entries.some(e => e.messageId === messageId);
}

/**
 * Get the set of pinned message IDs for a channel (for bulk hydration).
 */
export function getPinnedMessageIds(spaceId: string, channelId: string): Set<string> {
  const entries = getPinnedEntries(spaceId, channelId);
  return new Set(entries.map(e => e.messageId));
}

export function usePinMessage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (params: UsePinMessageParams) => {
      const entries = getPinnedEntries(params.spaceId, params.channelId);
      if (entries.length >= MAX_PINS) {
        throw new Error(`Pin limit reached (${MAX_PINS})`);
      }
      if (entries.some(e => e.messageId === params.messageId)) {
        return; // Already pinned
      }
      entries.push({
        messageId: params.messageId,
        pinnedAt: Date.now(),
        pinnedBy: user?.address ?? '',
      });
      savePinnedEntries(params.spaceId, params.channelId, entries);
    },

    onMutate: async (params) => {
      const key = ['messages', 'infinite', params.spaceId, params.channelId];
      await queryClient.cancelQueries({ queryKey: key });

      // Optimistically mark message as pinned in cache
      queryClient.setQueryData(
        key,
        (old: { pages: GetMessagesResult[]; pageParams: unknown[] } | undefined) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              messages: page.messages.map((m: Message) => {
                if (m.messageId === params.messageId) {
                  return { ...m, isPinned: true, pinnedAt: Date.now(), pinnedBy: user?.address };
                }
                return m;
              }),
            })),
          };
        }
      );
    },

    onSettled: (_, __, params) => {
      queryClient.invalidateQueries({
        queryKey: ['pinnedMessages', params.spaceId, params.channelId],
      });
    },
  });
}

export function useUnpinMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: UsePinMessageParams) => {
      const entries = getPinnedEntries(params.spaceId, params.channelId);
      const filtered = entries.filter(e => e.messageId !== params.messageId);
      savePinnedEntries(params.spaceId, params.channelId, filtered);
    },

    onMutate: async (params) => {
      const key = ['messages', 'infinite', params.spaceId, params.channelId];
      await queryClient.cancelQueries({ queryKey: key });

      // Optimistically unpin in cache
      queryClient.setQueryData(
        key,
        (old: { pages: GetMessagesResult[]; pageParams: unknown[] } | undefined) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              messages: page.messages.map((m: Message) => {
                if (m.messageId === params.messageId) {
                  return { ...m, isPinned: false, pinnedAt: undefined, pinnedBy: undefined };
                }
                return m;
              }),
            })),
          };
        }
      );
    },

    onSettled: (_, __, params) => {
      queryClient.invalidateQueries({
        queryKey: ['pinnedMessages', params.spaceId, params.channelId],
      });
    },
  });
}

/**
 * Get pinned messages for a channel.
 * Reads pinned IDs from MMKV, then finds matching messages in the cache.
 */
export function usePinnedMessages(spaceId?: string, channelId?: string) {
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: ['pinnedMessages', spaceId, channelId],
    queryFn: () => {
      if (!spaceId || !channelId) return [];

      const entries = getPinnedEntries(spaceId, channelId);
      if (entries.length === 0) return [];

      const pinnedIds = new Set(entries.map(e => e.messageId));
      const pinnedAtMap = new Map(entries.map(e => [e.messageId, e.pinnedAt]));

      const key = ['messages', 'infinite', spaceId, channelId];
      const data = queryClient.getQueryData<{ pages: GetMessagesResult[]; pageParams: unknown[] }>(key);
      if (!data) return [];

      const pinned: Message[] = [];
      for (const page of data.pages) {
        for (const msg of page.messages) {
          if (pinnedIds.has(msg.messageId)) {
            pinned.push({
              ...msg,
              isPinned: true,
              pinnedAt: pinnedAtMap.get(msg.messageId),
            });
          }
        }
      }

      // Sort by pinnedAt descending (newest pins first)
      pinned.sort((a, b) => (b.pinnedAt ?? 0) - (a.pinnedAt ?? 0));
      return pinned;
    },
    enabled: !!spaceId && !!channelId,
    staleTime: 10000,
  });
}
