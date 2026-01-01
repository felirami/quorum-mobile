import React from 'react';
import { Text as RNText, TextProps, View as RNView, ViewProps, TextInput as RNTextInput, TextInputProps, TouchableOpacity, TouchableOpacityProps } from 'react-native';
import { useTheme, createThemedStyles } from '@/theme';

export const Text: React.FC<TextProps & { variant?: 'default' | 'strong' | 'subtle' | 'muted' | 'heading' | 'subheading' }> = ({ 
  style, 
  variant = 'default',
  ...props 
}) => {
  const { theme } = useTheme();
  const styles = createThemedStyles(theme);
  
  return (
    <RNText 
      style={[styles.text[variant], style]} 
      {...props} 
    />
  );
};

export const View: React.FC<ViewProps & { variant?: 'default' | 'card' | 'modal' }> = ({ 
  style, 
  variant = 'default',
  ...props 
}) => {
  const { theme } = useTheme();
  const styles = createThemedStyles(theme);
  
  return (
    <RNView 
      style={[styles.container[variant], style]} 
      {...props} 
    />
  );
};

export const TextInput: React.FC<TextInputProps> = ({ 
  style,
  placeholderTextColor,
  ...props 
}) => {
  const { theme } = useTheme();
  const styles = createThemedStyles(theme);
  
  return (
    <RNTextInput
      style={[styles.input.default, style]}
      placeholderTextColor={placeholderTextColor || theme.colors.textMuted}
      {...props}
    />
  );
};

export const Button: React.FC<TouchableOpacityProps & { variant?: 'primary' | 'secondary' | 'danger' }> = ({ 
  style,
  variant = 'primary',
  children,
  ...props 
}) => {
  const { theme } = useTheme();
  const styles = createThemedStyles(theme);
  
  return (
    <TouchableOpacity
      style={[styles.button[variant], style]}
      activeOpacity={0.7}
      {...props}
    >
      {children}
    </TouchableOpacity>
  );
};

export const ButtonText: React.FC<TextProps> = ({ 
  style,
  ...props 
}) => {
  const { theme } = useTheme();
  
  return (
    <Text 
      style={[
        {
          color: '#ffffff',
          fontFamily: theme.fonts.medium.fontFamily,
          fontSize: theme.fontSizes.md,
          textAlign: 'center',
        },
        style
      ]} 
      {...props} 
    />
  );
};