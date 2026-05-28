/**
 * Shared query cache types for React Query infinite message data
 *
 * These types describe the shape of infinite query caches used across
 * DM hooks and the WebSocket context for optimistic updates.
 */

import type { Message } from '@quilibrium/quorum-shared';

/** A single page of messages in an infinite query */
export interface MessagesPage {
  messages: Message[];
  nextCursor?: string | number | null;
  prevCursor?: string | number | null;
}

/** The full infinite query data structure for messages */
export interface InfiniteMessagesData {
  pages: MessagesPage[];
  pageParams: unknown[];
}
