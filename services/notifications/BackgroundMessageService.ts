/**
 * BackgroundMessageService - Checks for new messages in background
 *
 * This service is designed to run in background fetch tasks.
 * It creates a brief WebSocket connection to check for pending messages
 * and shows local notifications for any new messages found.
 *
 * Limitations:
 * - Background execution time is limited (~30 seconds on iOS)
 * - We don't process/decrypt messages fully, just check for presence
 * - Full message handling happens when app opens
 */

import { logger } from '@quilibrium/quorum-shared';
import { getDeviceKeyset } from '../onboarding/secureStorage';
import { getInboxAddress } from '../onboarding/secureStorage';
import { getAllSpaceInboxAddresses } from '../config/spaceStorage';
import { encryptionStateStorage } from '../crypto/encryption-state-storage';
import { showMessageNotification } from './NotificationService';

// API Configuration
const API_CONFIG = {
  wsUrl: 'wss://api.quorummessenger.com/ws',
};

// Timeout for background WebSocket connection (keep short for background execution limits)
const BACKGROUND_WS_TIMEOUT = 15000; // 15 seconds

export interface BackgroundCheckResult {
  newMessageCount: number;
  success: boolean;
  error?: string;
}

/**
 * Check for new messages in background
 * Creates a brief WebSocket connection to receive pending messages
 */
export async function checkForNewMessages(): Promise<BackgroundCheckResult> {
  logger.log('[BackgroundMessage] Starting background message check');

  try {
    // 1. Get device keyset - if not authenticated, skip
    const deviceKeyset = await getDeviceKeyset();
    if (!deviceKeyset) {
      logger.log('[BackgroundMessage] No device keyset found, user not authenticated');
      return { newMessageCount: 0, success: true };
    }

    // 2. Collect all inbox addresses to check
    const inboxAddresses = await collectInboxAddresses();
    if (inboxAddresses.length === 0) {
      logger.log('[BackgroundMessage] No inbox addresses to check');
      return { newMessageCount: 0, success: true };
    }

    logger.log(`[BackgroundMessage] Checking ${inboxAddresses.length} inbox addresses`);

    // 3. Create a brief WebSocket connection to check for messages
    const result = await checkInboxesViaWebSocket(inboxAddresses);

    return result;
  } catch (error) {
    logger.log('[BackgroundMessage] Error during background check:', error);
    return {
      newMessageCount: 0,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Collect all inbox addresses the user should receive messages on
 */
async function collectInboxAddresses(): Promise<string[]> {
  const addresses: string[] = [];

  // 1. User's device inbox
  const deviceInboxAddress = await getInboxAddress();
  if (deviceInboxAddress) {
    addresses.push(deviceInboxAddress);
  }

  // 2. Space inbox addresses
  const spaceInboxAddresses = getAllSpaceInboxAddresses();
  addresses.push(...spaceInboxAddresses);

  // 3. Conversation inbox addresses (created when we initiate conversations)
  const conversationInboxAddresses = encryptionStateStorage.getAllConversationInboxAddresses();
  addresses.push(...conversationInboxAddresses);

  // Deduplicate
  return [...new Set(addresses)];
}

/**
 * Create a brief WebSocket connection to check for pending messages
 * Returns quickly after receiving any messages or timeout
 */
async function checkInboxesViaWebSocket(
  inboxAddresses: string[]
): Promise<BackgroundCheckResult> {
  return new Promise((resolve) => {
    let messageCount = 0;
    let resolved = false;
    let ws: WebSocket | null = null;

    const cleanup = () => {
      if (ws) {
        try {
          ws.close();
        } catch {
          // Ignore close errors
        }
        ws = null;
      }
    };

    const finalize = (success: boolean, error?: string) => {
      if (resolved) return;
      resolved = true;
      cleanup();
      resolve({ newMessageCount: messageCount, success, error });
    };

    // Set timeout for background execution limits
    const timeoutId = setTimeout(() => {
      logger.log('[BackgroundMessage] WebSocket check timed out');
      finalize(true); // Timeout is success - we tried
    }, BACKGROUND_WS_TIMEOUT);

    try {
      ws = new WebSocket(API_CONFIG.wsUrl);

      ws.onopen = () => {
        logger.log('[BackgroundMessage] WebSocket connected, subscribing to inboxes');

        // Send listen message
        const listenMessage = JSON.stringify({
          type: 'listen',
          inbox_addresses: inboxAddresses,
        });

        ws?.send(listenMessage);

        // Give some time to receive queued messages, then close
        // Messages are delivered immediately on subscribe if pending
        setTimeout(() => {
          if (!resolved) {
            logger.log('[BackgroundMessage] Closing after subscribe window');
            finalize(true);
          }
        }, 5000); // 5 seconds to receive pending messages
      };

      ws.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data as string);

          // Check if this is an encrypted message
          if (data.type === 'message' && data.encrypted_content) {
            messageCount++;
            logger.log(`[BackgroundMessage] Received message #${messageCount}`);

            // Show a notification for the new message
            // Note: In background, we can't fully decrypt - just show generic notification
            if (messageCount === 1) {
              // Only show one notification for batch
              await showMessageNotification({
                title: 'New Message',
                body: 'You have new messages waiting',
                data: {
                  type: 'message',
                  messageId: `bg-${Date.now()}`,
                },
              });
            }
          }
        } catch (error) {
          logger.log('[BackgroundMessage] Error parsing message:', error);
        }
      };

      ws.onerror = (error) => {
        logger.log('[BackgroundMessage] WebSocket error:', error);
        clearTimeout(timeoutId);
        finalize(false, 'WebSocket error');
      };

      ws.onclose = () => {
        logger.log('[BackgroundMessage] WebSocket closed');
        clearTimeout(timeoutId);
        if (!resolved) {
          finalize(true);
        }
      };
    } catch (error) {
      clearTimeout(timeoutId);
      finalize(false, error instanceof Error ? error.message : 'Connection failed');
    }
  });
}

/**
 * Check if background message checking is enabled
 * Users can disable this in settings
 */
export async function isBackgroundCheckEnabled(): Promise<boolean> {
  // For now, always enabled if user is authenticated
  // Could add a settings toggle in the future
  const deviceKeyset = await getDeviceKeyset();
  return deviceKeyset !== null;
}

/**
 * Get the last time background check was performed
 * Useful for debugging and status display
 */
let lastCheckTime: number | null = null;

export function getLastBackgroundCheckTime(): number | null {
  return lastCheckTime;
}

export function setLastBackgroundCheckTime(time: number): void {
  lastCheckTime = time;
}
