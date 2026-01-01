import { StyleSheet, Text, type TextProps } from 'react-native';

import { useTheme } from '@/theme';
import { useThemeColor } from '@/hooks/useThemeColor';

export type ThemedTextProps = TextProps & {
  lightColor?: string;
  darkColor?: string;
  type?: 'default' | 'title' | 'defaultSemiBold' | 'subtitle' | 'link';
};

export function ThemedText({
  style,
  lightColor,
  darkColor,
  type = 'default',
  ...rest
}: ThemedTextProps) {
  const { theme } = useTheme();
  const color = useThemeColor({ light: lightColor, dark: darkColor }, 'text');

  return (
    <Text
      style={[
        { color, fontFamily: theme.fonts.regular.fontFamily },
        type === 'default' ? styles.default : undefined,
        type === 'title' ? [styles.title, { fontFamily: theme.fonts.bold.fontFamily }] : undefined,
        type === 'defaultSemiBold' ? [styles.defaultSemiBold, { fontFamily: theme.fonts.medium.fontFamily }] : undefined,
        type === 'subtitle' ? [styles.subtitle, { fontFamily: theme.fonts.bold.fontFamily }] : undefined,
        type === 'link' ? [styles.link, { color: theme.colors.primary }] : undefined,
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  default: {
    fontSize: 16,
    lineHeight: 24,
  },
  defaultSemiBold: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '600',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    lineHeight: 32,
  },
  subtitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  link: {
    lineHeight: 30,
    fontSize: 16,
  },
});
