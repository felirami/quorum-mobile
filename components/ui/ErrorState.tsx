import React from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import { useTheme, type AppTheme } from '@/theme';
import { IconSymbol } from './IconSymbol';

interface ErrorStateProps {
  /** Error message to display */
  message: string;
  /** Retry handler */
  onRetry?: () => void;
  /** Retry button label */
  retryLabel?: string;
  /** Custom style */
  style?: ViewStyle;
  /** Test ID */
  testID?: string;
}

/**
 * Error state component with optional retry action.
 *
 * @example
 * ```tsx
 * <ErrorState
 *   message="Failed to load data"
 *   onRetry={refetch}
 * />
 * ```
 */
export function ErrorState({
  message,
  onRetry,
  retryLabel = 'Try Again',
  style,
  testID,
}: ErrorStateProps) {
  const { theme } = useTheme();
  const styles = createStyles(theme);

  return (
    <View style={[styles.container, style]} testID={testID}>
      <View style={styles.iconContainer}>
        <IconSymbol
          name="exclamationmark.triangle.fill"
          size={32}
          color={theme.colors.danger}
        />
      </View>
      <Text style={styles.message}>{message}</Text>
      {onRetry && (
        <TouchableOpacity
          onPress={onRetry}
          style={styles.retryButton}
          activeOpacity={0.7}
        >
          <IconSymbol
            name="arrow.clockwise"
            size={14}
            color={theme.colors.primary}
          />
          <Text style={styles.retryText}>{retryLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    container: {
      alignItems: 'center',
      justifyContent: 'center',
      padding: 32,
    },
    iconContainer: {
      marginBottom: 16,
    },
    message: {
      fontSize: 14,
      color: theme.colors.textMain,
      fontFamily: theme.fonts.regular.fontFamily,
      textAlign: 'center',
      lineHeight: 20,
      marginBottom: 16,
    },
    retryButton: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 8,
      paddingHorizontal: 16,
      backgroundColor: theme.colors.surface2,
      borderRadius: 8,
      gap: 6,
    },
    retryText: {
      fontSize: 14,
      color: theme.colors.primary,
      fontFamily: theme.fonts.medium.fontFamily,
      fontWeight: theme.fonts.medium.fontWeight,
    },
  });

export default ErrorState;
