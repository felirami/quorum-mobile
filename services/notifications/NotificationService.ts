/**
 * NotificationService - Handles local notifications for Quorum
 */

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import { appendNotificationLog } from './notificationLog';
import { shouldNotifyForContext } from './notificationPrefs';

// Wake-type strings sent by the server for silent / generic-body pushes.
// In foreground these are redundant (the websocket has already delivered
// the real message and showMessageNotification posted a real banner), so
// we suppress them. Anything else falls through to the normal display.
const WAKE_PUSH_TYPES = new Set(['hub-log', 'inbox', 'farcaster']);

Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = notification.request.content.data as { type?: string } | undefined;
    if (data?.type && WAKE_PUSH_TYPES.has(data.type)) {
      return {
        shouldShowAlert: false,
        shouldPlaySound: false,
        shouldSetBadge: false,
        shouldShowBanner: false,
        shouldShowList: false,
      };
    }
    return {
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    };
  },
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
      return true;
    }

    const { status } = await Notifications.requestPermissionsAsync();
    const granted = status === 'granted';

    return granted;
  } catch (error) {
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
  }
}

/**
 * Show a local notification for a new message.
 *
 * Gated on the user's notification preferences — if the global toggle
 * is off, or this space/channel has been muted, no notification is
 * scheduled. Returns undefined in that case. Callers should not rely
 * on the return value to know whether the notification was shown.
 */
export async function showMessageNotification(
  content: NotificationContent
): Promise<string | undefined> {
  // Respect the user's prefs BEFORE we touch the OS scheduler. The
  // server may still be sending us pushes (the token unregister is
  // best-effort and racy); this is the client-side guard.
  if (!shouldNotifyForContext({
    spaceId: content.data?.spaceId,
    channelId: content.data?.channelId,
  })) {
    return undefined;
  }
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

    // Mirror to the in-app log so the notification center tab can replay
    // history. The OS tray clears on user dismiss; this log persists.
    appendNotificationLog({
      id: notificationId ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: content.title,
      body: content.body,
      data: content.data,
    });

    return notificationId;
  } catch (error) {
    return undefined;
  }
}

/**
 * Handle notification tap — deep-link to the right surface based on the
 * push `data.type`. The catalog of address → resource lives in the same
 * MMKV stores the app already uses; the NSE writes a shared snapshot
 * for lock-screen rewrites but the tap path doesn't need that — we're
 * in the main app JS context and have direct storage access.
 */
export function handleNotificationTap(
  response: Notifications.NotificationResponse
): void {
  const rawData = response.notification.request.content.data;
  const data = rawData as unknown as
    | { type?: string; inbox_address?: string; hub_address?: string }
    | undefined;
  if (!data?.type) {
    return;
  }

  // Imported inline to avoid pulling chat-storage code into modules
  // that only need the foreground display handler. Wrapped because a
  // bundler hiccup on either platform shouldn't crash on tap — at
  // worst we fall through to a generic route.

  let getAllSpaces: () => { spaceId: string; hubAddress?: string }[];

  let getSpaceKey: (spaceId: string, keyId: string) => { address?: string } | null;

  let encryptionStateStorage: {
    getConversationInboxKeypairByAddress: (
      addr: string,
    ) => { conversationId?: string } | null;
  };
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const spaceMod = require('@/services/config/spaceStorage');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const cryptoMod = require('@/services/crypto/encryption-state-storage');
    getAllSpaces = spaceMod.getAllSpaces;
    getSpaceKey = spaceMod.getSpaceKey;
    encryptionStateStorage = cryptoMod.encryptionStateStorage;
  } catch {
    router.push('/');
    return;
  }

  switch (data.type) {
    case 'inbox': {
      // DM: resolve inbox_address -> conversationId via the per-DM
      // inbox keypair record. Same lookup path the chat surface uses.
      if (!data.inbox_address) {
        router.push('/(tabs)/messages');
        return;
      }
      const kp = encryptionStateStorage.getConversationInboxKeypairByAddress(
        data.inbox_address
      );
      if (kp?.conversationId) {
        router.push(`/(tabs)/messages/dm/${kp.conversationId}`);
      } else {
        router.push('/(tabs)/messages');
      }
      return;
    }
    case 'hub-log': {
      // Space: resolve hub_address -> spaceId by scanning known spaces.
      if (!data.hub_address) {
        router.push('/(tabs)/spaces');
        return;
      }
      const space = getAllSpaces().find(
        (s: { hubAddress?: string; spaceId: string }) =>
          s.hubAddress === data.hub_address
      );
      const spaceId =
        space?.spaceId ??
        (getAllSpaces() as { spaceId: string }[]).find(
          (s) => getSpaceKey(s.spaceId, 'hub')?.address === data.hub_address
        )?.spaceId;
      if (spaceId) {
        router.push(`/(tabs)/spaces/${spaceId}`);
      } else {
        router.push('/(tabs)/spaces');
      }
      return;
    }
    case 'farcaster':
      // Farcaster activity lands in the unified notifications view,
      // which is the default profile-tab landing.
      router.push('/(tabs)/profile');
      return;
    default:
      // Legacy / chat-driven local notifications used `type: 'message'`.
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
      return false;
    }

    return true;
  } catch (error) {
    return false;
  }
}
