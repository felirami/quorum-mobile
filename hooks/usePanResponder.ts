import { useRef, useMemo } from 'react';
import { PanResponder, Animated, PanResponderGestureState, GestureResponderEvent } from 'react-native';

interface UsePanResponderOptions {
  slideAnim: Animated.Value;
  onDismiss: () => void;
  onSnapBack: () => void;
}

interface UsePanResponderReturn {
  panHandlers: ReturnType<typeof PanResponder.create>['panHandlers'];
}

// Gesture thresholds - tuned to avoid accidental dismissal while scrolling or interacting with charts
// Also tuned to allow pull-to-refresh to work without triggering dismiss
const SWIPE_START_THRESHOLD = 120; // dy > 120 to start recognizing (allows RefreshControl space)
const DISMISS_DISTANCE_THRESHOLD = 200; // dy > 200 to dismiss
const DISMISS_VELOCITY_THRESHOLD = 2.5; // vy > 2.5 to dismiss (fast swipe)
const HORIZONTAL_LOCK_THRESHOLD = 15; // If dx > 15 before dy > threshold, don't capture

/**
 * Hook to handle swipe-to-dismiss gesture for modals.
 * Returns pan handlers to spread onto the modal content container.
 *
 * To avoid conflicts with ScrollView, we require:
 * - Larger initial movement threshold (30px vs 10px)
 * - Vertical movement must be dominant (more than horizontal)
 * - Higher velocity threshold for quick dismissal
 */
export function usePanResponder({
  slideAnim,
  onDismiss,
  onSnapBack,
}: UsePanResponderOptions): UsePanResponderReturn {
  const panResponder = useRef(
    PanResponder.create({
      // Don't capture on initial touch
      onStartShouldSetPanResponder: () => false,

      // Only respond to clearly vertical downward swipes
      onMoveShouldSetPanResponder: (_, gestureState: PanResponderGestureState) => {
        const { dy, dx } = gestureState;

        // Must be a significant downward movement
        if (dy <= SWIPE_START_THRESHOLD) {
          return false;
        }

        // Must be more vertical than horizontal to avoid capturing horizontal scrolls
        if (Math.abs(dx) > HORIZONTAL_LOCK_THRESHOLD && Math.abs(dx) > dy * 0.5) {
          return false;
        }

        return true;
      },

      // Track finger movement
      onPanResponderMove: (_, gestureState: PanResponderGestureState) => {
        // Only allow downward movement (positive dy)
        if (gestureState.dy > 0) {
          slideAnim.setValue(gestureState.dy);
        }
      },

      // Handle release - dismiss or snap back
      onPanResponderRelease: (_, gestureState: PanResponderGestureState) => {
        const shouldDismiss =
          gestureState.dy > DISMISS_DISTANCE_THRESHOLD ||
          gestureState.vy > DISMISS_VELOCITY_THRESHOLD;

        if (shouldDismiss) {
          onDismiss();
        } else {
          onSnapBack();
        }
      },
    })
  ).current;

  return {
    panHandlers: panResponder.panHandlers,
  };
}

export {
  SWIPE_START_THRESHOLD,
  DISMISS_DISTANCE_THRESHOLD,
  DISMISS_VELOCITY_THRESHOLD,
  HORIZONTAL_LOCK_THRESHOLD,
};
