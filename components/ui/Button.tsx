import React from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  StyleProp,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { useTheme } from '@/theme';
import { IconSymbol, type IconSymbolName } from './IconSymbol';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps {
  /** Button label */
  children: React.ReactNode;
  /** Visual variant */
  variant?: ButtonVariant;
  /** Size preset */
  size?: ButtonSize;
  /** Disabled state */
  disabled?: boolean;
  /** Loading state - shows spinner */
  loading?: boolean;
  /** Icon to display */
  icon?: IconSymbolName;
  /** Icon position */
  iconPosition?: 'left' | 'right';
  /** Press handler */
  onPress: () => void;
  /** Full width button */
  fullWidth?: boolean;
  /** Custom style */
  style?: StyleProp<ViewStyle>;
  /** Test ID */
  testID?: string;
}

/**
 * Themed button component with multiple variants and sizes.
 *
 * @example
 * ```tsx
 * <Button variant="primary" onPress={handlePress}>
 *   Submit
 * </Button>
 *
 * <Button variant="danger" icon="trash.fill" loading={isDeleting}>
 *   Delete
 * </Button>
 * ```
 */
export function Button({
  children,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  icon,
  iconPosition = 'left',
  onPress,
  fullWidth = false,
  style,
  testID,
}: ButtonProps) {
  const { theme } = useTheme();
  const styles = createStyles(theme, variant, size, disabled, fullWidth);

  const isDisabled = disabled || loading;

  const iconSize = size === 'sm' ? 14 : size === 'md' ? 16 : 18;
  const iconColor = variant === 'ghost'
    ? (disabled ? theme.colors.textMuted : theme.colors.primary)
    : (variant === 'secondary' ? theme.colors.textMain : '#ffffff');

  const content = (
    <>
      {loading ? (
        <ActivityIndicator
          size="small"
          color={iconColor}
          style={styles.loader}
        />
      ) : icon && iconPosition === 'left' ? (
        <IconSymbol
          name={icon}
          size={iconSize}
          color={iconColor}
          style={styles.iconLeft}
        />
      ) : null}

      <Text style={styles.text}>{children}</Text>

      {!loading && icon && iconPosition === 'right' && (
        <IconSymbol
          name={icon}
          size={iconSize}
          color={iconColor}
          style={styles.iconRight}
        />
      )}
    </>
  );

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.7}
      style={[styles.button, style]}
      testID={testID}
    >
      {content}
    </TouchableOpacity>
  );
}

const createStyles = (
  theme: any,
  variant: ButtonVariant,
  size: ButtonSize,
  disabled: boolean,
  fullWidth: boolean
) => {
  const getBackgroundColor = () => {
    if (disabled) return theme.colors.surface3;
    switch (variant) {
      case 'primary':
        return theme.colors.primary;
      case 'secondary':
        return theme.colors.surface3;
      case 'danger':
        return theme.colors.danger;
      case 'ghost':
        return 'transparent';
    }
  };

  const getTextColor = () => {
    if (disabled) return theme.colors.textMuted;
    switch (variant) {
      case 'primary':
      case 'danger':
        return '#ffffff';
      case 'secondary':
        return theme.colors.textMain;
      case 'ghost':
        return theme.colors.primary;
    }
  };

  const getPadding = () => {
    switch (size) {
      case 'sm':
        return { paddingVertical: 6, paddingHorizontal: 12 };
      case 'md':
        return { paddingVertical: 12, paddingHorizontal: 20 };
      case 'lg':
        return { paddingVertical: 16, paddingHorizontal: 28 };
    }
  };

  const getFontSize = () => {
    switch (size) {
      case 'sm':
        return 12;
      case 'md':
        return 14;
      case 'lg':
        return 16;
    }
  };

  return StyleSheet.create({
    button: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: getBackgroundColor(),
      borderRadius: size === 'sm' ? 6 : size === 'md' ? 8 : 12,
      ...getPadding(),
      ...(fullWidth ? { width: '100%' } : {}),
      opacity: disabled ? 0.6 : 1,
    } as ViewStyle,
    text: {
      fontSize: getFontSize(),
      fontFamily: theme.fonts.medium.fontFamily,
      fontWeight: theme.fonts.medium.fontWeight,
      color: getTextColor(),
    } as TextStyle,
    iconLeft: {
      marginRight: 6,
    } as TextStyle,
    iconRight: {
      marginLeft: 6,
    } as TextStyle,
    loader: {
      marginRight: 8,
    } as ViewStyle,
  });
};

export default Button;
