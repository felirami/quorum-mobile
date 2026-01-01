import { useCallback, useState } from 'react';
import { Dimensions } from 'react-native';
import { Gesture, GestureType } from 'react-native-gesture-handler';
import { runOnJS, SharedValue, useSharedValue, withSpring, useAnimatedStyle } from 'react-native-reanimated';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SERVER_SIDEBAR_WIDTH = 64;
const CHANNELS_SIDEBAR_WIDTH = 240;
const CLOSED_POSITION = -(SERVER_SIDEBAR_WIDTH + CHANNELS_SIDEBAR_WIDTH);

const springConfig = { damping: 20, stiffness: 200 };

export interface UseSidebarGestureReturn {
  translateX: SharedValue<number>;
  sidebarsVisible: boolean;
  showSidebars: () => void;
  hideSidebars: () => void;
  toggleSidebars: () => void;
  panGesture: GestureType;
  sidebarAnimatedStyle: ReturnType<typeof useAnimatedStyle>;
  chatAnimatedStyle: ReturnType<typeof useAnimatedStyle>;
}

/**
 * Hook for managing sidebar swipe gestures and animations.
 * Handles showing/hiding sidebars with spring animations.
 */
export function useSidebarGesture(): UseSidebarGestureReturn {
  const [sidebarsVisible, setSidebarsVisible] = useState(true);
  const translateX = useSharedValue(0);
  const isVisible = useSharedValue(1); // 1 = visible, 0 = hidden

  const showSidebars = useCallback(() => {
    setSidebarsVisible(true);
    isVisible.value = 1;
    translateX.value = withSpring(0, springConfig);
  }, [translateX, isVisible]);

  const hideSidebars = useCallback(() => {
    setSidebarsVisible(false);
    isVisible.value = 0;
    translateX.value = withSpring(CLOSED_POSITION, springConfig);
  }, [translateX, isVisible]);

  const toggleSidebars = useCallback(() => {
    if (sidebarsVisible) {
      hideSidebars();
    } else {
      showSidebars();
    }
  }, [sidebarsVisible, hideSidebars, showSidebars]);

  const sidebarAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const chatAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const panGesture = Gesture.Pan()
    .activeOffsetX([-8, 8])
    .failOffsetY([-8, 8])
    .onUpdate((event) => {
      'worklet';
      if (isVisible.value === 0 && event.translationX > 0) {
        // Swiping right to show sidebars
        translateX.value = CLOSED_POSITION + event.translationX;
      } else if (isVisible.value === 1 && event.translationX < 0) {
        // Swiping left to hide sidebars
        translateX.value = event.translationX;
      }
    })
    .onEnd((event) => {
      'worklet';
      if (isVisible.value === 0 && event.translationX > 50) {
        translateX.value = withSpring(0, springConfig);
        isVisible.value = 1;
        runOnJS(setSidebarsVisible)(true);
      } else if (isVisible.value === 1 && event.translationX < -50) {
        translateX.value = withSpring(CLOSED_POSITION, springConfig);
        isVisible.value = 0;
        runOnJS(setSidebarsVisible)(false);
      } else {
        // Reset position
        const toValue = isVisible.value === 1 ? 0 : CLOSED_POSITION;
        translateX.value = withSpring(toValue, springConfig);
      }
    });

  return {
    translateX,
    sidebarsVisible,
    showSidebars,
    hideSidebars,
    toggleSidebars,
    panGesture,
    sidebarAnimatedStyle,
    chatAnimatedStyle,
  };
}

export default useSidebarGesture;
