/**
 * StorageContext - Provides StorageAdapter to the app
 */

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { StorageAdapter } from '@quilibrium/quorum-shared';
import { logger } from '@quilibrium/quorum-shared';import { MMKVAdapter } from '../services/storage/mmkvAdapter';
import { isMigrationPending } from '../services/storage/messagesDb';
import { MigrationModal } from '../components/MigrationModal';

const StorageContext = createContext<StorageAdapter | null>(null);

interface StorageProviderProps {
  children: React.ReactNode;
}

export function StorageProvider({ children }: StorageProviderProps) {
  const adapter = useMemo(() => new MMKVAdapter(), []);

  // Drives the modal overlay below. Read synchronously on mount so the
  // modal renders BEFORE adapter.init() (and thus the sync MMKV→SQLite
  // copy) starts blocking the JS thread. If the modal painted after,
  // the user would see a long unexplained UI freeze.
  const [migrating, setMigrating] = useState(() => isMigrationPending());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (migrating) {
        // Yield once so the modal we just declared in JSX actually
        // commits to native UI before init's sync work locks the JS
        // thread. requestAnimationFrame is the right primitive — it
        // resolves after the next React commit + paint, which is
        // exactly when the modal becomes visible.
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      }
      try {
        await adapter.init();
      } catch (err) {
        logger.warn('[StorageProvider] adapter.init() failed:', err);
      } finally {
        if (!cancelled) setMigrating(false);
      }
    })();
    return () => { cancelled = true; };
    // Intentionally only depends on adapter — `migrating` is consumed
    // at effect-start and shouldn't re-trigger the effect when it flips.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adapter]);

  return (
    <StorageContext.Provider value={adapter}>
      {children}
      <MigrationModal visible={migrating} />
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
