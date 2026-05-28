/**
 * useUnifiedNotifications — merges Farcaster notifications (mentions,
 * replies, likes, recasts, follows) with the local chat notification log
 * (every showMessageNotification call gets logged). The notifications
 * tab + the bell-icon badge both consume this so they stay in sync.
 *
 * Items are normalized to a single shape and sorted newest-first.
 * Unread count is the number of items with timestamp > lastSeen, where
 * lastSeen is shared across both sources via MMKV.
 */

import { useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import {
  flattenFarcasterNotifications,
  useFarcasterNotifications,
} from './useFarcasterNotifications';
import { isScamCast } from '@/services/farcaster/scamFilter';
import {
  getLastSeenTimestamp,
  useNotificationLog,
  type NotificationLogEntry,
} from '@/services/notifications/notificationLog';
import type {
  FarcasterNotification,
  FarcasterNotificationType,
} from '@/services/farcasterClient';

export type UnifiedNotificationSource = 'chat' | 'farcaster';

export interface UnifiedNotification {
  id: string;
  source: UnifiedNotificationSource;
  /** ms epoch — used for sort order and unread comparison. */
  timestamp: number;
  title: string;
  body?: string;
  actorAvatarUrl?: string;
  /** Routing payload — consumer picks branch on `type` to deep-link. */
  link?:
    | { type: 'message'; spaceId?: string; channelId?: string; conversationId?: string }
    | { type: 'cast'; castHash: string; username?: string }
    | { type: 'frame'; url: string };
  /** Original objects in case a renderer wants more detail. */
  raw?: { chat?: NotificationLogEntry; farcaster?: FarcasterNotification };
}

function actorName(n: FarcasterNotification): string {
  // Mini-app / frame notifications often have no user actor at all —
  // they come from the app itself. Use the app's name as the "who" so
  // the entry isn't shown as "Someone — mini-app". The frame object
  // is populated by the normalizer when the preview shape includes
  // any frame/miniApp/app metadata.
  if (n.frame?.name) return n.frame.name;
  return (
    n.actor?.displayName ??
    n.actor?.username ??
    (n.actor?.fid != null ? `fid:${n.actor.fid}` : 'Someone')
  );
}

function castSnippet(n: FarcasterNotification): string {
  const text = n.content?.cast?.text ?? '';
  return text.length > 140 ? text.slice(0, 140) + '…' : text;
}

function othersSuffix(total: number | undefined): string {
  if (!total || total <= 1) return '';
  const others = total - 1;
  return ` and ${others} other${others === 1 ? '' : 's'}`;
}

function reactionVerb(n: FarcasterNotification): string {
  // The /notifications-for-tab response carries `reaction.type` on each
  // preview item — usually "like". Default to "liked" when present;
  // reserve room for other reaction types Warpcast may add later.
  const t = n.reactionType?.toLowerCase();
  if (!t || t === 'like') return 'liked';
  return `reacted (${t}) to`;
}

function farcasterTitleAndBody(n: FarcasterNotification): { title: string; body?: string } {
  const who = actorName(n);
  const suffix = othersSuffix(n.totalItemCount);
  switch (n.type as FarcasterNotificationType) {
    case 'cast-reaction':
    case 'cast-like':
    case 'like':
      return {
        title: `${who}${suffix} ${reactionVerb(n)} your cast`,
        body: castSnippet(n) || undefined,
      };
    case 'cast-recast':
    case 'recast':
      return {
        title: `${who}${suffix} recasted your cast`,
        body: castSnippet(n) || undefined,
      };
    case 'cast-mention':
    case 'mention':
      return { title: `${who} mentioned you`, body: castSnippet(n) || undefined };
    case 'cast-reply':
    case 'reply':
      return { title: `${who} replied to your cast`, body: castSnippet(n) || undefined };
    case 'cast-quote':
    case 'quote':
      return { title: `${who} quoted your cast`, body: castSnippet(n) || undefined };
    case 'follow':
      return { title: `${who}${suffix} followed you` };
    default:
      // Mini-app / frame notifications carry a body from the app —
      // show it directly with the app name as the title. Avoids the
      // ugly "Someone • mini-app" fallback that comes from joining
      // the unresolved actor + raw type name.
      if (n.frame?.body) {
        return { title: who, body: n.frame.body };
      }
      // Other unknown types — best-effort generic title without the
      // raw type slug, which leaked Warpcast internals to the user.
      return { title: who, body: castSnippet(n) || undefined };
  }
}

function farcasterToUnified(n: FarcasterNotification): UnifiedNotification {
  const { title, body } = farcasterTitleAndBody(n);
  const cast = n.content?.cast;
  // Routing priority: a cast (the most specific deep-link target) wins
  // over a frame URL. Mini-app notifications typically have NO cast,
  // only a frame.targetUrl — those route to the in-app browser via a
  // `frame` link type.
  let link: UnifiedNotification['link'] | undefined;
  if (cast?.hash) {
    link = {
      type: 'cast',
      castHash: cast.hash,
      username: cast.author?.username ?? n.actor?.username,
    };
  } else if (n.frame?.targetUrl) {
    link = { type: 'frame', url: n.frame.targetUrl };
  }
  return {
    id: `fc:${n.id}`,
    source: 'farcaster',
    timestamp: n.timestamp,
    title,
    body,
    // Prefer the actor avatar; fall back to the frame's icon for
    // mini-app entries so the row has a recognizable affordance.
    actorAvatarUrl: n.actor?.pfp?.url ?? n.frame?.iconUrl,
    link,
    raw: { farcaster: n },
  };
}

function chatToUnified(e: NotificationLogEntry): UnifiedNotification {
  const data = e.data;
  const link: UnifiedNotification['link'] | undefined =
    data?.type === 'message'
      ? {
          type: 'message',
          spaceId: data.spaceId,
          channelId: data.channelId,
          conversationId: data.conversationId,
        }
      : undefined;
  return {
    id: `chat:${e.id}`,
    source: 'chat',
    timestamp: e.createdAt,
    title: e.title,
    body: e.body,
    link,
    raw: { chat: e },
  };
}

export interface UnifiedNotificationsResult {
  items: UnifiedNotification[];
  unreadCount: number;
  isLoading: boolean;
  isFetchingMore: boolean;
  hasMore: boolean;
  fetchMore: () => void;
  refetch: () => void;
  farcasterEnabled: boolean;
  /** Surfaces fetch errors to the screen so the user can see why the
   *  Farcaster portion of the feed is empty (auth expiry, 5xx, etc.)
   *  instead of being told there are no notifications. */
  farcasterError: Error | null;
}

export function useUnifiedNotifications(): UnifiedNotificationsResult {
  const { farcasterAuthToken } = useAuth();
  const { entries: chatEntries } = useNotificationLog();
  const farcasterQuery = useFarcasterNotifications(farcasterAuthToken ?? undefined);

  const farcasterItems = useMemo(
    () =>
      flattenFarcasterNotifications(farcasterQuery.data?.pages).filter(
        // Suppress notifications whose target/preview cast references
        // the hyrpia.xyz wallet-drainer scam — see scamFilter.ts.
        (n) => !isScamCast(n.content?.cast as unknown as Parameters<typeof isScamCast>[0]),
      ),
    [farcasterQuery.data?.pages],
  );

  const items = useMemo(() => {
    const merged: UnifiedNotification[] = [
      ...chatEntries.map(chatToUnified),
      ...farcasterItems.map(farcasterToUnified),
    ];
    merged.sort((a, b) => b.timestamp - a.timestamp);
    return merged;
  }, [chatEntries, farcasterItems]);

  const unreadCount = useMemo(() => {
    // Prefer the server's per-notification isUnread for Farcaster items
    // (it survives mark-all-read calls from the web client), fall back
    // to lastSeen for chat items where we don't have a server flag.
    const lastSeen = getLastSeenTimestamp();
    return items.reduce((n, e) => {
      if (e.source === 'farcaster') {
        const isUnread = e.raw?.farcaster?.isUnread;
        if (typeof isUnread === 'boolean') return isUnread ? n + 1 : n;
      }
      return e.timestamp > lastSeen ? n + 1 : n;
    }, 0);
  }, [items]);

  return {
    items,
    unreadCount,
    isLoading: farcasterQuery.isLoading,
    isFetchingMore: farcasterQuery.isFetchingNextPage,
    hasMore: !!farcasterQuery.hasNextPage,
    fetchMore: () => {
      if (farcasterQuery.hasNextPage && !farcasterQuery.isFetchingNextPage) {
        void farcasterQuery.fetchNextPage();
      }
    },
    refetch: () => {
      void farcasterQuery.refetch();
    },
    farcasterEnabled: !!farcasterAuthToken,
    farcasterError: (farcasterQuery.error as Error | null) ?? null,
  };
}
