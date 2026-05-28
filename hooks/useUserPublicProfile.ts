/**
 * useUserPublicProfile — fetches a user's public profile by address.
 *
 * Returns null when the user hasn't opted in (404 from server) or hasn't
 * yet been observed on the network. Cached for an hour with React Query
 * so chat surfaces don't refetch on every render. Used as a fallback
 * when our local SpaceMember record is empty or stale.
 */

import { useQuery } from '@tanstack/react-query';
import { getQuorumClient } from '@/services/api/quorumClient';

export interface PublicProfile {
  display_name: string;
  profile_image: string;
  bio: string;
  timestamp: number;
  signature: string;
}

export const publicProfileQueryKey = (address: string | undefined) =>
  ['user-public-profile', address ?? ''] as const;

export function useUserPublicProfile(
  address: string | undefined,
  options?: { enabled?: boolean },
) {
  return useQuery<PublicProfile | null>({
    queryKey: publicProfileQueryKey(address),
    queryFn: async () => {
      if (!address) return null;
      return await getQuorumClient().getPublicProfile(address);
    },
    enabled: (options?.enabled ?? true) && !!address,
    staleTime: 60 * 60 * 1000, // 1 hour
    gcTime: 24 * 60 * 60 * 1000, // 24 hours
    retry: false,
  });
}
