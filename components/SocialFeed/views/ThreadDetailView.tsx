import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { IconSymbol } from '@/components/ui/IconSymbol';
import { useFarcasterThread, type FlattenedCast } from '@/hooks/useFarcasterThread';
import type { EmbeddedCast } from '@/hooks/useFarcasterFeed';
import { ImageViewer, AutoHeightImage, ImageCarousel, VideoPlayer } from '../media';
import { CastText, LinkPreview, QuoteCast, FrameEmbed } from '../content';
import { SCREEN_HEIGHT, formatTimestamp, lookupUserByUsername } from '../utils';

const AVATAR_FALLBACK = require('@/assets/images/quorum-symbol-bg-blue.png');

interface ThreadDetailViewProps {
  username: string;
  castHashPrefix: string;
  token?: string;
  theme: any;
  onClose: () => void;
  onOpenMiniApp: (url: string) => void;
  onOpenProfile: (fid: number, username?: string) => void;
  onOpenChannel: (channelKey: string) => void;
  likeStates: Map<string, { liked: boolean; count: number }>;
  onLikeToggle: (castHash: string, currentlyLiked: boolean, currentCount: number) => void;
  bottomInset?: number;
}

export function ThreadDetailView({
  username,
  castHashPrefix,
  token,
  theme,
  onClose,
  onOpenMiniApp,
  onOpenProfile,
  onOpenChannel,
  likeStates,
  onLikeToggle,
  bottomInset = 0,
}: ThreadDetailViewProps) {
  const { mainCast, replies, isLoading, error, channelContext } = useFarcasterThread({
    username,
    castHashPrefix,
    token,
  });

  const [viewerImage, setViewerImage] = useState<string | null>(null);
  const [selectedThread, setSelectedThread] = useState<{ username: string; castHashPrefix: string } | null>(null);

  const handleMentionPress = async (mentionUsername: string) => {
    const fid = await lookupUserByUsername(mentionUsername);
    if (fid) {
      onOpenProfile(fid, mentionUsername);
    }
  };

  const renderCast = (cast: FlattenedCast, isMain = false) => {
    const imageUrls = (cast.embeds?.images ?? [])
      .map((img) => img.url)
      .filter((url): url is string => Boolean(url));
    const hasImages = imageUrls.length > 0;
    const videos = (cast.embeds?.videos ?? []).filter((v) => v.url && v.thumbnailUrl);
    const hasVideos = videos.length > 0;

    const frameEmbeds = (cast.embeds?.urls ?? [])
      .filter((u) => u.openGraph?.frameEmbedNext?.frameEmbed)
      .map((u) => ({
        imageUrl: u.openGraph!.frameEmbedNext!.frameEmbed!.imageUrl!,
        buttonTitle: u.openGraph!.frameEmbedNext!.frameEmbed!.button?.title ?? 'Open',
        actionUrl: u.openGraph!.frameEmbedNext!.frameEmbed!.button?.action?.url ?? u.openGraph!.url!,
      }))
      .filter((f) => f.imageUrl);

    const urlPreviews = (cast.embeds?.urls ?? [])
      .filter((u) => u.openGraph?.title && !u.openGraph?.frameEmbedNext?.frameEmbed);

    const isNested = cast.depth > 0;
    const borderWidth = isNested ? Math.min(cast.depth * 2, 6) : 0;

    const optimistic = likeStates.get(cast.hash);
    const isLiked = optimistic?.liked ?? cast.viewerContext?.reacted ?? false;
    const likeCount = optimistic?.count ?? (cast.reactions?.count ?? 0);

    const channelName = cast.channel?.key || cast.channel?.name ||
      (isMain && channelContext ? (channelContext.key || channelContext.name) : null) ||
      (() => {
        if (cast.parentUrl) {
          const channelMatch = cast.parentUrl.match(/(?:farcaster|warpcast)\.(?:xyz|com)\/~\/channel\/([^\/\?]+)/);
          if (channelMatch) return channelMatch[1];
        }
        return null;
      })();

    return (
      <View
        key={cast.hash}
        style={{
          borderTopWidth: isMain ? 0 : 1,
          borderTopColor: theme.colors.surface3,
          paddingTop: isMain ? 0 : 12,
          paddingBottom: 14,
          borderLeftWidth: borderWidth,
          borderLeftColor: theme.colors.accent,
          paddingLeft: isNested ? 12 : 12,
          paddingRight: 12,
          gap: 10,
        }}
      >
        {/* Header row */}
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {isMain && (
            <TouchableOpacity onPress={onClose} style={{ marginRight: 12 }}>
              <IconSymbol name="chevron.left" color={theme.colors.textMain} size={24} />
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => onOpenProfile(cast.author.fid, cast.author.username)}>
            <Image
              source={cast.author.pfp?.url ? { uri: cast.author.pfp.url } : AVATAR_FALLBACK}
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                marginRight: 12,
                backgroundColor: theme.colors.surface3,
              }}
            />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <TouchableOpacity onPress={() => onOpenProfile(cast.author.fid, cast.author.username)}>
                <Text style={{ color: theme.colors.textStrong, fontWeight: '600', fontSize: 15 }}>
                  {cast.author.displayName}
                </Text>
              </TouchableOpacity>
              {channelName && (
                <TouchableOpacity onPress={() => onOpenChannel(channelName)}>
                  <Text style={{ color: theme.colors.accent, fontSize: 13 }}>
                    /{channelName}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
            <Text style={{ color: theme.colors.textMuted, fontSize: 13, marginTop: 2 }}>
              @{cast.author.username} • {formatTimestamp(cast.timestamp)}
            </Text>
          </View>
        </View>

        {/* Parent context */}
        {isMain && (() => {
          const isChannelUrl = cast.parentUrl?.match(/(?:farcaster|warpcast)\.(?:xyz|com)\/~\/channel\//);
          const showUrlContext = cast.parentUrl && !isChannelUrl;
          const showUserContext = cast.parentAuthor && !cast.parentUrl;

          if (!showUrlContext && !showUserContext) return null;

          return (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <IconSymbol
                name={showUrlContext ? 'link' : 'arrowshape.turn.up.left'}
                color={theme.colors.textMuted}
                size={14}
              />
              {showUrlContext ? (
                <Text style={{ color: theme.colors.textMuted, fontSize: 13 }} numberOfLines={1}>
                  replying to{' '}
                  <Text style={{ color: theme.colors.accent }}>
                    {(() => {
                      try {
                        return new URL(cast.parentUrl!).hostname.replace('www.', '');
                      } catch {
                        return cast.parentUrl;
                      }
                    })()}
                  </Text>
                </Text>
              ) : (
                <Text style={{ color: theme.colors.textMuted, fontSize: 13 }}>
                  replying to <Text style={{ color: theme.colors.accent }}>@{cast.parentAuthor!.username}</Text>
                </Text>
              )}
            </View>
          );
        })()}

        {/* Content */}
        {cast.text.length > 0 && (
          <CastText
            text={cast.text}
            style={{ color: theme.colors.textMain, fontSize: 15, lineHeight: 20 }}
            theme={theme}
            onMentionPress={handleMentionPress}
            onChannelPress={onOpenChannel}
          />
        )}

        {/* Images */}
        {hasImages && (
          <View style={{ marginHorizontal: -12 - borderWidth }}>
            {imageUrls.length === 1 ? (
              <AutoHeightImage
                uri={imageUrls[0]}
                maxHeight={SCREEN_HEIGHT * 0.8}
                style={{ backgroundColor: theme.colors.surface3 }}
                onPress={() => setViewerImage(imageUrls[0])}
              />
            ) : (
              <ImageCarousel
                urls={imageUrls}
                maxHeight={SCREEN_HEIGHT * 0.8}
                theme={theme}
                onImagePress={setViewerImage}
              />
            )}
          </View>
        )}

        {/* Videos */}
        {hasVideos && (
          <View style={{ marginHorizontal: -12 - borderWidth }}>
            {videos.map((video, index) => (
              <VideoPlayer
                key={index}
                url={video.url!}
                thumbnailUrl={video.thumbnailUrl!}
                width={video.width}
                height={video.height}
                theme={theme}
              />
            ))}
          </View>
        )}

        {/* Frame embeds */}
        {frameEmbeds.length > 0 && (
          <View style={{ marginHorizontal: -12 - borderWidth, gap: 8 }}>
            {frameEmbeds.map((frame, index) => (
              <FrameEmbed
                key={index}
                imageUrl={frame.imageUrl}
                buttonTitle={frame.buttonTitle}
                actionUrl={frame.actionUrl}
                theme={theme}
                onPress={() => onOpenMiniApp(frame.actionUrl)}
              />
            ))}
          </View>
        )}

        {/* URL previews */}
        {urlPreviews.length > 0 && (
          <View style={{ gap: 8 }}>
            {urlPreviews.map((urlEmbed, index) => {
              const linkUrl = urlEmbed.openGraph?.url || urlEmbed.openGraph?.sourceUrl;
              return (
                <LinkPreview
                  key={index}
                  url={linkUrl}
                  title={urlEmbed.openGraph?.title}
                  description={urlEmbed.openGraph?.description}
                  domain={urlEmbed.openGraph?.domain}
                  image={urlEmbed.openGraph?.image}
                  useLargeImage={urlEmbed.openGraph?.useLargeImage}
                  theme={theme}
                  onPress={linkUrl ? () => onOpenMiniApp(linkUrl) : undefined}
                />
              );
            })}
          </View>
        )}

        {/* Quote casts */}
        {cast.embeds?.casts && cast.embeds.casts.length > 0 && (
          <View style={{ gap: 8 }}>
            {cast.embeds.casts.map((embeddedCast, index) => (
              <QuoteCast
                key={index}
                cast={embeddedCast as EmbeddedCast}
                theme={theme}
                onPress={() => setSelectedThread({
                  username: embeddedCast.author.username,
                  castHashPrefix: embeddedCast.hash.slice(0, 10),
                })}
              />
            ))}
          </View>
        )}

        {/* Stats row */}
        <View style={{ flexDirection: 'row', gap: 16, marginTop: 4 }}>
          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
            onPress={() => onLikeToggle(cast.hash, isLiked, likeCount)}
          >
            <IconSymbol
              name={isLiked ? 'heart.fill' : 'heart'}
              color={isLiked ? theme.colors.danger : theme.colors.textMuted}
              size={16}
            />
            {likeCount > 0 && (
              <Text style={{ color: theme.colors.textMuted, fontSize: 13 }}>{likeCount}</Text>
            )}
          </TouchableOpacity>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <IconSymbol name="bubble.left" color={theme.colors.textMuted} size={16} />
            {(cast.replies?.count ?? 0) > 0 && (
              <Text style={{ color: theme.colors.textMuted, fontSize: 13 }}>{cast.replies?.count}</Text>
            )}
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      {isLoading && (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator color={theme.colors.accent} />
        </View>
      )}

      {error && (
        <View style={{ padding: 20 }}>
          <Text style={{ color: theme.colors.danger }}>{error}</Text>
        </View>
      )}

      {mainCast && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 32 + bottomInset }}>
          {renderCast({ ...mainCast, depth: 0 }, true)}
          {replies.length > 0 && (
            <View>
              {replies.map((reply) => renderCast(reply))}
            </View>
          )}
        </ScrollView>
      )}

      <ImageViewer
        visible={viewerImage !== null}
        imageUrl={viewerImage}
        onClose={() => setViewerImage(null)}
      />
    </View>
  );
}

export default ThreadDetailView;
