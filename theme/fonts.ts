export const fonts = {
  regular: {
    fontFamily: 'AtAero',
    fontWeight: '400' as const,
  },
  medium: {
    fontFamily: 'AtAero',
    fontWeight: '500' as const,
  },
  bold: {
    fontFamily: 'AtAero',
    fontWeight: '700' as const,
  },
  heavy: {
    fontFamily: 'AtAero',
    fontWeight: '900' as const,
  },
} as const;

export const fontSizes = {
  xs: 10,
  sm: 12,
  md: 14,
  lg: 16,
  xl: 18,
  '2xl': 20,
  '3xl': 24,
  '4xl': 32,
  '5xl': 48,
} as const;