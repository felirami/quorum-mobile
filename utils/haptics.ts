/**
 * Centralized haptic helpers.
 *
 * Uses expo-haptics underneath. No-ops on web. Each helper maps to a
 * semantic action so the call sites read cleanly (`haptics.success()` vs
 * `Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)`).
 *
 * Keep these fire-and-forget — we never await them.
 */

import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

const enabled = Platform.OS === 'ios' || Platform.OS === 'android';

function safe(fn: () => Promise<unknown>): void {
  if (!enabled) return;
  try {
    // Fire and forget
    void fn().catch(() => {});
  } catch {
    // Ignore
  }
}

export const haptics = {
  /** Subtle tap for lightweight selections (picker changes, toggles). */
  selection() {
    safe(() => Haptics.selectionAsync());
  },
  /** Light impact — e.g. button press, tapping an item. */
  light() {
    safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
  },
  /** Medium impact — e.g. significant action committed (send message). */
  medium() {
    safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
  },
  /** Heavy impact — e.g. irreversible destructive action confirmed. */
  heavy() {
    safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy));
  },
  /** Success notification feedback — e.g. message sent, join succeeded. */
  success() {
    safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
  },
  /** Warning feedback — e.g. non-fatal issue. */
  warning() {
    safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
  },
  /** Error feedback — e.g. failed operation. */
  error() {
    safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
  },
};

export default haptics;
