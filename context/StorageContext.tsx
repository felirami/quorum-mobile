/**
 * StorageContext - Provides StorageAdapter to the app
 */

import React, { createContext, useContext, useMemo } from 'react';
import type { StorageAdapter } from '@quilibrium/quorum-shared';
import { MMKVAdapter } from '../services/storage/mmkvAdapter';

const StorageContext = createContext<StorageAdapter | null>(null);

interface StorageProviderProps {
  children: React.ReactNode;
}

export function StorageProvider({ children }: StorageProviderProps) {
  const adapter = useMemo(() => new MMKVAdapter(), []);

  return (
    <StorageContext.Provider value={adapter}>
      {children}
    </StorageContext.Provider>
  );
}

export function useStorageAdapter(): StorageAdapter {
  const adapter = useContext(StorageContext);
  if (!adapter) {
    throw new Error('useStorageAdapter must be used within a StorageProvider');
  }
  return adapter;
}

export default StorageContext;
