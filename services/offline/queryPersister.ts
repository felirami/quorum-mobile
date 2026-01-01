import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { mmkvStorage } from './storage';

/**
 * Persister for React Query that uses MMKV storage.
 * Syncs query cache to device storage for offline access.
 */
export const queryPersister = createSyncStoragePersister({
  storage: mmkvStorage,
  key: 'REACT_QUERY_OFFLINE_CACHE',
});

export default queryPersister;
