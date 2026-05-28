import { Dimensions } from 'react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Scale factor: iPhone 15 Pro is 393pt wide. Larger screens get more chars.
const BASE_WIDTH = 393;
const scaleFactor = Math.min(SCREEN_WIDTH / BASE_WIDTH, 1.5);

export function truncateAddress(
  address: string | undefined,
  mode: 'short' | 'medium' | 'long' = 'medium',
): string {
  if (!address) return 'Unknown';
  if (address.startsWith('@')) return address;

  const lengths = {
    short:  { start: Math.round(4 * scaleFactor), end: 3 },
    medium: { start: Math.round(6 * scaleFactor), end: 4 },
    long:   { start: Math.round(8 * scaleFactor), end: 6 },
  };

  const { start, end } = lengths[mode];
  const minFull = start + end + 3;

  if (address.length <= minFull) return address;
  return `${address.slice(0, start)}\u2026${address.slice(-end)}`;
}

/**
 * Format address for display (shortened) using a character count.
 * Shows the first and last `chars` characters separated by an ellipsis.
 */
export function formatAddress(address: string, chars: number = 6): string {
  if (address.length <= chars * 2) return address;
  return `${address.slice(0, chars)}\u2026${address.slice(-chars)}`;
}

export function truncateName(
  name: string,
  maxLength?: number,
): string {
  const max = maxLength ?? Math.round(16 * scaleFactor);
  if (name.length <= max) return name;
  return `${name.slice(0, max)}\u2026`;
}
