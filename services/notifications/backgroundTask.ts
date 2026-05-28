/**
 * Background Task Registration for message fetching
 *
 * This file MUST be imported at app startup (before any React components)
 * to register the background task with the native module.
 *
 * Uses expo-background-task (replacement for deprecated expo-background-fetch)
 * which leverages WorkManager on Android and BGTaskScheduler on iOS.
 */

import * as TaskManager from 'expo-task-manager';
import * as BackgroundTask from 'expo-background-task';
import * as Device from 'expo-device';
import { checkForNewMessages } from './BackgroundMessageService';

export const BACKGROUND_MESSAGE_TASK = 'background-message-fetch';

// Minimum interval. expo-background-task's `minimumInterval` option is
// interpreted as MINUTES on both platforms (intervalSeconds in the iOS
// scheduler is computed as `minutes * 60`; the Android scheduler uses
// `Duration.ofMinutes(...)`), despite the name. Passing 900 here would
// schedule the task no more often than every 900 minutes (15 hours), not
// 900 seconds. 15 is the documented OS-level floor on both platforms.
export const BACKGROUND_FETCH_INTERVAL_MINUTES = 15;

/**
 * Define the background task
 * This must be called at module load time (outside of any component) AND
 * before expo-router/entry imports the route tree, otherwise the OS may
 * dispatch the task before the handler is registered. See index.js — this
 * file is required there, before `expo-router/entry`.
 * Guarded to prevent re-registration during Fast Refresh.
 */
let taskDefined = false;
if (!taskDefined) {
  taskDefined = true;
  TaskManager.defineTask(BACKGROUND_MESSAGE_TASK, async () => {
    try {
      await checkForNewMessages();
      return BackgroundTask.BackgroundTaskResult.Success;
    } catch (error) {
      return BackgroundTask.BackgroundTaskResult.Failed;
    }
  });
}

/**
 * Register the background task with the OS
 */
export async function registerBackgroundFetch(): Promise<boolean> {
  try {
    // Background tasks are not available on simulators/emulators
    if (!Device.isDevice) {
      return false;
    }

    // Check if already registered
    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_MESSAGE_TASK);

    if (isRegistered) {
      return true;
    }

    // Check if background task is available
    const status = await BackgroundTask.getStatusAsync();

    if (status !== BackgroundTask.BackgroundTaskStatus.Available) {
      return false;
    }

    // Register the background task
    await BackgroundTask.registerTaskAsync(BACKGROUND_MESSAGE_TASK, {
      minimumInterval: BACKGROUND_FETCH_INTERVAL_MINUTES,
    });

    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Unregister the background task
 */
export async function unregisterBackgroundFetch(): Promise<void> {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_MESSAGE_TASK);

    if (isRegistered) {
      await BackgroundTask.unregisterTaskAsync(BACKGROUND_MESSAGE_TASK);
    }
  } catch (error) {
    // Ignore unregister errors
  }
}

/**
 * Get the current status of background task
 */
export async function getBackgroundFetchStatus(): Promise<BackgroundTask.BackgroundTaskStatus | null> {
  return BackgroundTask.getStatusAsync();
}

/**
 * Check if background task is available on this device
 */
export async function isBackgroundFetchAvailable(): Promise<boolean> {
  const status = await getBackgroundFetchStatus();
  return status === BackgroundTask.BackgroundTaskStatus.Available;
}
