/**
 * NotificationService - Handles local notifications for Quorum
 */

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import { logger } from '@quilibrium/quorum-shared';

// Configure how notifications should be handled when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export interface MessageNotificationData {
  type: 'message';
  conversationId?: string;
  spaceId?: string;
  channelId?: string;
  messageId: string;
}

export interface NotificationContent {
  title: string;
  body: string;
  data?: MessageNotificationData;
}

/**
 * Request notification permissions from the user
 */
export async function requestNotificationPermissions(): Promise<boolean> {
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();

    if (existingStatus === 'granted') {
      logger.log('[NotificationService] Permissions already granted');
      return true;
    }

    const { status } = await Notifications.requestPermissionsAsync();
    const granted = status === 'granted';

    logger.log('[NotificationService] Permission request result:', status);
    return granted;
  } catch (error) {
    logger.log('[NotificationService] Error requesting permissions:', error);
    return false;
  }
}

/**
 * Set up Android notification channel
 */
export async function setupNotificationChannel(): Promise<void> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('messages', {
      name: 'Messages',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#7C3AED', // Purple accent
      sound: 'default',
      enableVibrate: true,
      showBadge: true,
    });

    logger.log('[NotificationService] Android notification channel created');
  }
}

/**
 * Show a local notification for a new message
 */
export async function showMessageNotification(
  content: NotificationContent
): Promise<string | undefined> {
  try {
    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: content.title,
        body: content.body,
        data: content.data as unknown as Record<string, unknown>,
        sound: 'default',
        ...(Platform.OS === 'android' && { channelId: 'messages' }),
      },
      trigger: null, // Show immediately
    });

    logger.log('[NotificationService] Notification scheduled:', notificationId);
    return notificationId;
  } catch (error) {
    logger.log('[NotificationService] Error showing notification:', error);
    return undefined;
  }
}

/**
 * Handle notification tap - navigate to the appropriate screen
 */
export function handleNotificationTap(
  response: Notifications.NotificationResponse
): void {
  const rawData = response.notification.request.content.data;
  const data = rawData as unknown as MessageNotificationData | undefined;

  if (!data) {
    logger.log('[NotificationService] No data in notification');
    return;
  }

  logger.log('[NotificationService] Handling notification tap:', data);

  if (data.type === 'message') {
    // Navigate to home - the app will handle showing the appropriate conversation
    // based on the params. Deep linking to specific conversations can be added later.
    router.push('/');
  }
}

/**
 * Set up notification response listener (for handling taps)
 */
export function setupNotificationResponseListener(): Notifications.Subscription {
  return Notifications.addNotificationResponseReceivedListener(handleNotificationTap);
}

/**
 * Set up notification received listener (for foreground notifications)
 */
export function setupNotificationReceivedListener(
  callback?: (notification: Notifications.Notification) => void
): Notifications.Subscription {
  return Notifications.addNotificationReceivedListener((notification) => {
    logger.log('[NotificationService] Notification received in foreground:', notification);
    callback?.(notification);
  });
}

/**
 * Get the current badge count
 */
export async function getBadgeCount(): Promise<number> {
  return Notifications.getBadgeCountAsync();
}

/**
 * Set the badge count
 */
export async function setBadgeCount(count: number): Promise<void> {
  await Notifications.setBadgeCountAsync(count);
}

/**
 * Clear all notifications
 */
export async function clearAllNotifications(): Promise<void> {
  await Notifications.dismissAllNotificationsAsync();
  await setBadgeCount(0);
}

/**
 * Initialize the notification service
 */
export async function initializeNotifications(): Promise<boolean> {
  try {
    // Set up Android channel first
    await setupNotificationChannel();

    // Request permissions
    const granted = await requestNotificationPermissions();

    if (!granted) {
      logger.log('[NotificationService] Notifications not permitted');
      return false;
    }

    logger.log('[NotificationService] Initialized successfully');
    return true;
  } catch (error) {
    logger.log('[NotificationService] Initialization error:', error);
    return false;
  }
}
