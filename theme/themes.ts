import { Theme } from '@react-navigation/native';
import { accentThemes, colors } from './colors';
import { fonts } from './fonts';

type AccentColor = keyof typeof accentThemes;

const createTheme = (isDark: boolean, accentColor: AccentColor = 'blue'): Theme & {
  colors: Theme['colors'] & {
    accent: string;
    accentLight: string;
    accentDark: string;
    surface0: string;
    surface1: string;
    surface2: string;
    surface3: string;
    surface4: string;
    surface5: string;
    surface6: string;
    surface7: string;
    surface8: string;
    surface9: string;
    surface10: string;
    textStrong: string;
    textMain: string;
    textSubtle: string;
    textMuted: string;
    danger: string;
    warning: string;
    success: string;
    info: string;
  };
  fonts: typeof fonts;
  fontSizes: typeof import('./fonts').fontSizes;
} => {
  const accent = accentThemes[accentColor];
  const surface = isDark ? colors.darkSurface : colors.surface;
  const textColors = isDark ? colors.text.dark : colors.text.light;
  const utilities = isDark ? {
    danger: colors.utilities.dangerDark,
    warning: colors.utilities.warningDark,
    success: colors.utilities.successDark,
    info: colors.utilities.infoDark,
  } : {
    danger: colors.utilities.danger,
    warning: colors.utilities.warning,
    success: colors.utilities.success,
    info: colors.utilities.info,
  };

  return {
    dark: isDark,
    colors: {
      primary: accent[500],
      background: surface['00'],
      card: surface['2'],
      text: textColors.main,
      border: surface['6'],
      notification: accent[500],
      
      // Extended colors
      accent: accent[500],
      accentLight: accent[200],
      accentDark: accent[700],
      surface0: surface['0'],
      surface1: surface['1'],
      surface2: surface['2'],
      surface3: surface['3'],
      surface4: surface['4'],
      surface5: surface['5'],
      surface6: surface['6'],
      surface7: surface['7'],
      surface8: surface['8'],
      surface9: surface['9'],
      surface10: surface['10'],
      textStrong: textColors.strong,
      textMain: textColors.main,
      textSubtle: textColors.subtle,
      textMuted: textColors.muted,
      ...utilities,
    },
    fonts,
    fontSizes: require('./fonts').fontSizes,
  };
};

export const LightTheme = createTheme(false);
export const DarkTheme = createTheme(true);

export const createThemedStyles = (theme: ReturnType<typeof createTheme>) => {
  const { colors, fonts, fontSizes } = theme;
  
  return {
    text: {
      default: {
        fontFamily: fonts.regular.fontFamily,
        fontSize: fontSizes.md,
        color: colors.textMain,
      },
      strong: {
        fontFamily: fonts.bold.fontFamily,
        fontSize: fontSizes.md,
        color: colors.textStrong,
      },
      subtle: {
        fontFamily: fonts.regular.fontFamily,
        fontSize: fontSizes.md,
        color: colors.textSubtle,
      },
      muted: {
        fontFamily: fonts.regular.fontFamily,
        fontSize: fontSizes.sm,
        color: colors.textMuted,
      },
      heading: {
        fontFamily: fonts.bold.fontFamily,
        fontSize: fontSizes['2xl'],
        color: colors.textStrong,
      },
      subheading: {
        fontFamily: fonts.medium.fontFamily,
        fontSize: fontSizes.lg,
        color: colors.textMain,
      },
    },
    container: {
      default: {
        backgroundColor: colors.background,
      },
      card: {
        backgroundColor: colors.card,
        borderRadius: 8,
        padding: 16,
      },
      modal: {
        backgroundColor: colors.surface5,
        borderRadius: 12,
      },
    },
    button: {
      primary: {
        backgroundColor: colors.primary,
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 8,
      },
      secondary: {
        backgroundColor: colors.surface3,
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 8,
      },
      danger: {
        backgroundColor: colors.danger,
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 8,
      },
    },
    input: {
      default: {
        backgroundColor: colors.surface3,
        borderRadius: 8,
        paddingHorizontal: 16,
        paddingVertical: 10,
        fontSize: fontSizes.md,
        fontFamily: fonts.regular.fontFamily,
        color: colors.textMain,
      },
    },
  };
};

export { createTheme, type AccentColor };
