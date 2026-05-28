import { useTheme } from '@/theme';
import { Stack } from 'expo-router';
import React from 'react';
import { Platform } from 'react-native';

export default function ProfileLayout() {
  const { theme } = useTheme();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.surface1 },
        headerTintColor: theme.colors.textMain,
        contentStyle: { backgroundColor: theme.colors.surface1 },
        // Default off; profile/index.tsx opts in so the bell-icon header
        // is visible on the main profile screen. Sub-routes can re-opt
        // out via their own Stack.Screen options if needed.
        headerShown: false,
        ...Platform.select({
          ios: {
            headerTransparent: true,
            headerBlurEffect: 'systemChromeMaterial' as const,
          },
          // Android: explicit slide_from_right to avoid the
          // overlay-scrim persistence bug on some devices. See
          // spaces/_layout.tsx for the full reasoning.
          default: {
            animation: 'slide_from_right' as const,
          },
        }),
      }}
    />
  );
}
