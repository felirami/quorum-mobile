/**
 * StepNavigation - Back/Next/Skip buttons for onboarding steps
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useTheme } from '@/theme';
import { Button } from '@/components/ui/Button';

interface StepNavigationProps {
  onBack?: () => void;
  onNext?: () => void;
  onSkip?: () => void;
  nextLabel?: string;
  skipLabel?: string;
  showBack?: boolean;
  showSkip?: boolean;
  nextDisabled?: boolean;
  isLoading?: boolean;
}

export function StepNavigation({
  onBack,
  onNext,
  onSkip,
  nextLabel = 'Continue',
  skipLabel = 'Skip for now',
  showBack = true,
  showSkip = false,
  nextDisabled = false,
  isLoading = false,
}: StepNavigationProps) {
  const { theme } = useTheme();
  const styles = createStyles(theme);

  return (
    <View style={styles.container}>
      {showSkip && onSkip && (
        <Button
          variant="ghost"
          onPress={onSkip}
          disabled={isLoading}
          style={styles.skipButton}
        >
          {skipLabel}
        </Button>
      )}

      <View style={styles.mainButtons}>
        {showBack && onBack && (
          <Button
            variant="secondary"
            onPress={onBack}
            disabled={isLoading}
            style={styles.backButton}
          >
            Back
          </Button>
        )}

        {onNext && (
          <Button
            variant="primary"
            onPress={onNext}
            disabled={nextDisabled || isLoading}
            loading={isLoading}
            style={[styles.nextButton, !showBack ? styles.nextButtonFull : undefined]}
          >
            {nextLabel}
          </Button>
        )}
      </View>
    </View>
  );
}

const createStyles = (theme: any) =>
  StyleSheet.create({
    container: {
      marginTop: 'auto',
      paddingTop: 24,
    },
    skipButton: {
      marginBottom: 12,
      alignSelf: 'center',
    },
    mainButtons: {
      flexDirection: 'row',
      gap: 12,
    },
    backButton: {
      flex: 1,
    },
    nextButton: {
      flex: 2,
    },
    nextButtonFull: {
      flex: 1,
    },
  });

export default StepNavigation;
