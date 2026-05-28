/**
 * useQuorumIdentityForFid — given a Farcaster fid, resolve the linked
 * Quorum identity (if any) via the server's `/users/by-fid/:fid`
 * endpoint and surface a compact display payload for badge rendering.
 *
 * Returns `null` (not undefined, not error) when the fid has no linked
 * Quorum identity — that's the common case for most Farcaster users.
 * UI just hides the badge silently in that state.
 *
 * Caching: aggressive (30 minute staleTime, 1 hour gcTime). The link
 * doesn't change often, and showing a slightly stale badge for a few
 * minutes is harmless. Retry disabled — a 404 is the answer for "not
 * linked," not a transient error.
 */

import { useQuery } from '@tanstack/react-query';
import { getQuorumClient } from '@/services/api/quorumClient';

export interface QuorumIdentityBadge {
  address: string;
  displayName: string;
  /** The user's chosen QNS primary, sans `.q` suffix. UI appends if shown. */
  primaryUsername?: string;
}

export function useQuorumIdentityForFid(fid: number | undefined) {
  return useQuery<QuorumIdentityBadge | null>({
    queryKey: ['quorum-identity-for-fid', fid ?? 0],
    queryFn: async () => {
      if (!fid || fid <= 0) return null;
      const result = await getQuorumClient().getUserByFarcasterFid(fid);
      if (!result) return null;
      return {
        address: result.address,
        displayName: result.public_profile.display_name,
        primaryUsername: result.public_profile.primary_username,
      };
    },
    enabled: !!fid && fid > 0,
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    retry: false,
  });
}
