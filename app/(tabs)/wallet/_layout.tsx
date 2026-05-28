import { useTheme } from '@/theme';
import { Stack } from 'expo-router';
import React from 'react';
import { Platform } from 'react-native';

export default function WalletLayout() {
  const { theme } = useTheme();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.surface1 },
        headerTintColor: theme.colors.textMain,
        headerShown: false,
        contentStyle: { backgroundColor: theme.colors.surface1 },
        // Already surface1 — kept explicit here so a future theme
        // tweak can't drift the swipe-back gap color.
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
