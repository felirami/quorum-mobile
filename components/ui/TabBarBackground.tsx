import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { BlurView } from 'expo-blur';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '@/theme';

/**
 * Android / web fallback tab bar background.
 *
 * Uses expo-blur with the dimezisBlurView experimental method on Android when
 * available, and falls back to a theme-aware semi-transparent layer if blur
 * isn't supported. iOS uses the `.ios.tsx` variant which renders a native
 * UIVisualEffectView via `systemChromeMaterial`.
 */
export default function TabBarBackground() {
  const { isDark } = useTheme();

  return (
    <View style={StyleSheet.absoluteFill}>
      <BlurView
        tint={isDark ? 'dark' : 'light'}
        intensity={80}
        experimentalBlurMethod="dimezisBlurView"
        style={StyleSheet.absoluteFill}
      />
      {/* Fallback tint — visible when blur isn't rendered (older Android, web) */}
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: isDark
              ? 'rgba(10, 10, 11, 0.85)'
              : 'rgba(255, 255, 255, 0.85)',
          },
        ]}
      />
    </View>
  );
}

export function useBottomTabOverflow() {
  return useBottomTabBarHeight();
}
