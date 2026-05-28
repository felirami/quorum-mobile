/**
 * Onboarding Entry Point
 *
 * Redirects to the current onboarding step based on saved progress.
 * Auth-based redirects (authenticated -> home) are handled by AuthRouter in _layout.tsx.
 */

import { useAuth, useOnboardingState } from '@/context';
import { useTheme } from '@/theme';
import { Redirect } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

export default function OnboardingIndex() {
  const { currentStep } = useOnboardingState();
  const { authState } = useAuth();
  const { theme } = useTheme();

  // If authenticated, just show loading - AuthRouter will redirect to home
  // This prevents any further redirects from this component during auth navigation
  if (authState === 'authenticated') {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  // If step is complete, show loading - AuthRouter will redirect to home
  if (currentStep === 'complete') {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  // If we have a current step, redirect to it
  if (currentStep) {
    return <Redirect href={`/(onboarding)/${currentStep}`} />;
  }

  // Default to account-setup if no step is set
  return <Redirect href="/(onboarding)/account-setup" />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
