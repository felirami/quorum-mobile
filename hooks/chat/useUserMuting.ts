/**
 * useUserMuting - Hook for muting/unmuting users within a space
 *
 * Muted users' messages are hidden locally.
 * Uses MMKV for local persistence per-space.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/context';
import { createMMKV } from 'react-native-mmkv';

const storage = createMMKV({ id: 'space-user-mutes' });

function getStorageKey(userAddress: string, spaceId: string): string {
  return `muted:${userAddress}:${spaceId}`;
}

function loadMutedUsers(userAddress: string, spaceId: string): Set<string> {
  const raw = storage.getString(getStorageKey(userAddress, spaceId));
  if (!raw) return new Set();
  try {
    return new Set(JSON.parse(raw));
  } catch {
    return new Set();
  }
}

function saveMutedUsers(userAddress: string, spaceId: string, muted: Set<string>): void {
  storage.set(getStorageKey(userAddress, spaceId), JSON.stringify([...muted]));
}

export function useUserMuting(spaceId?: string) {
  const { user } = useAuth();
  const [mutedUsers, setMutedUsers] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user?.address || !spaceId) {
      setMutedUsers(new Set());
      return;
    }
    setMutedUsers(loadMutedUsers(user.address, spaceId));
  }, [user?.address, spaceId]);

  const toggleMuteUser = useCallback((targetUserId: string) => {
    if (!user?.address || !spaceId) return;

    setMutedUsers(prev => {
      const next = new Set(prev);
      if (next.has(targetUserId)) {
        next.delete(targetUserId);
      } else {
        next.add(targetUserId);
      }
      saveMutedUsers(user.address, spaceId, next);
      return next;
    });
  }, [user?.address, spaceId]);

  const isUserMuted = useCallback((targetUserId: string): boolean => {
    return mutedUsers.has(targetUserId);
  }, [mutedUsers]);

  const filteredMessages = useMemo(() => {
    return <T extends { userId: string }>(messages: T[]): T[] => {
      if (mutedUsers.size === 0) return messages;
      return messages.filter(m => !mutedUsers.has(m.userId));
    };
  }, [mutedUsers]);

  return {
    mutedUsers,
    toggleMuteUser,
    isUserMuted,
    filteredMessages,
  };
}
