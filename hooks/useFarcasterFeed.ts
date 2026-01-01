import { logger } from '@quilibrium/quorum-shared';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';

const FARCASTER_FEED_URL = 'https://client.farcaster.xyz/v2/feed-items';
const PAGE_SIZE = 20;

export interface FarcasterFeedItem {
  id: string;
  timestamp: number;
  cast: FarcasterCast;
}

export interface FarcasterCast {
  hash: string;
  timestamp: number;
  text: string;
  author: {
    fid: number;
    displayName: string;
    username: string;
    pfp?: {
      url?: string;
      verified?: boolean;
    };
    profile?: {
      accountLevel?: string;
    };
  };
  tags?: {
    type?: string;
    id?: string;
    name?: string;
  }[];
  channel?: {
    key?: string;
    name?: string;
  };
  embeds?: {
    images?: {
      url?: string;
      alt?: string;
    }[];
    videos?: {
      url?: string;
      sourceUrl?: string;
      thumbnailUrl?: string;
      width?: number;
      height?: number;
      duration?: number;
      type?: string;
    }[];
    urls?: {
      type?: string;
      openGraph?: {
        url?: string;
        sourceUrl?: string;
        title?: string;
        description?: string;
        domain?: string;
        image?: string;
        useLargeImage?: boolean;
        frameEmbedNext?: {
          frameUrl?: string;
          frameEmbed?: {
            version?: string;
            imageUrl?: string;
            button?: {
              title?: string;
              action?: {
                type?: string;
                name?: string;
                url?: string;
                splashImageUrl?: string;
                splashBackgroundColor?: string;
              };
            };
          };
        };
      };
    }[];
    casts?: EmbeddedCast[];
  };
}

export interface EmbeddedCast {
  hash: string;
  threadHash?: string;
  author: {
    fid: number;
    displayName: string;
    username: string;
    pfp?: {
      url?: string;
    };
    profile?: {
      accountLevel?: string;
    };
  };
  text: string;
  timestamp: number;
  embeds?: {
    images?: {
      url?: string;
      alt?: string;
    }[];
    videos?: {
      url?: string;
      thumbnailUrl?: string;
    }[];
  };
  replies?: {
    count?: number;
  };
  reactions?: {
    count?: number;
  };
  viewerContext?: {
    reacted?: boolean;
    recast?: boolean;
  };
  recasts?: {
    count?: number;
  };
}

interface FeedPage {
  items: FarcasterFeedItem[];
  nextCursor: number | null;
  latestMainCastTimestamp?: number;
  excludeItemIdPrefixes: string[];
}

interface UseFarcasterFeedOptions {
  token?: string;
  enabled?: boolean;
}

interface PageContext {
  olderThan?: number;
  latestMainCastTimestamp?: number;
  excludeItemIdPrefixes?: string[];
}

async function fetchFeedPage(
  token: string,
  pageContext?: PageContext,
  topItemHash?: string
): Promise<FeedPage> {
  logger.log('[FarcasterFeed] fetchFeedPage called', { pageContext, hasToken: !!token, topItemHash });
  logger.log('[FarcasterFeed] Token preview:', token ? `${token.substring(0, 20)}...` : 'NO TOKEN');

  const idempotencyKey = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const body: Record<string, unknown> = {
    feedKey: 'home',
    feedType: 'default',
    updateState: true,
  };

  if (pageContext?.olderThan) {
    body.olderThan = pageContext.olderThan;
    body.latestMainCastTimestamp = pageContext.latestMainCastTimestamp;
    body.excludeItemIdPrefixes = pageContext.excludeItemIdPrefixes ?? [];
    body.castViewEvents = [];
    logger.log('[FarcasterFeed] Pagination request with olderThan:', pageContext.olderThan);
  }

  // Include castViewEvents when refreshing to get new content
  if (!pageContext?.olderThan && topItemHash) {
    body.castViewEvents = [
      {
        ts: Date.now(),
        hash: topItemHash,
        on: 'home',
      },
    ];
  }

  logger.log('[FarcasterFeed] Request body:', body);

  const response = await fetch(FARCASTER_FEED_URL, {
    method: 'POST',
    headers: {
      accept: '*/*',
      'content-type': 'application/json; charset=utf-8',
      authorization: `Bearer ${token}`,
      'idempotency-key': idempotencyKey,
      origin: 'https://farcaster.xyz',
      referer: 'https://farcaster.xyz/',
    },
    body: JSON.stringify(body),
  });

  logger.log('[FarcasterFeed] Response status:', response.status);

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    logger.log('[FarcasterFeed] Error response:', errorData);
    throw new Error(
      errorData?.message || `Farcaster request failed (${response.status})`
    );
  }

  const json = await response.json();

  logger.log('[FarcasterFeed] Raw response keys:', Object.keys(json || {}));
  logger.log('[FarcasterFeed] Result keys:', Object.keys(json?.result || {}));
  logger.log('[FarcasterFeed] Pagination info:', {
    cursor: json?.result?.cursor,
    nextCursor: json?.result?.nextCursor,
    next: json?.result?.next,
    pageInfo: json?.result?.pageInfo,
    latestMainCastTimestamp: json?.result?.latestMainCastTimestamp,
    feedTopSeenAtTimestamp: json?.result?.feedTopSeenAtTimestamp,
    replaceFeed: json?.result?.replaceFeed,
  });

  const items: FarcasterFeedItem[] = json?.result?.items ?? [];

  // Use the last item's timestamp as the cursor for the next page
  // Always provide a cursor if we have items - the API may return fewer than PAGE_SIZE
  const lastItem = items[items.length - 1];
  const latestMainCastTimestamp = json?.result?.latestMainCastTimestamp;
  // Use latestMainCastTimestamp for the next page cursor
  const nextCursor = latestMainCastTimestamp ?? (lastItem ? lastItem.timestamp : null);
  // Collect item ID prefixes for exclusion
  const excludeItemIdPrefixes = items.map((item) => item.id.slice(2, 10)); // Remove 0x prefix, take 8 chars

  const firstItem = items[0];
  logger.log('[FarcasterFeed] Fetched', { itemCount: items.length, nextCursor, latestMainCastTimestamp });
  logger.log('[FarcasterFeed] Newest item:', {
    id: firstItem?.id,
    timestamp: firstItem?.timestamp,
    date: firstItem?.timestamp ? new Date(firstItem.timestamp).toISOString() : null,
  });
  logger.log('[FarcasterFeed] Oldest item:', {
    id: lastItem?.id,
    timestamp: lastItem?.timestamp,
    date: lastItem?.timestamp ? new Date(lastItem.timestamp).toISOString() : null,
  });
  logger.log('[FarcasterFeed] Exclude prefixes:', excludeItemIdPrefixes);

  return { items, nextCursor, latestMainCastTimestamp, excludeItemIdPrefixes };
}

export function useFarcasterFeed({ token, enabled = true }: UseFarcasterFeedOptions) {
  const queryClient = useQueryClient();
  const queryKey = ['farcaster-feed', token];
  const topItemHashRef = useRef<string | undefined>(undefined);

  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => {
      // On refresh (no pageParam), pass the top item hash
      const hashForRefresh = pageParam === undefined ? topItemHashRef.current : undefined;
      return fetchFeedPage(token!, pageParam, hashForRefresh);
    },
    initialPageParam: undefined as PageContext | undefined,
    getNextPageParam: (lastPage, allPages) => {
      if (!lastPage.nextCursor) return undefined;
      // Accumulate all exclude prefixes from all pages
      const allExcludePrefixes = allPages.flatMap((page) => page.excludeItemIdPrefixes);
      return {
        olderThan: lastPage.nextCursor,
        latestMainCastTimestamp: lastPage.latestMainCastTimestamp,
        excludeItemIdPrefixes: allExcludePrefixes,
      } as PageContext;
    },
    enabled: enabled && Boolean(token),
    staleTime: 1000 * 60 * 2, // 2 minutes
  });

  // Flatten all pages into a single array
  const data = query.data?.pages.flatMap((page) => page.items) ?? [];

  // Track the top item hash for refresh requests
  if (data.length > 0 && data[0].cast?.hash) {
    topItemHashRef.current = data[0].cast.hash;
  }

  // Custom refresh that resets and refetches from scratch
  const refresh = async () => {
    logger.log('[FarcasterFeed] refresh() called - resetting query, topItemHash:', topItemHashRef.current);
    // Reset removes all pages and refetches the first page
    await queryClient.resetQueries({ queryKey });
    logger.log('[FarcasterFeed] refresh() complete');
  };

  const wrappedFetchNextPage = () => {
    logger.log('[FarcasterFeed] fetchNextPage() called', {
      hasNextPage: query.hasNextPage,
      isFetchingNextPage: query.isFetchingNextPage,
      pagesLoaded: query.data?.pages.length ?? 0,
      nextPageContext: query.data?.pages?.length ? 'will include excludeItemIdPrefixes' : 'first page',
    });
    return query.fetchNextPage();
  };

  logger.log('[FarcasterFeed] Hook state:', {
    dataCount: data.length,
    hasNextPage: query.hasNextPage,
    pagesLoaded: query.data?.pages.length ?? 0,
  });

  return {
    data,
    isLoading: query.isLoading,
    isFetchingNextPage: query.isFetchingNextPage,
    error: query.error?.message ?? null,
    hasNextPage: query.hasNextPage ?? true, // Default to true until we know otherwise
    fetchNextPage: wrappedFetchNextPage,
    refetch: refresh,
    isRefetching: query.isRefetching || query.isFetching,
  };
}
