import { useRef, useMemo } from 'react';
import { PanResponder, Animated, PanResponderGestureState } from 'react-native';

interface UsePanResponderOptions {
  slideAnim: Animated.Value;
  onDismiss: () => void;
  onSnapBack: () => void;
}

interface UsePanResponderReturn {
  panHandlers: ReturnType<typeof PanResponder.create>['panHandlers'];
}

// Gesture thresholds
const SWIPE_START_THRESHOLD = 10; // dy > 10 to start recognizing
const DISMISS_DISTANCE_THRESHOLD = 100; // dy > 100 to dismiss
const DISMISS_VELOCITY_THRESHOLD = 0.5; // vy > 0.5 to dismiss

/**
 * Hook to handle swipe-to-dismiss gesture for modals.
 * Returns pan handlers to spread onto the modal content container.
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

      // Only respond to downward swipes past threshold
      onMoveShouldSetPanResponder: (_, gestureState: PanResponderGestureState) => {
        return gestureState.dy > SWIPE_START_THRESHOLD;
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
};
