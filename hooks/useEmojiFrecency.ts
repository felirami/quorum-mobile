/**
 * useEmojiFrecency - Hook for emoji frecency tracking
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { getRecentEmojis, recordEmojiUsage } from '@/services/emojiFrecency';

export function useEmojiFrecency() {
  const [recentEmojis, setRecentEmojis] = useState<string[]>([]);
  const isDirtyRef = useRef(true);

  // Load recent emojis on mount
  useEffect(() => {
    loadRecent();
  }, []);

  const loadRecent = useCallback(async () => {
    if (!isDirtyRef.current) return;
    const emojis = await getRecentEmojis(24);
    setRecentEmojis(emojis);
    isDirtyRef.current = false;
  }, []);

  const trackEmoji = useCallback(async (emoji: string) => {
    // Don't track custom emojis (they start with ':' or are IDs)
    if (emoji.startsWith(':') || emoji.length > 10) {
      return;
    }
    await recordEmojiUsage(emoji);
    // Mark dirty and immediately reload
    isDirtyRef.current = true;
    const emojis = await getRecentEmojis(24);
    setRecentEmojis(emojis);
    isDirtyRef.current = false;
  }, []);

  return {
    recentEmojis,
    trackEmoji,
    refreshRecent: loadRecent,
  };
}
