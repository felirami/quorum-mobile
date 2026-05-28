import { useTheme } from '@/theme';
import { Stack } from 'expo-router';
import React from 'react';
import { Platform } from 'react-native';

export default function MessagesLayout() {
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
        // Color the iOS swipe-back gap so it doesn't flash white in dark mode.
        contentStyle: { backgroundColor: theme.colors.surface1 },
        // Re-affirm the edge swipe-back gesture — see spaces/_layout.tsx
        // for the reasoning. contentStyle can silently kill the gesture
        // on native-stack unless explicit.
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
          // Android: explicit slide_from_right to avoid the
          // overlay-scrim persistence bug on some devices. See
          // spaces/_layout.tsx for the full reasoning.
          default: {
            animation: 'slide_from_right' as const,
          },
        }),
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Messages' }} />
      <Stack.Screen
        name="dm/[id]"
        options={{
          title: 'Chat',
          headerLargeTitle: false,
          headerBackTitle: 'Messages',
        }}
      />
    </Stack>
  );
}
