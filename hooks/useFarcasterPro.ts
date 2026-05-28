/**
 * Hook to detect Farcaster Pro status and get cast limits
 */

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { fetchUserAppContext, type FarcasterUserAppContext } from '@/services/farcasterClient';

// Default limits for non-Pro users
const DEFAULT_REGULAR_CAST_LIMIT = 320;
const DEFAULT_LONG_CAST_LIMIT = 320;

export interface FarcasterCastLimits {
  /** Regular cast byte limit (shown on timeline) */
  regularCastByteLimit: number;
  /** Long cast byte limit (max for Pro users) */
  longCastByteLimit: number;
  /** Whether the user has Farcaster Pro */
  isPro: boolean;
  /** Whether we're still loading the data */
  isLoading: boolean;
}

/**
 * Hook to fetch the user's Farcaster cast limits and Pro status
 * Uses the user-app-context API to get the actual limits from Farcaster
 */
export function useFarcasterCastLimits(): FarcasterCastLimits {
  const { farcasterAuthToken } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['farcaster-app-context', farcasterAuthToken ? 'authenticated' : 'none'],
    queryFn: async (): Promise<FarcasterUserAppContext | null> => {
      if (!farcasterAuthToken) return null;
      return fetchUserAppContext(farcasterAuthToken);
    },
    enabled: !!farcasterAuthToken,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
  });

  // Determine if user is Pro based on whether their limits exceed defaults
  const isPro = data
    ? data.longCastByteLimit > DEFAULT_REGULAR_CAST_LIMIT
    : false;

  return {
    regularCastByteLimit: data?.regularCastByteLimit ?? DEFAULT_REGULAR_CAST_LIMIT,
    longCastByteLimit: data?.longCastByteLimit ?? DEFAULT_LONG_CAST_LIMIT,
    isPro,
    isLoading,
  };
}

/**
 * Get the appropriate max cast length based on Pro status
 */
export function getMaxCastLength(isPro: boolean, longCastByteLimit: number): number {
  return isPro ? longCastByteLimit : DEFAULT_REGULAR_CAST_LIMIT;
}

/**
 * Check if a cast exceeds the regular limit but is within long cast limit
 * (Used to show the "only first N characters visible on timeline" warning)
 */
export function isLongCast(
  textLength: number,
  regularLimit: number,
  longLimit: number
): boolean {
  return textLength > regularLimit && textLength <= longLimit;
}
