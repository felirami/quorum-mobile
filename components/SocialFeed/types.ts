import type { EmbeddedCast } from '@/hooks/useFarcasterFeed';

export type FeedFilter = 'all' | 'media' | 'node-ops' | 'events';

export interface VideoEmbed {
  url?: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
  duration?: number;
}

export interface UrlEmbed {
  url?: string;
  title?: string;
  description?: string;
  domain?: string;
  image?: string;
  useLargeImage?: boolean;
  isFarcasterLink?: boolean;
  farcasterUsername?: string;
  farcasterCastHash?: string;
}

export interface QuoteCastEmbed {
  cast: EmbeddedCast;
  username: string;
  hashPrefix: string;
}

export interface FrameEmbedInfo {
  imageUrl: string;
  buttonTitle: string;
  actionUrl: string;
}

export interface FeedPost {
  id: string;
  hash: string;
  username: string;
  authorFid: number;
  authorName: string;
  authorHandle: string;
  authorAvatar?: string;
  channel?: string;
  isPro?: boolean;
  time: string;
  content: string;
  stats: {
    likes: string;
    replies: string;
    shares: string;
  };
  tags: string[];
  mediaUrls: string[];
  videos: VideoEmbed[];
  urlPreviews: UrlEmbed[];
  quoteCasts: QuoteCastEmbed[];
  frameEmbeds: FrameEmbedInfo[];
  filter: FeedFilter;
  viewerHasLiked?: boolean;
  viewerHasRecast?: boolean;
}

export interface ThreadInfo {
  username: string;
  castHashPrefix: string;
}

export interface MiniAppInfo {
  url: string;
}

export interface ProfileInfo {
  fid: number;
  username?: string;
}

export interface ChannelNavInfo {
  channelKey: string;
}

// Common navigation props used by views
export interface ViewNavigationProps {
  onOpenThread: (username: string, hashPrefix: string) => void;
  onOpenMiniApp: (url: string) => void;
  onOpenProfile: (fid: number, username?: string) => void;
  onOpenChannel: (channelKey: string) => void;
  likeStates: Map<string, { liked: boolean; count: number }>;
  onLikeToggle: (castHash: string, currentlyLiked: boolean, currentCount: number) => void;
}
