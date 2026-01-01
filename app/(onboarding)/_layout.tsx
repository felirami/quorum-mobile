/**
 * Onboarding Layout
 *
 * Note: Auth-based routing is handled by complete.tsx after signIn.
 * This layout just provides the OnboardingProvider and Stack.
 */

import { Stack } from 'expo-router';
import { OnboardingProvider } from '@/context';
import { useTheme } from '@/theme';

export default function OnboardingLayout() {
  const { theme, isDark } = useTheme();

  return (
    <OnboardingProvider>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: {
            backgroundColor: isDark ? theme.colors.background : theme.colors.surface1,
          },
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="account-setup" />
        <Stack.Screen name="farcaster-setup" />
        <Stack.Screen name="profile-setup" />
        <Stack.Screen name="privacy-setup" />
        <Stack.Screen name="complete" />
      </Stack>
    </OnboardingProvider>
  );
}
