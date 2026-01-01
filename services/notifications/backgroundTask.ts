/**
 * Background Task Registration for message fetching
 *
 * This file MUST be imported at app startup (before any React components)
 * to register the background task with the native module.
 */

import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import { logger } from '@quilibrium/quorum-shared';
import { checkForNewMessages } from './BackgroundMessageService';

export const BACKGROUND_MESSAGE_TASK = 'background-message-fetch';

// Minimum interval in seconds (15 minutes is the iOS minimum)
export const BACKGROUND_FETCH_INTERVAL = 15 * 60;

/**
 * Define the background task
 * This must be called at module load time (outside of any component)
 */
TaskManager.defineTask(BACKGROUND_MESSAGE_TASK, async () => {
  const startTime = Date.now();
  logger.log('[BackgroundTask] Starting background message fetch');

  try {
    const result = await checkForNewMessages();

    const duration = Date.now() - startTime;
    logger.log(`[BackgroundTask] Completed in ${duration}ms, found ${result.newMessageCount} new messages`);

    if (result.newMessageCount > 0) {
      return BackgroundFetch.BackgroundFetchResult.NewData;
    }

    return BackgroundFetch.BackgroundFetchResult.NoData;
  } catch (error) {
    logger.log('[BackgroundTask] Error:', error);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

/**
 * Register the background fetch task with the OS
 */
export async function registerBackgroundFetch(): Promise<boolean> {
  try {
    // Check if already registered
    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_MESSAGE_TASK);

    if (isRegistered) {
      logger.log('[BackgroundTask] Task already registered');
      return true;
    }

    // Register the background fetch task
    await BackgroundFetch.registerTaskAsync(BACKGROUND_MESSAGE_TASK, {
      minimumInterval: BACKGROUND_FETCH_INTERVAL,
      stopOnTerminate: false, // Android: continue after app is killed
      startOnBoot: true, // Android: start after device reboot
    });

    logger.log('[BackgroundTask] Task registered successfully');
    return true;
  } catch (error) {
    logger.log('[BackgroundTask] Registration failed:', error);
    return false;
  }
}

/**
 * Unregister the background fetch task
 */
export async function unregisterBackgroundFetch(): Promise<void> {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_MESSAGE_TASK);

    if (isRegistered) {
      await BackgroundFetch.unregisterTaskAsync(BACKGROUND_MESSAGE_TASK);
      logger.log('[BackgroundTask] Task unregistered');
    }
  } catch (error) {
    logger.log('[BackgroundTask] Unregistration failed:', error);
  }
}

/**
 * Get the current status of background fetch
 */
export async function getBackgroundFetchStatus(): Promise<BackgroundFetch.BackgroundFetchStatus | null> {
  return BackgroundFetch.getStatusAsync();
}

/**
 * Check if background fetch is available on this device
 */
export async function isBackgroundFetchAvailable(): Promise<boolean> {
  const status = await getBackgroundFetchStatus();
  return status === BackgroundFetch.BackgroundFetchStatus.Available;
}
