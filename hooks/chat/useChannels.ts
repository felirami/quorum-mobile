/**
 * useChannels hook wrapper
 */

import { useChannels as useChannelsBase, flattenChannels, findChannel } from '@quilibrium/quorum-shared';
import { useStorageAdapter } from '../../context/StorageContext';

export function useChannels(spaceId: string | undefined, options?: { enabled?: boolean }) {
  const storage = useStorageAdapter();
  return useChannelsBase({
    storage,
    spaceId,
    enabled: options?.enabled,
  });
}

export { flattenChannels, findChannel };
