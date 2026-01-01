/**
 * Standardized React Query configuration for consistent caching and retry behavior.
 */
export const queryConfig = {
  staleTime: {
    feed: 2 * 60 * 1000,     // 2 minutes - feeds update frequently
    profile: 5 * 60 * 1000,   // 5 minutes - profiles change less often
    channel: 5 * 60 * 1000,   // 5 minutes - channel data is relatively stable
    thread: 1 * 60 * 1000,    // 1 minute - thread replies may come quickly
  },
  gcTime: 10 * 60 * 1000,     // 10 minutes garbage collection time
  retry: 3,
  retryDelay: (attempt: number) => Math.min(1000 * 2 ** attempt, 30000),
};

/**
 * Query keys factory for consistent key generation.
 */
export const queryKeys = {
  farcaster: {
    all: ['farcaster'] as const,
    feed: (token?: string) => ['farcaster-feed', token] as const,
    thread: (username: string, hashPrefix: string, token?: string) =>
      ['farcaster-thread', username, hashPrefix, token] as const,
    profile: (fid: number, token?: string) =>
      ['farcaster-profile', fid, token] as const,
    channel: (channelKey: string, token?: string) =>
      ['farcaster-channel', channelKey, token] as const,
  },
};

export default queryConfig;
