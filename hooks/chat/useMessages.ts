/**
 * useMessages hook wrapper
 */

import {
  useMessages as useMessagesBase,
  flattenMessages,
  useInvalidateMessages,
} from '@quilibrium/quorum-shared';
import { useStorageAdapter } from '../../context/StorageContext';

export interface UseMessagesOptions {
  spaceId: string | undefined;
  channelId: string | undefined;
  enabled?: boolean;
  limit?: number;
}

export function useMessages({
  spaceId,
  channelId,
  enabled,
  limit,
}: UseMessagesOptions) {
  const storage = useStorageAdapter();
  return useMessagesBase({
    storage,
    spaceId,
    channelId,
    enabled,
    limit,
  });
}

export { flattenMessages, useInvalidateMessages };
