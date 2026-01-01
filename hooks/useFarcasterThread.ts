import { logger } from '@quilibrium/quorum-shared';
import { useQuery } from '@tanstack/react-query';

const THREAD_API_URL = 'https://farcaster.xyz/~api/v2/user-thread-casts';

export interface ThreadCast {
  hash: string;
  threadHash: string;
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
  parentHash?: string;
  parentAuthor?: {
    fid: number;
    displayName: string;
    username: string;
  };
  parentUrl?: string;
  castType?: string; // "root-embed" for channel placeholders
  channel?: {
    key?: string;
    name?: string;
    imageUrl?: string;
  };
  replies?: {
    count?: number;
    casts?: ThreadCast[];
  };
  reactions?: {
    count?: number;
  };
  recasts?: {
    count?: number;
  };
  embeds?: {
    images?: {
      url?: string;
      alt?: string;
    }[];
    videos?: {
      url?: string;
      thumbnailUrl?: string;
      width?: number;
      height?: number;
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
    casts?: {
      hash: string;
      threadHash?: string;
      author: {
        fid: number;
        displayName: string;
        username: string;
        pfp?: { url?: string };
      };
      text: string;
      timestamp: number;
      embeds?: {
        images?: { url?: string; alt?: string }[];
      };
    }[];
  };
  viewerContext?: {
    reacted?: boolean;
    recast?: boolean;
  };
}

interface ThreadResponse {
  result: {
    casts: ThreadCast[];
  };
}

interface UseFarcasterThreadOptions {
  username: string;
  castHashPrefix: string;
  token?: string;
  enabled?: boolean;
}

// Parse farcaster.xyz URL to extract username and hash prefix
export function parseFarcasterUrl(url: string): { username: string; castHashPrefix: string } | null {
  // Match patterns like:
  // https://farcaster.xyz/username/0xabcdef
  // https://farcaster.xyz/username/0xabcdef12
  const match = url.match(/farcaster\.xyz\/([^\/]+)\/(0x[a-fA-F0-9]+)/);
  if (match) {
    return {
      username: match[1],
      castHashPrefix: match[2],
    };
  }
  return null;
}

async function fetchThread(
  username: string,
  castHashPrefix: string,
  token?: string
): Promise<ThreadCast[]> {
  const url = `${THREAD_API_URL}?castHashPrefix=${castHashPrefix}&username=${username}&limit=15`;

  const headers: Record<string, string> = {
    accept: '*/*',
    'content-type': 'application/json',
    origin: 'https://farcaster.xyz',
    referer: 'https://farcaster.xyz/',
  };

  if (token) {
    headers.authorization = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    method: 'GET',
    headers,
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch thread (${response.status})`);
  }

  const json = await response.json();

  const casts = json.result?.casts ?? [];

  return casts;
}

// Flatten nested replies into a linear array with depth info
export interface FlattenedCast extends ThreadCast {
  depth: number;
}

function flattenReplies(casts: ThreadCast[], depth = 0): FlattenedCast[] {
  const result: FlattenedCast[] = [];

  for (const cast of casts) {
    result.push({ ...cast, depth });

    if (cast.replies?.casts && cast.replies.casts.length > 0) {
      result.push(...flattenReplies(cast.replies.casts, depth + 1));
    }
  }

  return result;
}

export function useFarcasterThread({
  username,
  castHashPrefix,
  token,
  enabled = true,
}: UseFarcasterThreadOptions) {
  const query = useQuery({
    queryKey: ['farcaster-thread', username, castHashPrefix],
    queryFn: () => fetchThread(username, castHashPrefix, token),
    enabled: enabled && Boolean(username) && Boolean(castHashPrefix),
    staleTime: 1000 * 60 * 2, // 2 minutes
  });

  // Filter out "root-embed" casts (channel placeholders)
  const actualCasts = query.data?.filter((cast) => cast.castType !== 'root-embed') ?? [];

  // The first actual cast is the main thread, rest are replies
  const mainCast = actualCasts[0];
  const replies = actualCasts.slice(1);

  // Flatten nested replies for display
  const flattenedReplies = flattenReplies(replies);

  // Extract channel info from root-embed if present
  const rootEmbed = query.data?.find((cast) => cast.castType === 'root-embed');
  const channelContext = rootEmbed?.channel;

  return {
    mainCast,
    replies: flattenedReplies,
    allCasts: actualCasts,
    channelContext,
    isLoading: query.isLoading,
    error: query.error?.message ?? null,
    refetch: query.refetch,
  };
}
