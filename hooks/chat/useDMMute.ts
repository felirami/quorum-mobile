/**
 * useDMMute - Hook for muting/unmuting DM conversations
 *
 * Stores muted conversations in local MMKV storage.
 * Muted conversations are excluded from unread badge counts.
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context';
import { createMMKV } from 'react-native-mmkv';

const storage = createMMKV({ id: 'dm-muted' });

function getStorageKey(userAddress: string): string {
  return `muted:${userAddress}`;
}

function loadMuted(userAddress: string): Set<string> {
  const raw = storage.getString(getStorageKey(userAddress));
  if (!raw) return new Set();
  try {
    return new Set(JSON.parse(raw));
  } catch {
    return new Set();
  }
}

function saveMuted(userAddress: string, muted: Set<string>): void {
  storage.set(getStorageKey(userAddress), JSON.stringify([...muted]));
}

export function useDMMute() {
  const { user } = useAuth();
  const [mutedConversations, setMutedConversations] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user?.address) {
      setMutedConversations(new Set());
      return;
    }
    setMutedConversations(loadMuted(user.address));
  }, [user?.address]);

  const toggleMute = useCallback((conversationId: string) => {
    if (!user?.address) return;

    setMutedConversations(prev => {
      const next = new Set(prev);
      if (next.has(conversationId)) {
        next.delete(conversationId);
      } else {
        next.add(conversationId);
      }
      saveMuted(user.address, next);
      return next;
    });
  }, [user?.address]);

  const isMuted = useCallback((conversationId: string): boolean => {
    return mutedConversations.has(conversationId);
  }, [mutedConversations]);

  return {
    mutedConversations,
    toggleMute,
    isMuted,
  };
}
