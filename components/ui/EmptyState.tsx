import React from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import { useTheme, type AppTheme } from '@/theme';
import { IconSymbol, type IconSymbolName } from './IconSymbol';

interface EmptyStateProps {
  /** Icon to display */
  icon?: IconSymbolName;
  /** Title text */
  title: string;
  /** Description text */
  message?: string;
  /** Action button label */
  actionLabel?: string;
  /** Action handler */
  onAction?: () => void;
  /** Custom style */
  style?: ViewStyle;
  /** Test ID */
  testID?: string;
}

/**
 * Empty state component for lists and containers.
 *
 * @example
 * ```tsx
 * <EmptyState
 *   icon="doc.text"
 *   title="No documents"
 *   message="Upload your first document to get started"
 *   actionLabel="Upload"
 *   onAction={handleUpload}
 * />
 * ```
 */
export function EmptyState({
  icon = 'tray',
  title,
  message,
  actionLabel,
  onAction,
  style,
  testID,
}: EmptyStateProps) {
  const { theme } = useTheme();
  const styles = createStyles(theme);

  return (
    <View style={[styles.container, style]} testID={testID}>
      <View style={styles.iconContainer}>
        <IconSymbol
          name={icon}
          size={48}
          color={theme.colors.textMuted}
        />
      </View>
      <Text style={styles.title}>{title}</Text>
      {message && (
        <Text style={styles.message}>{message}</Text>
      )}
      {actionLabel && onAction && (
        <TouchableOpacity
          onPress={onAction}
          style={styles.actionButton}
          activeOpacity={0.7}
        >
          <Text style={styles.actionText}>{actionLabel}</Text>
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
      padding: 48,
    },
    iconContainer: {
      marginBottom: 16,
    },
    title: {
      fontSize: 18,
      fontFamily: theme.fonts.bold.fontFamily,
      fontWeight: theme.fonts.bold.fontWeight,
      color: theme.colors.textMain,
      textAlign: 'center',
      marginBottom: 8,
    },
    message: {
      fontSize: 14,
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.regular.fontFamily,
      textAlign: 'center',
      lineHeight: 20,
      marginBottom: 20,
    },
    actionButton: {
      paddingVertical: 12,
      paddingHorizontal: 24,
      backgroundColor: theme.colors.primary,
      borderRadius: 8,
    },
    actionText: {
      fontSize: 14,
      color: '#ffffff',
      fontFamily: theme.fonts.medium.fontFamily,
      fontWeight: theme.fonts.medium.fontWeight,
    },
  });

export default EmptyState;
