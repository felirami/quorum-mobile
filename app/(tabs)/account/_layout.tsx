import { useTheme } from '@/theme';
import { Stack } from 'expo-router';
import React from 'react';
import { Platform } from 'react-native';

export default function AccountLayout() {
  const { theme } = useTheme();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.background },
        headerTintColor: theme.colors.textMain,
        headerTitleStyle: {
          fontFamily: theme.fonts.bold.fontFamily,
          fontWeight: theme.fonts.bold.fontWeight,
        },
        headerShadowVisible: false,
        // Color the area exposed during the iOS swipe-back gesture so
        // it doesn't flash a white sliver in dark mode. See spaces /
        // messages layouts for the same fix.
        contentStyle: { backgroundColor: theme.colors.background },
        ...Platform.select({
          // Android: explicit slide_from_right to avoid the
          // overlay-scrim persistence bug on some devices. See
          // spaces/_layout.tsx for the full reasoning.
          default: {
            animation: 'slide_from_right' as const,
          },
          ios: {},
        }),
      }}
    />
  );
}
