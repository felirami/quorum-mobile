import * as Updates from 'expo-updates';
import { useCallback, useEffect, useState } from 'react';

interface OTAUpdateState {
  isUpdateAvailable: boolean;
  isDownloading: boolean;
  isRestarting: boolean;
  error: Error | null;
}

export function useOTAUpdate() {
  const [state, setState] = useState<OTAUpdateState>({
    isUpdateAvailable: false,
    isDownloading: false,
    isRestarting: false,
    error: null,
  });

  const checkForUpdate = useCallback(async () => {
    if (__DEV__) {
      return;
    }

    try {
      const update = await Updates.checkForUpdateAsync();
      setState(prev => ({
        ...prev,
        isUpdateAvailable: update.isAvailable,
        error: null,
      }));
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error : new Error('Failed to check for updates'),
      }));
    }
  }, []);

  const downloadAndInstall = useCallback(async () => {
    if (__DEV__) {
      return;
    }

    setState(prev => ({ ...prev, isDownloading: true, error: null }));

    try {
      const result = await Updates.fetchUpdateAsync();
      if (result.isNew) {
        setState(prev => ({ ...prev, isDownloading: false, isRestarting: true }));
        await Updates.reloadAsync();
      } else {
        setState(prev => ({
          ...prev,
          isDownloading: false,
          isUpdateAvailable: false,
        }));
      }
    } catch (error) {
      setState(prev => ({
        ...prev,
        isDownloading: false,
        error: error instanceof Error ? error : new Error('Failed to download update'),
      }));
    }
  }, []);

  useEffect(() => {
    checkForUpdate();
  }, [checkForUpdate]);

  return {
    ...state,
    checkForUpdate,
    downloadAndInstall,
  };
}
