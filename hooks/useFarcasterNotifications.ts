/**
 * useFarcasterNotifications — paginated Farcaster notifications for the
 * authenticated user. React Query backs the cache so the notifications
 * tab and the tab-badge consumer can share a single fetch.
 *
 * Refetches every 60s while focused so the bell badge stays current
 * without us having to wire push.
 */

import { useInfiniteQuery } from '@tanstack/react-query';
import {
  fetchFarcasterNotifications,
  type FarcasterNotification,
  type FarcasterNotificationsPage,
} from '@/services/farcasterClient';

export function useFarcasterNotifications(token: string | undefined) {
  return useInfiniteQuery<
    FarcasterNotificationsPage,
    Error,
    { pages: FarcasterNotificationsPage[]; pageParams: (string | undefined)[] },
    readonly ['farcaster-notifications', string | undefined],
    string | undefined
  >({
    queryKey: ['farcaster-notifications', token] as const,
    queryFn: async ({ pageParam }) => {
      if (!token) return { notifications: [], nextCursor: null };
      // Errors propagate so React Query can surface them via `error`.
      // Returning null on failure (the previous behavior) hid real
      // problems — auth expiry, server 5xx, parser misalignment — and
      // made the screen look like the user had no notifications when
      // really the call wasn't completing.
      return await fetchFarcasterNotifications({ token, cursor: pageParam, limit: 25 });
    },
    initialPageParam: undefined,
    getNextPageParam: (last) => last?.nextCursor ?? undefined,
    enabled: !!token,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    retry: 1,
  });
}

export function flattenFarcasterNotifications(
  pages: (FarcasterNotificationsPage | null | undefined)[] | undefined,
): FarcasterNotification[] {
  if (!pages) return [];
  const seen = new Set<string>();
  const out: FarcasterNotification[] = [];
  for (const page of pages) {
    // Pages from a stale persisted React Query cache (or from earlier
    // builds that returned null on fetch failure) can be null/undefined
    // at runtime even though the new type forbids it. Skip those rather
    // than crashing the tab-bar icon, which would soft-brick the app's
    // navigation until the user wipes app data.
    if (!page || !Array.isArray(page.notifications)) continue;
    for (const n of page.notifications) {
      if (seen.has(n.id)) continue;
      seen.add(n.id);
      out.push(n);
    }
  }
  return out;
}
