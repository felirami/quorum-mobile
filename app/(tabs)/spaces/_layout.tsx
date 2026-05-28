import { useTheme } from '@/theme';
import { Stack } from 'expo-router';
import React from 'react';
import { Platform } from 'react-native';

export default function SpacesLayout() {
  const { theme } = useTheme();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.surface1 },
        headerTintColor: theme.colors.textMain,
        headerTitleStyle: {
          fontFamily: theme.fonts.bold.fontFamily,
          fontWeight: theme.fonts.bold.fontWeight,
        },
        // Color the gap exposed during the iOS swipe-back so it matches
        // the theme — by default that area shows white, which is
        // jarring in dark mode.
        contentStyle: { backgroundColor: theme.colors.surface1 },
        // Keep the edge swipe-to-go-back gesture explicitly enabled.
        // contentStyle can interact with native-stack gesture
        // hit-testing on iOS in a way that silently disables it
        // unless we re-affirm here. `fullScreenGestureEnabled: false`
        // keeps the gesture limited to the screen edge so the rest of
        // the screen stays interactive (the alternative steals tap +
        // pan events from chat input bars and FlashList).
        gestureEnabled: true,
        fullScreenGestureEnabled: false,
        ...Platform.select({
          ios: {
            headerLargeTitle: true,
            headerTransparent: true,
            headerBlurEffect: 'systemChromeMaterial' as const,
            headerLargeTitleStyle: {
              fontFamily: theme.fonts.bold.fontFamily,
              fontWeight: theme.fonts.bold.fontWeight,
            },
          },
          // Android: explicit 'slide_from_right' animation. The
          // platform default uses an overlay-scrim layer for the
          // depth effect, which on some devices (Samsung One UI 5+,
          // certain MediaTek compositors) leaves a faint tint on the
          // destination screen because the scrim view doesn't get
          // released back to fully transparent at end-of-animation.
          // The pure slide variant doesn't render that scrim at all.
          default: {
            animation: 'slide_from_right' as const,
          },
        }),
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Spaces' }} />
      <Stack.Screen name="discover" options={{ title: 'Discover Spaces', headerLargeTitle: false, headerBackTitle: 'Spaces' }} />
      <Stack.Screen name="[id]/index" options={{ title: 'Space', headerLargeTitle: false, headerBackTitle: 'Spaces' }} />
      <Stack.Screen name="[id]/[channelId]" options={{ title: 'Channel', headerLargeTitle: false }} />
    </Stack>
  );
}
