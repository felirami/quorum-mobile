/**
 * Down-conversion: NormalizedCast (the shape returned by quorum-shared's
 * hypersnap hooks) → FarcasterCast (the legacy shape that existing UI
 * components consume).
 *
 * Lets us route reads through hypersnap-with-fallback while keeping the
 * UI's render code untouched. Per-screen migrations to NormalizedCast can
 * happen at their own pace.
 */

import type { NormalizedCast } from '@quilibrium/quorum-shared';
import type { EmbeddedCast, FarcasterCast } from '@/hooks/useFarcasterFeed';

export function normalizedCastToLegacy(cast: NormalizedCast): FarcasterCast {
  const author = {
    fid: cast.author.fid,
    displayName: cast.author.displayName,
    username: cast.author.username,
    pfp: cast.author.pfpUrl ? { url: cast.author.pfpUrl } : undefined,
    viewerContext: cast.author.viewerFollows !== undefined
      ? { following: cast.author.viewerFollows }
      : undefined,
  };

  const images: { url?: string; alt?: string }[] = [];
  const videos: { url?: string; sourceUrl?: string; thumbnailUrl?: string; width?: number; height?: number; duration?: number; type?: string }[] = [];
  const urls: NonNullable<NonNullable<FarcasterCast['embeds']>['urls']> = [];
  const quoteCasts: EmbeddedCast[] = [];

  for (const e of cast.embeds) {
    if (e.image?.url) {
      images.push({ url: e.image.url, alt: e.image.alt });
      continue;
    }
    if (e.video?.url || e.video?.sourceUrl) {
      videos.push({
        url: e.video.url,
        sourceUrl: e.video.sourceUrl,
        thumbnailUrl: e.video.thumbnailUrl,
        width: e.video.width,
        height: e.video.height,
      });
      continue;
    }
    if (e.url) {
      urls.push({
        openGraph: e.openGraph
          ? {
              url: e.url,
              sourceUrl: e.openGraph.sourceUrl,
              title: e.openGraph.title,
              description: e.openGraph.description,
              domain: e.openGraph.domain,
              image: e.openGraph.image,
              frameEmbedNext: e.frame
                ? { frameUrl: e.url, frameEmbed: e.frame }
                : undefined,
            }
          : undefined,
      });
      continue;
    }
    if (e.castId) {
      // Quote-cast embeds need an author + text to render; hypersnap
      // doesn't include the full quoted cast inline. UI gracefully
      // handles a stub.
      quoteCasts.push({
        hash: e.castId.hash,
        author: {
          fid: e.castId.fid,
          displayName: '',
          username: '',
        },
        text: '',
        timestamp: 0,
      });
    }
  }

  return {
    hash: cast.hash,
    timestamp: cast.timestamp,
    text: cast.text,
    author,
    channel: cast.channel
      ? { key: cast.channel.key, name: cast.channel.name }
      : undefined,
    embeds: (images.length || videos.length || urls.length || quoteCasts.length)
      ? {
          images: images.length ? images : undefined,
          videos: videos.length ? videos : undefined,
          urls: urls.length ? urls : undefined,
          casts: quoteCasts.length ? quoteCasts : undefined,
        }
      : undefined,
    replies: cast.reactions.repliesCount > 0
      ? { count: cast.reactions.repliesCount }
      : undefined,
    reactions: cast.reactions.likesCount > 0
      ? { count: cast.reactions.likesCount }
      : undefined,
    recasts: cast.reactions.recastsCount > 0
      ? { count: cast.reactions.recastsCount }
      : undefined,
    viewerContext: (cast.reactions.viewerLiked !== undefined || cast.reactions.viewerRecasted !== undefined)
      ? {
          reacted: cast.reactions.viewerLiked,
          recast: cast.reactions.viewerRecasted,
        }
      : undefined,
  };
}
