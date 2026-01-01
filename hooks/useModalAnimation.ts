import { useEffect, useRef, useCallback } from 'react';
import { Animated, Dimensions } from 'react-native';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface UseModalAnimationOptions {
  visible: boolean;
  onCloseComplete?: () => void;
}

interface UseModalAnimationReturn {
  slideAnim: Animated.Value;
  backdropAnim: Animated.Value;
  closeModal: () => void;
  snapBack: () => void;
}

const SPRING_CONFIG = {
  tension: 65,
  friction: 11,
  useNativeDriver: true,
};

const TIMING_DURATION = {
  open: 300,
  close: 200,
};

/**
 * Hook to manage modal slide and backdrop animations.
 * Provides consistent animation behavior for all bottom sheet modals.
 */
export function useModalAnimation({
  visible,
  onCloseComplete,
}: UseModalAnimationOptions): UseModalAnimationReturn {
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;

  // Handle visibility changes
  useEffect(() => {
    if (visible) {
      // Open animation
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          ...SPRING_CONFIG,
        }),
        Animated.timing(backdropAnim, {
          toValue: 1,
          duration: TIMING_DURATION.open,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      // Close animation
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: SCREEN_HEIGHT,
          ...SPRING_CONFIG,
        }),
        Animated.timing(backdropAnim, {
          toValue: 0,
          duration: TIMING_DURATION.open,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, slideAnim, backdropAnim]);

  // Close modal with animation (used by pan responder)
  const closeModal = useCallback(() => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: SCREEN_HEIGHT,
        duration: TIMING_DURATION.close,
        useNativeDriver: true,
      }),
      Animated.timing(backdropAnim, {
        toValue: 0,
        duration: TIMING_DURATION.close,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onCloseComplete?.();
    });
  }, [slideAnim, backdropAnim, onCloseComplete]);

  // Snap back to open position (used when swipe doesn't meet threshold)
  const snapBack = useCallback(() => {
    Animated.spring(slideAnim, {
      toValue: 0,
      ...SPRING_CONFIG,
    }).start();
  }, [slideAnim]);

  return {
    slideAnim,
    backdropAnim,
    closeModal,
    snapBack,
  };
}

export { SCREEN_HEIGHT };
