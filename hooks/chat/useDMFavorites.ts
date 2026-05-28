/**
 * useDMFavorites - Hook for managing favorite DM conversations
 *
 * Stores favorites in local MMKV storage.
 * Favorites sort to the top of the DM list.
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context';
import { createMMKV } from 'react-native-mmkv';

const storage = createMMKV({ id: 'dm-favorites' });

function getStorageKey(userAddress: string): string {
  return `favorites:${userAddress}`;
}

function loadFavorites(userAddress: string): Set<string> {
  const raw = storage.getString(getStorageKey(userAddress));
  if (!raw) return new Set();
  try {
    return new Set(JSON.parse(raw));
  } catch {
    return new Set();
  }
}

function saveFavorites(userAddress: string, favorites: Set<string>): void {
  storage.set(getStorageKey(userAddress), JSON.stringify([...favorites]));
}

export function useDMFavorites() {
  const { user } = useAuth();
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user?.address) {
      setFavorites(new Set());
      return;
    }
    setFavorites(loadFavorites(user.address));
  }, [user?.address]);

  const toggleFavorite = useCallback((conversationId: string) => {
    if (!user?.address) return;

    setFavorites(prev => {
      const next = new Set(prev);
      if (next.has(conversationId)) {
        next.delete(conversationId);
      } else {
        next.add(conversationId);
      }
      saveFavorites(user.address, next);
      return next;
    });
  }, [user?.address]);

  const isFavorite = useCallback((conversationId: string): boolean => {
    return favorites.has(conversationId);
  }, [favorites]);

  return {
    favorites,
    toggleFavorite,
    isFavorite,
  };
}
