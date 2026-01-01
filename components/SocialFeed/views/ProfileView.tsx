import React, { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { IconSymbol } from '@/components/ui/IconSymbol';
import { useFarcasterProfile, type ProfileCast } from '@/hooks/useFarcasterProfile';
import type { EmbeddedCast } from '@/hooks/useFarcasterFeed';
import { ImageViewer, AutoHeightImage, ImageCarousel, VideoPlayer } from '../media';
import { CastText, LinkPreview, QuoteCast, FrameEmbed } from '../content';
import { SCREEN_WIDTH, SCREEN_HEIGHT, formatTimestamp, lookupUserByUsername } from '../utils';

const AVATAR_FALLBACK = require('@/assets/images/quorum-symbol-bg-blue.png');

interface ProfileViewProps {
  fid: number;
  token?: string;
  theme: any;
  onClose: () => void;
  onOpenThread: (username: string, hashPrefix: string) => void;
  onOpenMiniApp: (url: string) => void;
  onOpenProfile: (fid: number, username?: string) => void;
  onOpenChannel: (channelKey: string) => void;
  likeStates: Map<string, { liked: boolean; count: number }>;
  onLikeToggle: (castHash: string, currentlyLiked: boolean, currentCount: number) => void;
  bottomInset?: number;
}

export function ProfileView({
  fid,
  token,
  theme,
  onClose,
  onOpenThread,
  onOpenMiniApp,
  onOpenProfile,
  onOpenChannel,
  likeStates,
  onLikeToggle,
  bottomInset = 0,
}: ProfileViewProps) {
  const {
    author,
    casts,
    isLoading,
    isFetchingNextPage,
    error,
    hasNextPage,
    fetchNextPage,
  } = useFarcasterProfile({ fid, token });

  const [viewerImage, setViewerImage] = useState<string | null>(null);

  const handleMentionPress = async (username: string) => {
    const userFid = await lookupUserByUsername(username);
    if (userFid) {
      onOpenProfile(userFid, username);
    }
  };

  const renderProfileHeader = () => {
    if (!author) return null;

    return (
      <View style={{ backgroundColor: theme.colors.background }}>
        {/* Banner */}
        <TouchableOpacity
          activeOpacity={author.profile?.bannerImageUrl ? 0.8 : 1}
          onPress={() => author.profile?.bannerImageUrl && setViewerImage(author.profile.bannerImageUrl)}
          style={{ width: SCREEN_WIDTH, height: 120 }}
        >
          {author.profile?.bannerImageUrl ? (
            <Image
              source={{ uri: author.profile.bannerImageUrl }}
              style={{ width: '100%', height: '100%', backgroundColor: theme.colors.surface3 }}
              resizeMode="cover"
            />
          ) : (
            <View style={{ width: '100%', height: '100%', backgroundColor: theme.colors.accent, opacity: 0.3 }} />
          )}
        </TouchableOpacity>

        {/* Avatar */}
        <View style={{ paddingHorizontal: 16, marginTop: -40 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => author.pfp?.url && setViewerImage(author.pfp.url)}
            >
              <Image
                source={author.pfp?.url ? { uri: author.pfp.url } : AVATAR_FALLBACK}
                style={{
                  width: 80,
                  height: 80,
                  borderRadius: 40,
                  borderWidth: 4,
                  borderColor: theme.colors.background,
                  backgroundColor: theme.colors.surface3,
                }}
              />
            </TouchableOpacity>
          </View>

          {/* Name and username */}
          <View style={{ marginTop: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{ color: theme.colors.textStrong, fontSize: 22, fontWeight: '700' }}>
                {author.displayName}
              </Text>
              {author.profile?.accountLevel === 'pro' && (
                <IconSymbol name="star.fill" color={theme.colors.warning} size={16} />
              )}
            </View>
            <Text style={{ color: theme.colors.textMuted, fontSize: 15, marginTop: 2 }}>
              @{author.username}
            </Text>
          </View>

          {/* Bio */}
          {author.profile?.bio?.text && (
            <Text style={{ color: theme.colors.textMain, fontSize: 15, lineHeight: 21, marginTop: 12 }}>
              {author.profile.bio.text}
            </Text>
          )}

          {/* Location */}
          {author.profile?.location?.description && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 }}>
              <IconSymbol name="mappin" color={theme.colors.textMuted} size={14} />
              <Text style={{ color: theme.colors.textMuted, fontSize: 13 }}>
                {author.profile.location.description}
              </Text>
            </View>
          )}

          {/* Follower/Following counts */}
          <View style={{ flexDirection: 'row', gap: 16, marginTop: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={{ color: theme.colors.textStrong, fontWeight: '600', fontSize: 15 }}>
                {(author.followingCount ?? 0).toLocaleString()}
              </Text>
              <Text style={{ color: theme.colors.textMuted, fontSize: 14 }}>Following</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={{ color: theme.colors.textStrong, fontWeight: '600', fontSize: 15 }}>
                {(author.followerCount ?? 0).toLocaleString()}
              </Text>
              <Text style={{ color: theme.colors.textMuted, fontSize: 14 }}>Followers</Text>
            </View>
          </View>
        </View>

        <View style={{ height: 1, backgroundColor: theme.colors.surface3, marginTop: 16 }} />
      </View>
    );
  };

  const renderCast = (cast: ProfileCast) => {
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

    const quoteCasts = cast.embeds?.casts ?? [];

    const navigateToThread = () => {
      if (cast.author.username && cast.hash) {
        onOpenThread(cast.author.username, cast.hash.slice(0, 10));
      }
    };

    const optimistic = likeStates.get(cast.hash);
    const isLiked = optimistic?.liked ?? cast.viewerContext?.reacted ?? false;
    const likeCount = optimistic?.count ?? (cast.reactions?.count ?? 0);

    return (
      <View
        key={cast.hash}
        style={{
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.surface3,
          paddingTop: 12,
          paddingBottom: 14,
          paddingHorizontal: 12,
          gap: 10,
        }}
      >
        <Pressable onPress={navigateToThread}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
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
                {cast.channel?.key && (
                  <TouchableOpacity onPress={() => onOpenChannel(cast.channel!.key!)}>
                    <Text style={{ color: theme.colors.accent, fontSize: 13 }}>/{cast.channel.key}</Text>
                  </TouchableOpacity>
                )}
              </View>
              <Text style={{ color: theme.colors.textMuted, fontSize: 13, marginTop: 2 }}>
                @{cast.author.username} • {formatTimestamp(cast.timestamp)}
              </Text>
            </View>
          </View>
        </Pressable>

        <Pressable onPress={navigateToThread}>
          {cast.text.length > 0 && (
            <CastText
              text={cast.text}
              style={{ color: theme.colors.textMain, fontSize: 15, lineHeight: 20 }}
              theme={theme}
              onMentionPress={handleMentionPress}
              onChannelPress={onOpenChannel}
            />
          )}
        </Pressable>

        {hasImages && (
          <View style={{ marginHorizontal: -12 }}>
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

        {hasVideos && (
          <View style={{ marginHorizontal: -12 }}>
            {videos.map((video, index) => (
              <VideoPlayer
                key={index}
                url={video.url!}
                thumbnailUrl={video.thumbnailUrl!}
                width={video.width}
                height={video.height}
                duration={video.duration}
                theme={theme}
              />
            ))}
          </View>
        )}

        {frameEmbeds.length > 0 && (
          <View style={{ marginHorizontal: -12, gap: 8 }}>
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

        {quoteCasts.length > 0 && (
          <View style={{ gap: 8 }}>
            {quoteCasts.map((embeddedCast, index) => (
              <QuoteCast
                key={index}
                cast={embeddedCast as EmbeddedCast}
                theme={theme}
                onPress={() => onOpenThread(embeddedCast.author.username, embeddedCast.hash.slice(0, 10))}
              />
            ))}
          </View>
        )}

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
          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
            onPress={navigateToThread}
          >
            <IconSymbol name="bubble.left" color={theme.colors.textMuted} size={16} />
            {(cast.replies?.count ?? 0) > 0 && (
              <Text style={{ color: theme.colors.textMuted, fontSize: 13 }}>{cast.replies?.count}</Text>
            )}
          </TouchableOpacity>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <IconSymbol
              name={cast.viewerContext?.recast ? 'arrowshape.turn.up.right.fill' : 'arrowshape.turn.up.right'}
              color={cast.viewerContext?.recast ? theme.colors.success : theme.colors.textMuted}
              size={16}
            />
            {(cast.recasts?.count ?? 0) > 0 && (
              <Text style={{ color: theme.colors.textMuted, fontSize: 13 }}>{cast.recasts?.count}</Text>
            )}
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      {isLoading && casts.length === 0 && (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator color={theme.colors.accent} />
        </View>
      )}

      {error && (
        <View style={{ padding: 20 }}>
          <Text style={{ color: theme.colors.danger }}>{error}</Text>
        </View>
      )}

      <FlatList
        data={casts}
        keyExtractor={(item) => item.hash}
        ListHeaderComponent={renderProfileHeader}
        renderItem={({ item }) => renderCast(item)}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 32 + bottomInset }}
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage) {
            fetchNextPage();
          }
        }}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          isFetchingNextPage ? (
            <View style={{ paddingVertical: 20, alignItems: 'center' }}>
              <ActivityIndicator color={theme.colors.accent} />
            </View>
          ) : null
        }
      />

      {/* Back button */}
      <TouchableOpacity
        onPress={onClose}
        style={{
          position: 'absolute',
          top: 12,
          left: 12,
          backgroundColor: 'rgba(0,0,0,0.5)',
          borderRadius: 20,
          padding: 8,
          zIndex: 10,
        }}
      >
        <IconSymbol name="chevron.left" color="#fff" size={20} />
      </TouchableOpacity>

      <ImageViewer
        visible={viewerImage !== null}
        imageUrl={viewerImage}
        onClose={() => setViewerImage(null)}
      />
    </View>
  );
}

export default ProfileView;
