/**
 * Typography system.
 *
 * `fonts` carries weight/family pairs for use with React Native's `fontFamily`
 * and `fontWeight` style props.
 *
 * `fontSizes` are the raw size tokens — useful for one-off sizes.
 *
 * `textStyles` is a semantic type scale matching iOS Human Interface
 * Guidelines (and their Material equivalents). Prefer these over raw sizes —
 * they encode proper line-heights and weights in one place so body text is
 * always the same body text.
 */

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

/**
 * Semantic type scale. Sized and weighted to feel native on both platforms.
 *
 * Use these shapes directly in style objects:
 *   <Text style={textStyles.headline}>Hello</Text>
 *
 * Or spread them with color:
 *   <Text style={[textStyles.body, { color: theme.colors.textMain }]}>
 */
export const textStyles = {
  /** 34/41 bold — large titles on list/root screens */
  largeTitle: {
    fontFamily: fonts.bold.fontFamily,
    fontWeight: fonts.bold.fontWeight,
    fontSize: 34,
    lineHeight: 41,
  },
  /** 28/34 bold — screen titles, main section headers */
  title1: {
    fontFamily: fonts.bold.fontFamily,
    fontWeight: fonts.bold.fontWeight,
    fontSize: 28,
    lineHeight: 34,
  },
  /** 22/28 bold — secondary titles, modal headers */
  title2: {
    fontFamily: fonts.bold.fontFamily,
    fontWeight: fonts.bold.fontWeight,
    fontSize: 22,
    lineHeight: 28,
  },
  /** 20/25 bold — tertiary titles, card headers */
  title3: {
    fontFamily: fonts.bold.fontFamily,
    fontWeight: fonts.bold.fontWeight,
    fontSize: 20,
    lineHeight: 25,
  },
  /** 17/22 semibold — prominent body text, list item titles */
  headline: {
    fontFamily: fonts.medium.fontFamily,
    fontWeight: fonts.medium.fontWeight,
    fontSize: 17,
    lineHeight: 22,
  },
  /** 17/22 regular — default body copy */
  body: {
    fontFamily: fonts.regular.fontFamily,
    fontWeight: fonts.regular.fontWeight,
    fontSize: 17,
    lineHeight: 22,
  },
  /** 16/21 regular — secondary body text */
  callout: {
    fontFamily: fonts.regular.fontFamily,
    fontWeight: fonts.regular.fontWeight,
    fontSize: 16,
    lineHeight: 21,
  },
  /** 15/20 regular — subheadlines, preview text */
  subheadline: {
    fontFamily: fonts.regular.fontFamily,
    fontWeight: fonts.regular.fontWeight,
    fontSize: 15,
    lineHeight: 20,
  },
  /** 13/18 regular — footnotes, tertiary info */
  footnote: {
    fontFamily: fonts.regular.fontFamily,
    fontWeight: fonts.regular.fontWeight,
    fontSize: 13,
    lineHeight: 18,
  },
  /** 12/16 regular — captions, metadata (timestamps, counts) */
  caption1: {
    fontFamily: fonts.regular.fontFamily,
    fontWeight: fonts.regular.fontWeight,
    fontSize: 12,
    lineHeight: 16,
  },
  /** 11/13 medium — overline / section labels (often uppercased) */
  caption2: {
    fontFamily: fonts.medium.fontFamily,
    fontWeight: fonts.medium.fontWeight,
    fontSize: 11,
    lineHeight: 13,
  },
} as const;

export type TextStyleName = keyof typeof textStyles;
