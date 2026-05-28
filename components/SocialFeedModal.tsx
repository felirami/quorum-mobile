import BrowserModal from '@/components/BrowserModal';
import ComposeChannelPickerModal from '@/components/ComposeChannelPickerModal';
import { HeaderAvatar } from '@/components/HeaderAvatar';
import { InviteLinkCard, containsInviteLink } from '@/components/Chat/InviteLinkCard';
import type { ComposeCastOptions, ComposeCastResult } from '@/services/miniapp';
import { LikeIcon, getLikeIconType } from '@/components/SocialFeed/content/LikeIcon';
import { SnapEmbed, useSnapDetection } from '@/components/SocialFeed/content/SnapEmbed';
import { ImageViewer } from '@/components/SocialFeed/media/ImageViewer';
import { extractYouTubeMatchesFromText, YouTubeEmbed, parseYouTubeUrl } from '@/components/SocialFeed/media/YouTubeEmbed';
import { MentionAutocomplete, getMentionInfo, replaceMention, type MentionInfo } from '@/components/SocialFeed/MentionAutocomplete';
import { GovernanceView, ProposalDetailView } from '@/components/SocialFeed/views';
import { CachedAvatar } from '@/components/ui/CachedAvatar';
import { IconSymbol, type IconSymbolName } from '@/components/ui/IconSymbol';
import { useAuth } from '@/context/AuthContext';
import { useConversations, type ConversationWithPreview } from '@/hooks/chat/useConversations';
import { useFarcasterConversations, useSendFarcasterDirectCast } from '@/hooks/chat/useFarcasterDirectCasts';
import { useSendDirectMessage } from '@/hooks/chat/useSendDirectMessage';
import { useSendSpaceMessage } from '@/hooks/chat/useSendSpaceMessage';
import { useSpaces } from '@/hooks/chat/useSpaces';
import { useFarcasterChannel, type ChannelCast } from '@/hooks/useFarcasterChannel';
import { useFarcasterFeed, type EmbeddedCast } from '@/hooks/useFarcasterFeed';
import { useFarcasterProfile, type ProfileCast } from '@/hooks/useFarcasterProfile';
import {
  useDebouncedValue,
  useSearchCasts,
  useSearchChannels,
  useSearchSummary,
  useSearchUsers,
  useUserFollowedChannels,
  type SearchCast,
  type SearchChannel,
  type SearchUser,
} from '@/hooks/useFarcasterSearch';
import { parseFarcasterUrl, useFarcasterThread, type FlattenedCast } from '@/hooks/useFarcasterThread';
import { useFarcasterCastLimits, isLongCast } from '@/hooks/useFarcasterPro';
import { followUser, likeCast, postFarcasterCast, recastCast, unlikeCast, unrecastCast, uploadImageForCast } from '@/services/farcasterClient';
import { pickImage, type ProcessedAttachment } from '@/services/media/imageAttachment';
import { useTheme, type AppTheme } from '@/theme';
import type { EdgeInsets } from 'react-native-safe-area-context';
import type { Channel, Space } from '@quilibrium/quorum-shared';
import { useVideoPlayer, VideoView } from 'expo-video';
import { setAudioModeAsync } from 'expo-audio';
import { Image as ExpoImage } from 'expo-image';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type ImageStyle,
  type KeyboardEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import ReanimatedModule, { runOnJS, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { ReportModal } from '@/components/ReportModal';

const ReanimatedView = ReanimatedModule.View;

const SCREEN_WIDTH = Dimensions.get('window').width;
const SCREEN_HEIGHT = Dimensions.get('window').height;

// Configure audio mode for silent switch (one-time setup)
let audioModeConfigured = false;
async function ensureAudioMode() {
  if (audioModeConfigured) return;
  try {
    await setAudioModeAsync({
      playsInSilentMode: true,
      interruptionMode: 'duckOthers',
      allowsRecording: false,
    });
    audioModeConfigured = true;
  } catch (e) {
    // Silently fail - audio will still work, just not in silent mode
  }
}

// Cache for image dimensions to prevent recalculation during scroll
const imageDimensionCache = new Map<string, number>();

function AutoHeightImage({ uri, maxHeight, maxWidth = SCREEN_WIDTH, style, onPress }: { uri: string; maxHeight: number; maxWidth?: number; style?: StyleProp<ImageStyle>; onPress?: () => void }) {
  const cacheKey = `${uri}:${maxWidth}`;
  const cachedHeight = imageDimensionCache.get(cacheKey);
  const [height, setHeight] = useState<number>(cachedHeight ?? 250);

  useEffect(() => {
    // Skip if already cached
    if (imageDimensionCache.has(cacheKey)) {
      setHeight(imageDimensionCache.get(cacheKey)!);
      return;
    }

    Image.getSize(
      uri,
      (width, imgHeight) => {
        const aspectRatio = imgHeight / width;
        const calculatedHeight = Math.min(maxWidth * aspectRatio, maxHeight);
        imageDimensionCache.set(cacheKey, calculatedHeight);
        setHeight(calculatedHeight);
      },
      () => {
        imageDimensionCache.set(cacheKey, 250);
        setHeight(250); // fallback
      }
    );
  }, [uri, maxHeight, maxWidth, cacheKey]);

  const imageElement = (
    <Image
      source={{ uri }}
      style={[style, { width: maxWidth, height }]}
      resizeMode="cover"
    />
  );

  if (onPress) {
    return (
      <TouchableOpacity activeOpacity={0.9} onPress={onPress}>
        {imageElement}
      </TouchableOpacity>
    );
  }

  return imageElement;
}

function ImageCarousel({ urls, maxHeight, theme, onImagePress }: { urls: string[]; maxHeight: number; theme: AppTheme; onImagePress?: (url: string, index: number) => void }) {
  const [activeIndex, setActiveIndex] = useState(0);

  const handleScroll = useCallback((event: { nativeEvent: { contentOffset: { x: number } } }) => {
    const contentOffsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(contentOffsetX / SCREEN_WIDTH);
    setActiveIndex(index);
  }, []);

  return (
    <View style={{ width: SCREEN_WIDTH }}>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        decelerationRate="fast"
        snapToInterval={SCREEN_WIDTH}
        snapToAlignment="start"
        contentContainerStyle={{ width: SCREEN_WIDTH * urls.length }}
      >
        {urls.map((url, index) => (
          <View
            key={index}
            style={{
              width: SCREEN_WIDTH,
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <AutoHeightImage
              uri={url}
              maxHeight={maxHeight}
              maxWidth={SCREEN_WIDTH}
              style={{ backgroundColor: theme.colors.surface3 }}
              onPress={onImagePress ? () => onImagePress(url, index) : undefined}
            />
          </View>
        ))}
      </ScrollView>
      <View style={{
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 12,
        gap: 6,
      }}>
        {urls.map((_, index) => (
          <View
            key={index}
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: index === activeIndex ? theme.colors.textMain : theme.colors.surface4,
            }}
          />
        ))}
      </View>
    </View>
  );
}

function formatDuration(ms?: number): string {
  if (!ms) return '';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

// Parse cast text and render @mentions and /channels as tappable links
function CastText({
  text,
  style,
  theme,
  onMentionPress,
  onChannelPress,
  onLinkPress,
}: {
  text: string;
  style?: StyleProp<ViewStyle>;
  theme: AppTheme;
  onMentionPress?: (username: string) => void;
  onChannelPress?: (channelKey: string) => void;
  onLinkPress?: (url: string) => void;
}) {
  // Match URLs, @mentions (after whitespace/start), and /channels (after whitespace/start)
  // URLs are matched first to prevent their paths being parsed as channels
  const parts: { type: 'text' | 'mention' | 'channel' | 'link' | 'inviteLink'; value: string }[] = [];
  let lastIndex = 0;

  const combinedRegex = /(https?:\/\/[^\s]+)|(?<=^|[\s])(@[a-zA-Z0-9._-]+)|(?<=^|[\s])(\/[a-zA-Z0-9_-]+)/g;
  let match;

  while ((match = combinedRegex.exec(text)) !== null) {
    // Add text before this match
    if (match.index > lastIndex) {
      parts.push({ type: 'text', value: text.slice(lastIndex, match.index) });
    }

    // Add the match itself
    if (match[1]) {
      // URL - check if it's a Quorum invite link
      const url = match[1];
      if (containsInviteLink(url)) {
        parts.push({ type: 'inviteLink', value: url });
      } else {
        parts.push({ type: 'link', value: url });
      }
    } else if (match[2]) {
      // @mention
      parts.push({ type: 'mention', value: match[2].slice(1) }); // Remove @ prefix
    } else if (match[3]) {
      // /channel
      parts.push({ type: 'channel', value: match[3].slice(1) }); // Remove / prefix
    }

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push({ type: 'text', value: text.slice(lastIndex) });
  }

  // Check if we have any invite links - if so, we need to render as View with blocks
  const hasInviteLinks = parts.some(p => p.type === 'inviteLink');

  if (hasInviteLinks) {
    // Group consecutive non-invite parts into text blocks
    const blocks: { type: 'textBlock' | 'inviteLink'; parts?: typeof parts; value?: string }[] = [];
    let currentTextParts: typeof parts = [];

    for (const part of parts) {
      if (part.type === 'inviteLink') {
        // Flush any accumulated text parts
        if (currentTextParts.length > 0) {
          blocks.push({ type: 'textBlock', parts: currentTextParts });
          currentTextParts = [];
        }
        blocks.push({ type: 'inviteLink', value: part.value });
      } else {
        currentTextParts.push(part);
      }
    }
    // Flush remaining text parts
    if (currentTextParts.length > 0) {
      blocks.push({ type: 'textBlock', parts: currentTextParts });
    }

    return (
      <View style={{ gap: 8 }}>
        {blocks.map((block, blockIndex) => {
          if (block.type === 'inviteLink') {
            return <InviteLinkCard key={blockIndex} inviteLink={block.value!} />;
          }
          // Render text block
          return (
            <Text key={blockIndex} style={style}>
              {block.parts!.map((part, index) => {
                if (part.type === 'link') {
                  return (
                    <Text
                      key={index}
                      style={{ color: theme.colors.accent }}
                      onPress={() => onLinkPress?.(part.value)}
                    >
                      {part.value}
                    </Text>
                  );
                } else if (part.type === 'mention') {
                  return (
                    <Text
                      key={index}
                      style={{ color: theme.colors.accent }}
                      onPress={() => onMentionPress?.(part.value)}
                    >
                      @{part.value}
                    </Text>
                  );
                } else if (part.type === 'channel') {
                  return (
                    <Text
                      key={index}
                      style={{ color: theme.colors.accent }}
                      onPress={() => onChannelPress?.(part.value)}
                    >
                      /{part.value}
                    </Text>
                  );
                }
                return <Text key={index}>{part.value}</Text>;
              })}
            </Text>
          );
        })}
      </View>
    );
  }

  // No invite links - render normally as a single Text
  return (
    <Text style={style}>
      {parts.map((part, index) => {
        if (part.type === 'link') {
          return (
            <Text
              key={index}
              style={{ color: theme.colors.accent }}
              onPress={() => onLinkPress?.(part.value)}
            >
              {part.value}
            </Text>
          );
        } else if (part.type === 'mention') {
          return (
            <Text
              key={index}
              style={{ color: theme.colors.accent }}
              onPress={() => onMentionPress?.(part.value)}
            >
              @{part.value}
            </Text>
          );
        } else if (part.type === 'channel') {
          return (
            <Text
              key={index}
              style={{ color: theme.colors.accent }}
              onPress={() => onChannelPress?.(part.value)}
            >
              /{part.value}
            </Text>
          );
        }
        return <Text key={index}>{part.value}</Text>;
      })}
    </Text>
  );
}

// Share action sheet for recast/quote/share options
interface ShareActionSheetProps {
  visible: boolean;
  castHash: string;
  castAuthor: string;
  isRecasted: boolean;
  recastCount: number;
  token?: string;
  theme: AppTheme;
  bottomInset: number;
  onClose: () => void;
  onRecast: () => void;
  onQuote: () => void;
  onShareToChat: () => void;
  onNativeShare: () => void;
  onReport?: () => void;
}

function ShareActionSheet({
  visible,
  castHash,
  castAuthor,
  isRecasted,
  recastCount,
  token,
  theme,
  bottomInset,
  onClose,
  onRecast,
  onQuote,
  onShareToChat,
  onNativeShare,
  onReport,
}: ShareActionSheetProps) {
  if (!visible) return null;

  const actions = [
    {
      icon: isRecasted ? 'arrowshape.turn.up.right.fill' : 'arrowshape.turn.up.right',
      label: isRecasted ? 'Undo recast' : 'Recast',
      color: isRecasted ? theme.colors.success : theme.colors.textMain,
      onPress: onRecast,
      disabled: !token,
    },
    {
      icon: 'quote.bubble',
      label: 'Quote',
      color: theme.colors.textMain,
      onPress: onQuote,
      disabled: !token,
    },
    {
      icon: 'paperplane',
      label: 'Share to chat',
      color: theme.colors.textMain,
      onPress: onShareToChat,
      disabled: false,
    },
    {
      icon: 'square.and.arrow.up',
      label: 'Share',
      color: theme.colors.textMain,
      onPress: onNativeShare,
      disabled: false,
    },
    ...(onReport
      ? [
          {
            icon: 'flag' as const,
            label: 'Report',
            color: theme.colors.danger,
            onPress: onReport,
            disabled: false,
          },
        ]
      : []),
  ];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.5)',
          justifyContent: 'flex-end',
        }}
        onPress={onClose}
      >
        <View
          style={{
            backgroundColor: theme.colors.surface1,
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
            paddingTop: 12,
            paddingBottom: bottomInset + 12,
          }}
        >
          {/* Handle bar */}
          <View
            style={{
              width: 36,
              height: 4,
              backgroundColor: theme.colors.surface4,
              borderRadius: 2,
              alignSelf: 'center',
              marginBottom: 16,
            }}
          />

          {actions.map((action, index) => (
            <TouchableOpacity
              key={index}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingVertical: 14,
                paddingHorizontal: 20,
                opacity: action.disabled ? 0.5 : 1,
              }}
              onPress={async () => {
                if (!action.disabled) {
                  onClose();
                  // Small delay to allow modal to close before showing native share
                  await new Promise(resolve => setTimeout(resolve, 100));
                  action.onPress();
                }
              }}
              disabled={action.disabled}
            >
              <IconSymbol
                name={action.icon as IconSymbolName}
                size={22}
                color={action.color}
              />
              <Text
                style={{
                  marginLeft: 16,
                  fontSize: 16,
                  color: action.color,
                  fontWeight: '500',
                }}
              >
                {action.label}
              </Text>
            </TouchableOpacity>
          ))}

          {/* Cancel button */}
          <TouchableOpacity
            style={{
              marginTop: 8,
              marginHorizontal: 16,
              paddingVertical: 14,
              backgroundColor: theme.colors.surface2,
              borderRadius: 12,
              alignItems: 'center',
            }}
            onPress={onClose}
          >
            <Text
              style={{
                fontSize: 16,
                fontWeight: '600',
                color: theme.colors.textMain,
              }}
            >
              Cancel
            </Text>
          </TouchableOpacity>
        </View>
      </Pressable>
    </Modal>
  );
}

// Share to chat modal - lets user pick a space/channel or DM to share the cast link
interface ShareToChatModalProps {
  visible: boolean;
  castUrl: string;
  theme: AppTheme;
  bottomInset: number;
  onClose: () => void;
  onSent: () => void;
}

function ShareToChatModal({
  visible,
  castUrl,
  theme,
  bottomInset,
  onClose,
  onSent,
}: ShareToChatModalProps) {
  const { data: conversationsData } = useConversations({ type: 'direct', enabled: visible });
  const { data: farcasterConversationsData } = useFarcasterConversations({ enabled: visible });
  const { data: spacesData } = useSpaces({ enabled: visible });
  const { mutateAsync: sendDirectMessage } = useSendDirectMessage();
  const { mutateAsync: sendFarcasterDirectCast } = useSendFarcasterDirectCast();
  const { mutateAsync: sendSpaceMessage } = useSendSpaceMessage();

  const [selectedSpace, setSelectedSpace] = useState<Space | null>(null);
  const [isSending, setIsSending] = useState(false);

  // Flatten conversations from pages
  const quorumConversations = useMemo(() => {
    return conversationsData?.pages.flatMap(page => page.conversations) ?? [];
  }, [conversationsData]);

  // Flatten Farcaster conversations from pages
  const farcasterConversations = useMemo(() => {
    return farcasterConversationsData?.pages.flatMap(page => page.conversations) ?? [];
  }, [farcasterConversationsData]);

  // Merge and sort all DMs by timestamp (newest first)
  const allDMs = useMemo(() => {
    const quorumWithSource = quorumConversations.map(conv => ({ ...conv, source: 'quorum' as const }));
    const farcasterWithSource = farcasterConversations.map(conv => ({ ...conv, source: 'farcaster' as const }));
    return [...quorumWithSource, ...farcasterWithSource].sort((a, b) => b.timestamp - a.timestamp);
  }, [quorumConversations, farcasterConversations]);

  const spaces = spacesData ?? [];

  // Get channels from selected space
  const channels = useMemo(() => {
    if (!selectedSpace) return [];
    return selectedSpace.groups?.flatMap(group => group.channels ?? []) ?? [];
  }, [selectedSpace]);

  const handleSelectDM = async (conversation: ConversationWithPreview) => {
    try {
      setIsSending(true);
      await sendDirectMessage({
        conversationId: conversation.conversationId,
        recipientAddress: conversation.address,
        text: castUrl,
      });
      onSent();
      onClose();
    } catch {
      // Mutation handles its own error state
    } finally {
      setIsSending(false);
    }
  };

  const handleSelectFarcasterDM = async (conversation: { conversationId: string; farcasterParticipantFids?: number[] }) => {
    try {
      setIsSending(true);
      // Extract the actual Farcaster conversation ID (remove 'farcaster:' prefix)
      const fcConversationId = conversation.conversationId.startsWith('farcaster:')
        ? conversation.conversationId.slice(10)
        : conversation.conversationId;
      const recipientFids = (conversation as any).farcasterParticipantFids ?? [];
      await sendFarcasterDirectCast({
        conversationId: fcConversationId,
        recipientFids,
        message: castUrl,
      });
      onSent();
      onClose();
    } catch {
      // Mutation handles its own error state
    } finally {
      setIsSending(false);
    }
  };

  const handleSelectChannel = async (channel: Channel) => {
    if (!selectedSpace) return;
    try {
      setIsSending(true);
      await sendSpaceMessage({
        spaceId: selectedSpace.spaceId,
        channelId: channel.channelId,
        text: castUrl,
      });
      onSent();
      onClose();
    } catch {
      // Mutation handles its own error state
    } finally {
      setIsSending(false);
    }
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }}>
        <View
          style={{
            flex: 1,
            marginTop: 100,
            backgroundColor: theme.colors.background,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
          }}
        >
          {/* Header */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 16,
              paddingVertical: 16,
              borderBottomWidth: 1,
              borderBottomColor: theme.colors.surface3,
            }}
          >
            {selectedSpace ? (
              <TouchableOpacity
                onPress={() => setSelectedSpace(null)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
              >
                <IconSymbol name="chevron.left" size={20} color={theme.colors.textMain} />
                <Text style={{ fontSize: 17, fontWeight: '600', color: theme.colors.textMain }}>
                  {selectedSpace.spaceName}
                </Text>
              </TouchableOpacity>
            ) : (
              <Text style={{ fontSize: 17, fontWeight: '600', color: theme.colors.textMain }}>
                Share to Chat
              </Text>
            )}
            <TouchableOpacity onPress={onClose}>
              <IconSymbol name="xmark" size={20} color={theme.colors.textMuted} />
            </TouchableOpacity>
          </View>

          {isSending && (
            <View style={{ padding: 20, alignItems: 'center' }}>
              <ActivityIndicator color={theme.colors.accent} />
              <Text style={{ color: theme.colors.textMuted, marginTop: 8 }}>Sending...</Text>
            </View>
          )}

          {!isSending && !selectedSpace && (
            <ScrollView style={{ flex: 1 }}>
              {/* Spaces Section */}
              {spaces.length > 0 && (
                <>
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: '600',
                      color: theme.colors.textMuted,
                      paddingHorizontal: 16,
                      paddingTop: 16,
                      paddingBottom: 8,
                    }}
                  >
                    SPACES
                  </Text>
                  {spaces.map((space) => (
                    <TouchableOpacity
                      key={space.spaceId}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        paddingHorizontal: 16,
                        paddingVertical: 12,
                        gap: 12,
                      }}
                      onPress={() => setSelectedSpace(space)}
                    >
                      <View
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: 8,
                          backgroundColor: theme.colors.accent,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>
                          {space.spaceName?.charAt(0).toUpperCase() ?? 'S'}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 15, fontWeight: '500', color: theme.colors.textMain }}>
                          {space.spaceName}
                        </Text>
                        <Text style={{ fontSize: 13, color: theme.colors.textMuted }}>
                          {space.groups?.reduce((acc, g) => acc + (g.channels?.length ?? 0), 0) ?? 0} channels
                        </Text>
                      </View>
                      <IconSymbol name="chevron.right" size={16} color={theme.colors.textMuted} />
                    </TouchableOpacity>
                  ))}
                </>
              )}

              {/* DMs Section - Merged and sorted by timestamp */}
              {allDMs.length > 0 && (
                <>
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: '600',
                      color: theme.colors.textMuted,
                      paddingHorizontal: 16,
                      paddingTop: 16,
                      paddingBottom: 8,
                    }}
                  >
                    DIRECT MESSAGES
                  </Text>
                  {allDMs.map((conv: any) => {
                    const isFarcaster = conv.source === 'farcaster';
                    return (
                      <TouchableOpacity
                        key={conv.conversationId}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          paddingHorizontal: 16,
                          paddingVertical: 12,
                          gap: 12,
                        }}
                        onPress={() => isFarcaster ? handleSelectFarcasterDM(conv) : handleSelectDM(conv)}
                      >
                        <View
                          style={{
                            width: 40,
                            height: 40,
                            borderRadius: 20,
                            backgroundColor: theme.colors.surface3,
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          {conv.icon ? (
                            <Image source={{ uri: conv.icon }} style={{ width: 40, height: 40, borderRadius: 20 }} />
                          ) : (
                            <IconSymbol name="person.fill" size={20} color={theme.colors.textMuted} />
                          )}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 15, fontWeight: '500', color: theme.colors.textMain }}>
                            {conv.displayName || (isFarcaster ? conv.farcasterUsername : conv.address?.slice(0, 12) + '...') || 'Unknown'}
                          </Text>
                          {isFarcaster && conv.farcasterUsername && conv.displayName !== conv.farcasterUsername && (
                            <Text style={{ fontSize: 13, color: theme.colors.textMuted }}>
                              @{conv.farcasterUsername}
                            </Text>
                          )}
                        </View>
                        {isFarcaster && (
                          <Image
                            source={require('../assets/images/farcaster.png')}
                            style={{ width: 18, height: 18, opacity: 0.7 }}
                          />
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </>
              )}

              {spaces.length === 0 && allDMs.length === 0 && (
                <View style={{ padding: 40, alignItems: 'center' }}>
                  <Text style={{ color: theme.colors.textMuted, textAlign: 'center' }}>
                    No conversations yet.{'\n'}Start a chat to share to it.
                  </Text>
                </View>
              )}
            </ScrollView>
          )}

          {/* Channel list when space is selected */}
          {!isSending && selectedSpace && (
            <ScrollView style={{ flex: 1 }}>
              {channels.map((channel) => (
                <TouchableOpacity
                  key={channel.channelId}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingHorizontal: 16,
                    paddingVertical: 12,
                    gap: 12,
                  }}
                  onPress={() => handleSelectChannel(channel)}
                >
                  <IconSymbol name="number" size={20} color={theme.colors.textMuted} />
                  <Text style={{ fontSize: 15, color: theme.colors.textMain }}>
                    {channel.channelName}
                  </Text>
                </TouchableOpacity>
              ))}
              {channels.length === 0 && (
                <View style={{ padding: 40, alignItems: 'center' }}>
                  <Text style={{ color: theme.colors.textMuted }}>No channels in this space</Text>
                </View>
              )}
            </ScrollView>
          )}

          {/* Bottom safe area */}
          <View style={{ height: bottomInset }} />
        </View>
      </View>
    </Modal>
  );
}

function VideoPlayer({
  url,
  thumbnailUrl,
  width,
  height,
  duration,
  theme
}: {
  url: string;
  thumbnailUrl: string;
  width?: number;
  height?: number;
  duration?: number;
  theme: AppTheme;
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const aspectRatio = width && height ? height / width : 9 / 16;
  const calculatedHeight = Math.min(SCREEN_WIDTH * aspectRatio, SCREEN_HEIGHT * 0.7);

  // Configure audio mode on mount
  useEffect(() => {
    ensureAudioMode();
  }, []);

  // Create video player
  const player = useVideoPlayer(url, (player) => {
    player.loop = false;
  });

  // Listen for playback status changes
  useEffect(() => {
    const subscription = player.addListener('playingChange', (event) => {
      setIsPlaying(event.isPlaying);
    });

    const endSubscription = player.addListener('playToEnd', () => {
      setIsPlaying(false);
      setHasStarted(false);
      player.currentTime = 0;
    });

    return () => {
      subscription.remove();
      endSubscription.remove();
    };
  }, [player]);

  const handleTap = () => {
    if (!hasStarted) {
      // First tap - start playing
      setHasStarted(true);
      setIsPlaying(true);
      player.play();
    } else if (isPlaying) {
      // Tap while playing - pause
      player.pause();
      setIsPlaying(false);
    } else {
      // Tap while paused - resume
      player.play();
      setIsPlaying(true);
    }
  };

  return (
    <Pressable onPress={handleTap} style={{ position: 'relative' }}>
      {!hasStarted ? (
        <>
          <Image
            source={{ uri: thumbnailUrl }}
            style={{
              width: SCREEN_WIDTH,
              height: calculatedHeight,
              backgroundColor: theme.colors.surface3,
            }}
            resizeMode="cover"
          />
          {/* Play button overlay */}
          <View
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              justifyContent: 'center',
              alignItems: 'center',
            }}
            pointerEvents="none"
          >
            <View style={{
              width: 60,
              height: 60,
              borderRadius: 30,
              backgroundColor: 'rgba(0, 0, 0, 0.6)',
              justifyContent: 'center',
              alignItems: 'center',
            }}>
              <IconSymbol name="play.fill" color="#fff" size={28} />
            </View>
          </View>
          {/* Duration badge */}
          {duration && duration > 0 && (
            <View style={{
              position: 'absolute',
              bottom: 8,
              right: 8,
              backgroundColor: 'rgba(0, 0, 0, 0.7)',
              paddingHorizontal: 6,
              paddingVertical: 2,
              borderRadius: 4,
            }}>
              <Text style={{ color: '#fff', fontSize: 12, fontWeight: '500' }}>
                {formatDuration(duration)}
              </Text>
            </View>
          )}
        </>
      ) : (
        <>
          <VideoView
            player={player}
            style={{
              width: SCREEN_WIDTH,
              height: calculatedHeight,
              backgroundColor: theme.colors.surface3,
            }}
            contentFit="contain"
            nativeControls={false}
          />
          {/* Pause indicator overlay - shown when paused */}
          {!isPlaying && (
            <View
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                justifyContent: 'center',
                alignItems: 'center',
              }}
              pointerEvents="none"
            >
              <View style={{
                width: 60,
                height: 60,
                borderRadius: 30,
                backgroundColor: 'rgba(0, 0, 0, 0.6)',
                justifyContent: 'center',
                alignItems: 'center',
              }}>
                <IconSymbol name="play.fill" color="#fff" size={28} />
              </View>
            </View>
          )}
        </>
      )}
    </Pressable>
  );
}

function LinkPreview({
  url,
  title,
  description,
  domain,
  image,
  useLargeImage,
  theme,
  onPress,
}: {
  url?: string;
  title?: string;
  description?: string;
  domain?: string;
  image?: string;
  useLargeImage?: boolean;
  theme: AppTheme;
  onPress?: () => void;
}) {
  if (!title) return null;

  const handlePress = () => {
    onPress?.();
  };

  if (useLargeImage && image) {
    return (
      <TouchableOpacity
        style={{
          backgroundColor: theme.colors.surface2,
          borderRadius: 12,
          overflow: 'hidden',
          marginHorizontal: 12,
        }}
        onPress={handlePress}
        activeOpacity={0.8}
      >
        <Image
          source={{ uri: image }}
          style={{
            width: '100%',
            height: 180,
            backgroundColor: theme.colors.surface3,
          }}
          resizeMode="cover"
        />
        <View style={{ padding: 12 }}>
          <Text
            style={{
              color: theme.colors.textStrong,
              fontSize: 15,
              fontWeight: '600',
              marginBottom: 4,
            }}
            numberOfLines={2}
          >
            {title}
          </Text>
          {description && (
            <Text
              style={{
                color: theme.colors.textMuted,
                fontSize: 13,
                lineHeight: 18,
                marginBottom: 4,
              }}
              numberOfLines={2}
            >
              {description}
            </Text>
          )}
          {domain && (
            <Text style={{ color: theme.colors.textMuted, fontSize: 12 }}>
              {domain}
            </Text>
          )}
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={{
        backgroundColor: theme.colors.surface2,
        borderRadius: 12,
        overflow: 'hidden',
        marginHorizontal: 12,
        flexDirection: 'row',
      }}
      onPress={handlePress}
      activeOpacity={0.8}
    >
      {image && (
        <Image
          source={{ uri: image }}
          style={{
            width: 100,
            height: 100,
            backgroundColor: theme.colors.surface3,
          }}
          resizeMode="cover"
        />
      )}
      <View style={{ flex: 1, padding: 12, justifyContent: 'center' }}>
        <Text
          style={{
            color: theme.colors.textStrong,
            fontSize: 14,
            fontWeight: '600',
            marginBottom: 4,
          }}
          numberOfLines={2}
        >
          {title}
        </Text>
        {description && (
          <Text
            style={{
              color: theme.colors.textMuted,
              fontSize: 12,
              lineHeight: 16,
              marginBottom: 4,
            }}
            numberOfLines={2}
          >
            {description}
          </Text>
        )}
        {domain && (
          <Text style={{ color: theme.colors.textMuted, fontSize: 11 }}>
            {domain}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

/**
 * Wraps a URL embed: probes for snap support and renders SnapEmbed if detected,
 * otherwise falls back to the regular LinkPreview.
 */
function SnapAwareUrlPreview({
  url,
  snapUrl,
  title,
  description,
  domain,
  image,
  useLargeImage,
  frameImageUrl,
  frameButtonTitle,
  frameActionUrl,
  theme,
  onPress,
  userFid,
  token,
  onOpenUrl,
  onOpenProfile,
  onOpenMiniApp,
}: {
  url?: string;
  snapUrl?: string;
  title?: string;
  description?: string;
  domain?: string;
  image?: string;
  useLargeImage?: boolean;
  frameImageUrl?: string;
  frameButtonTitle?: string;
  frameActionUrl?: string;
  theme: AppTheme;
  onPress?: () => void;
  userFid?: number;
  token?: string;
  onOpenUrl?: (url: string) => void;
  onOpenProfile?: (fid: number) => void;
  onOpenMiniApp?: (url: string) => void;
}) {
  // frameEmbedNext.frameUrl is shared between regular Farcaster frame/miniapp
  // embeds and Snap embeds — so it's only a candidate, not a guarantee. Probe
  // the URL's content-type to decide which renderer to use.
  const candidateUrl = snapUrl || url;
  const isSnap = useSnapDetection(candidateUrl);

  if (isSnap === true && candidateUrl) {
    return (
      <SnapEmbed
        url={candidateUrl}
        theme={theme}
        userFid={userFid}
        token={token}
        onOpenUrl={onOpenUrl}
        onOpenProfile={onOpenProfile}
        onOpenMiniApp={onOpenMiniApp}
      />
    );
  }

  // YouTube — render an inline player for raw YouTube URLs (incl. playlists)
  const youTube = parseYouTubeUrl(url);
  if (youTube) {
    return <YouTubeEmbed videoId={youTube.videoId} playlistId={youTube.playlistId} theme={theme} />;
  }

  // Frame v2 / miniapp card (only when not detected as a snap)
  if (frameImageUrl && frameActionUrl) {
    return (
      <FrameEmbed
        imageUrl={frameImageUrl}
        buttonTitle={frameButtonTitle ?? 'Open'}
        actionUrl={frameActionUrl}
        theme={theme}
        onPress={() => onOpenMiniApp?.(frameActionUrl)}
      />
    );
  }

  return (
    <LinkPreview
      url={url}
      title={title}
      description={description}
      domain={domain}
      image={image}
      useLargeImage={useLargeImage}
      theme={theme}
      onPress={onPress}
    />
  );
}

/**
 * Render inline YouTube players for any YouTube URLs that appear in the cast
 * body but aren't already covered by an explicit embed. Returns null when none.
 */
function InlineYouTubeFromText({
  text,
  excludeUrls,
  theme,
}: {
  text: string | undefined;
  excludeUrls: (string | undefined)[];
  theme: AppTheme;
}) {
  const matches = useMemo(
    () => extractYouTubeMatchesFromText(text, excludeUrls),
    [text, excludeUrls],
  );
  if (matches.length === 0) return null;
  return (
    <View style={{ gap: 8 }}>
      {matches.map(({ url, match }) => (
        <YouTubeEmbed
          key={url}
          videoId={match.videoId}
          playlistId={match.playlistId}
          theme={theme}
        />
      ))}
    </View>
  );
}

function QuoteCast({
  cast,
  theme,
  onPress,
}: {
  cast: EmbeddedCast;
  theme: AppTheme;
  onPress?: () => void;
}) {
  const hasImage = cast.embeds?.images && cast.embeds.images.length > 0;

  return (
    <TouchableOpacity
      style={{
        backgroundColor: theme.colors.surface2,
        borderRadius: 12,
        overflow: 'hidden',
        marginHorizontal: 12,
        borderWidth: 1,
        borderColor: theme.colors.surface3,
      }}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View style={{ padding: 12 }}>
        {/* Author row */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
          <CachedAvatar
            source={cast.author.pfp?.url ? { uri: cast.author.pfp.url } : null}
            style={{
              width: 24,
              height: 24,
              borderRadius: 12,
              marginRight: 8,
              backgroundColor: theme.colors.surface3,
            }}
          />
          <Text style={{ color: theme.colors.textStrong, fontWeight: '600', fontSize: 14 }}>
            {cast.author.displayName}
          </Text>
          <Text style={{ color: theme.colors.textMuted, fontSize: 13, marginLeft: 4 }}>
            @{cast.author.username}
          </Text>
        </View>
        {/* Cast text */}
        <Text
          style={{
            color: theme.colors.textMain,
            fontSize: 14,
            lineHeight: 20,
          }}
          numberOfLines={4}
        >
          {cast.text}
        </Text>
      </View>
      {/* Image preview */}
      {hasImage && cast.embeds?.images?.[0]?.url && (
        <Image
          source={{ uri: cast.embeds.images[0].url }}
          style={{
            width: '100%',
            height: 150,
            backgroundColor: theme.colors.surface3,
          }}
          resizeMode="cover"
        />
      )}
    </TouchableOpacity>
  );
}

function FrameEmbed({
  imageUrl,
  buttonTitle,
  actionUrl,
  theme,
  onPress,
}: {
  imageUrl: string;
  buttonTitle: string;
  actionUrl: string;
  theme: AppTheme;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.9}
      style={{ overflow: 'hidden' }}
    >
      <Image
        source={{ uri: imageUrl }}
        style={{
          width: SCREEN_WIDTH,
          height: SCREEN_WIDTH * 0.525, // Standard frame aspect ratio
          backgroundColor: theme.colors.surface3,
        }}
        resizeMode="cover"
      />
      <View
        style={{
          backgroundColor: theme.colors.surface2,
          paddingVertical: 12,
          paddingHorizontal: 16,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          borderTopWidth: 1,
          borderTopColor: theme.colors.surface3,
        }}
      >
        <Text
          style={{
            color: theme.colors.textStrong,
            fontSize: 15,
            fontWeight: '600',
          }}
        >
          {buttonTitle}
        </Text>
        <IconSymbol
          name="arrow.up.right"
          color={theme.colors.textMuted}
          size={14}
          style={{ marginLeft: 6 }}
        />
      </View>
    </TouchableOpacity>
  );
}

function ThreadDetailView({
  username,
  castHashPrefix,
  token,
  theme,
  onClose,
  onOpenMiniApp,
  onOpenProfile,
  onOpenChannel,
  onOpenThread,
  likeStates,
  onLikeToggle,
  onRecastToggle,
  recastStates,
  onQuoteCast,
  onShareToChat,
  followStates,
  onFollow,
  focusReply = false,
  placeholderCast,
  bottomInset = 0,
  currentUserFid,
  maxCastLength = DEFAULT_CAST_LENGTH,
  regularCastByteLimit = DEFAULT_CAST_LENGTH,
}: {
  username: string;
  castHashPrefix: string;
  token?: string;
  theme: AppTheme;
  onClose: () => void;
  onOpenMiniApp: (url: string) => void;
  onOpenProfile: (fid: number, username?: string) => void;
  onOpenChannel: (channelKey: string) => void;
  onOpenThread: (username: string, castHashPrefix: string, placeholderCast?: unknown) => void;
  likeStates: Map<string, { liked: boolean; count: number }>;
  onLikeToggle: (castHash: string, currentlyLiked: boolean, currentCount: number) => void;
  onRecastToggle: (castHash: string, currentlyRecasted: boolean, currentCount: number) => void;
  recastStates: Map<string, { recasted: boolean; count: number }>;
  onQuoteCast: (castHash: string, castAuthor: string, castText: string) => void;
  onShareToChat: (castUrl: string) => void;
  followStates: Map<number, boolean>;
  onFollow: (fid: number) => void;
  focusReply?: boolean;
  /** Optional cast snapshot from the surface that pushed this screen.
   *  Used as the mainCast while the network fetch is in flight so the
   *  user sees real content immediately instead of a blank spinner. */
  placeholderCast?: unknown;
  bottomInset?: number;
  currentUserFid?: number;
  maxCastLength?: number;
  regularCastByteLimit?: number;
}) {
  const { parentCasts, mainCast: fetchedMainCast, replies, isLoading, error, channelContext, refetch } = useFarcasterThread({
    username,
    castHashPrefix,
    token,
  });
  // Use the fetched cast once it arrives; fall back to the placeholder
  // for the loading window. Cast shapes from FeedPostCard / search /
  // channel are structurally compatible enough that the renderer below
  // tolerates either — it reads optional fields lazily.
  const mainCast = fetchedMainCast ?? (placeholderCast as typeof fetchedMainCast | undefined);

  // Get current user info for inline reply editor
  const { user: currentUser } = useAuth();
  // Fetch live Farcaster profile so the reply composer shows the user's
  // current Farcaster avatar (the cached pfpUrl in user state may be missing
  // or stale — falling back to it leaves CachedAvatar showing the Quorum
  // default symbol).
  const { author: currentFarcasterProfile } = useFarcasterProfile({
    fid: currentUser?.farcaster?.fid ?? 0,
    token,
    enabled: Boolean(currentUser?.farcaster?.fid),
  });
  const replyAvatarUri =
    currentFarcasterProfile?.pfp?.url ??
    currentUser?.farcaster?.pfpUrl ??
    null;
  const scrollViewRef = useRef<ScrollView>(null);
  const replyInputRef = useRef<TextInput>(null);
  const [isEditorFocused, setIsEditorFocused] = useState(false);
  // Track whether the inline reply editor is in the scroll viewport. Used
  // to hide the floating reply FAB when the user can already see the
  // composer (focus alone isn't enough — they may have scrolled to it
  // without focusing yet).
  const editorYRef = useRef<number | null>(null);
  const [isEditorVisible, setIsEditorVisible] = useState(false);

  // Tap target for both the floating FAB and the auto-scroll-on-mount
  // useEffect below. Focus first so the keyboard starts opening, then
  // scroll twice — once immediately, and once after the keyboard
  // transition completes so we land *above* the now-raised keyboard.
  const scrollToReplyAndFocus = useCallback(() => {
    replyInputRef.current?.focus();
    scrollViewRef.current?.scrollToEnd({ animated: true });
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 350);
  }, []);

  // Auto-scroll to reply editor and focus when navigated via reply button
  useEffect(() => {
    if (focusReply && mainCast && !isLoading) {
      const t = setTimeout(scrollToReplyAndFocus, 300);
      return () => clearTimeout(t);
    }
  }, [focusReply, mainCast, isLoading, scrollToReplyAndFocus]);

  // Reply state
  const [replyText, setReplyText] = useState('');
  const [replyCursorPosition, setReplyCursorPosition] = useState(0);
  const [isPosting, setIsPosting] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [replyImages, setReplyImages] = useState<ProcessedAttachment[]>([]);

  // Mention autocomplete state for reply
  const replyMentionInfo = useMemo(
    () => getMentionInfo(replyText, replyCursorPosition),
    [replyText, replyCursorPosition]
  );

  // Handle selecting a user mention in reply
  const handleReplySelectUser = useCallback((user: SearchUser) => {
    if (!replyMentionInfo) return;
    const newText = replaceMention(replyText, replyMentionInfo, user.username);
    setReplyText(newText.slice(0, maxCastLength));
    // Move cursor to after the inserted mention
    setReplyCursorPosition(replyMentionInfo.replaceStart + user.username.length + 1);
  }, [replyText, replyMentionInfo, maxCastLength]);

  // Handle selecting a channel mention in reply
  const handleReplySelectChannel = useCallback((channel: SearchChannel) => {
    if (!replyMentionInfo) return;
    const newText = replaceMention(replyText, replyMentionInfo, channel.key);
    setReplyText(newText.slice(0, maxCastLength));
    // Move cursor to after the inserted mention
    setReplyCursorPosition(replyMentionInfo.replaceStart + channel.key.length + 1);
  }, [replyText, replyMentionInfo, maxCastLength]);

  // Share action sheet state
  const [shareSheetCast, setShareSheetCast] = useState<{
    hash: string;
    author: string;
    authorFid?: number;
    text: string;
    isRecasted: boolean;
    recastCount: number;
  } | null>(null);
  // Separate state for the report flow so the report modal can stay open
  // after the share sheet is dismissed without juggling shared state.
  const [reportCastTarget, setReportCastTarget] = useState<{
    castHash: string;
    castAuthorFid?: number;
  } | null>(null);

  // Allow replying if there's text OR images
  const canReply = Boolean(token && (replyText.trim().length > 0 || replyImages.length > 0) && !isPosting && mainCast);

  const handlePickReplyImage = async () => {
    if (replyImages.length >= 2) {
      setReplyError('Maximum 2 images per reply');
      return;
    }
    const result = await pickImage('library');
    if (result.success && result.attachment) {
      setReplyImages(prev => [...prev, result.attachment!]);
      setReplyError(null);
    } else if (result.error) {
      setReplyError(result.error);
    }
  };

  const handleRemoveReplyImage = (index: number) => {
    setReplyImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmitReply = async () => {
    if (!canReply || !mainCast) return;

    try {
      setIsPosting(true);
      setReplyError(null);

      // Build embeds array as simple URL strings (API expects string[])
      const embeds: string[] = [];
      for (const image of replyImages) {
        try {
          const uploaded = await uploadImageForCast(token!, image.localUri, image.mimeType);
          embeds.push(uploaded.url);
        } catch (uploadErr: any) {
          setReplyError(`Failed to upload image: ${uploadErr?.message ?? 'Unknown error'}`);
          setIsPosting(false);
          return;
        }
      }

      await postFarcasterCast({
        token: token!,
        text: replyText.trim(),
        parentHash: mainCast.hash,
        embeds,
      });
      setReplyText('');
      setReplyImages([]); // Clear images after posting
      // Refetch to show the new reply
      await refetch();
    } catch (err: unknown) {
      setReplyError(err instanceof Error ? err.message : 'Failed to post reply');
    } finally {
      setIsPosting(false);
    }
  };

  const handleMentionPress = async (mentionUsername: string) => {
    try {
      const response = await fetch(`https://farcaster.xyz/~api/v2/user-by-username?username=${mentionUsername}`, {
        headers: {
          accept: '*/*',
          origin: 'https://farcaster.xyz',
          referer: 'https://farcaster.xyz/',
        },
      });
      if (response.ok) {
        const json = await response.json();
        if (json.result?.fid) {
          onOpenProfile(json.result.fid, mentionUsername);
        }
      }
    } catch {
      // Profile lookup failed — no action needed
    }
  };

  // Image viewer state
  const [viewerState, setViewerState] = useState<{ images: string[]; index: number } | null>(null);

  const renderCast = (cast: FlattenedCast, isMain = false) => {
    // Defensive: a malformed cast (typically a placeholder passed in
    // from a surface whose shape differs from the thread API) used to
    // crash here at `cast.author.fid`. Render nothing instead of
    // throwing — the real cast replaces this on fetch completion.
    if (!cast || !cast.author) return null;
    const imageUrls = (cast.embeds?.images ?? [])
      .map((img) => img.url)
      .filter((url): url is string => Boolean(url));
    const hasImages = imageUrls.length > 0;
    const videos = (cast.embeds?.videos ?? []).filter((v) => v.url && v.thumbnailUrl);
    const hasVideos = videos.length > 0;

    // Each URL embed renders exactly once — SnapAwareUrlPreview decides between
    // snap UI, frame card, or plain link preview (no duplicates).
    const frameEmbeds: { imageUrl: string; buttonTitle: string; actionUrl: string }[] = [];
    const embeddedCasts = cast.embeds?.casts ?? [];
    const urlPreviews = (cast.embeds?.urls ?? [])
      .filter((u) => {
        if (u.openGraph?.frameEmbedNext?.frameUrl || u.openGraph?.frameEmbedNext?.frameEmbed?.imageUrl) return true;
        const url = u.openGraph?.url || u.openGraph?.sourceUrl || '';
        // Drop farcaster.xyz cast links that are already shown as a quote cast
        if (url.includes('farcaster.xyz/')) {
          const parsed = parseFarcasterUrl(url);
          if (parsed) {
            const alreadyEmbedded = embeddedCasts.some((c: any) =>
              c?.hash?.toLowerCase().startsWith(parsed.castHashPrefix.toLowerCase())
            );
            if (alreadyEmbedded) return false;
          }
        }
        if (containsInviteLink(url)) return true;
        return u.openGraph?.title;
      });

    const isNested = cast.depth > 0;
    const borderWidth = isNested ? Math.min(cast.depth * 2, 6) : 0;

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
            <TouchableOpacity
              onPress={onClose}
              style={{ marginRight: 12 }}
            >
              <IconSymbol name="chevron.left" color={theme.colors.textMain} size={24} />
            </TouchableOpacity>
          )}
          <View style={{ position: 'relative', marginRight: 12 }}>
            <TouchableOpacity onPress={() => onOpenProfile(cast.author.fid, cast.author.username)}>
              <CachedAvatar
                source={cast.author.pfp?.url ? { uri: cast.author.pfp.url } : null}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  backgroundColor: theme.colors.surface3,
                }}
              />
            </TouchableOpacity>
            {/* Follow button - don't show for own profile */}
            {(() => {
              const isFollowing = followStates.get(cast.author.fid) ?? (cast.author.viewerContext?.following === false ? false : true);
              const isOwnProfile = currentUserFid && cast.author.fid === currentUserFid;
              return !isFollowing && cast.author.fid > 0 && !isOwnProfile && (
                <TouchableOpacity
                  style={{
                    position: 'absolute',
                    bottom: -2,
                    right: -2,
                    width: 18,
                    height: 18,
                    borderRadius: 9,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: theme.colors.primary,
                    borderWidth: 2,
                    borderColor: theme.colors.background,
                  }}
                  onPress={() => onFollow(cast.author.fid)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <IconSymbol name="plus" size={10} color="#fff" />
                </TouchableOpacity>
              );
            })()}
          </View>
          <View style={{ flex: 1 }}>
            {(() => {
              // Extract channel from cast.channel, channelContext (from root-embed), or from parentUrl if it's a channel URL
              // Note: The API may return 'name' (display name like "Music") but not 'key' (identifier like "music")
              // We lowercase as a fallback since channel identifiers are typically lowercase
              const channelKey = cast.channel?.key || (cast.channel?.name ? cast.channel.name.toLowerCase().replace(/\s+/g, '-') : null);
              const channelDisplayName = cast.channel?.name || cast.channel?.key;
              const channelName = channelKey ||
                (isMain && channelContext ? (channelContext.key || (channelContext.name ? channelContext.name.toLowerCase().replace(/\s+/g, '-') : null)) : null) ||
                (() => {
                  if (cast.parentUrl) {
                    const channelMatch = cast.parentUrl.match(/(?:farcaster|warpcast)\.(?:xyz|com)\/~\/channel\/([^\/\?]+)/);
                    if (channelMatch) return channelMatch[1];
                  }
                  return null;
                })();

              return (
                <>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <TouchableOpacity onPress={() => onOpenProfile(cast.author.fid, cast.author.username)}>
                      <Text style={{ color: theme.colors.textStrong, fontWeight: '600', fontSize: 15 }}>
                        {cast.author.displayName}
                      </Text>
                    </TouchableOpacity>
                    {channelName && (
                      <TouchableOpacity onPress={() => onOpenChannel(channelName)}>
                        <Text style={{ color: theme.colors.accent, fontSize: 13 }}>
                          /{channelDisplayName || channelName}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  <Text style={{ color: theme.colors.textMuted, fontSize: 13, marginTop: 2 }}>
                    @{cast.author.username} • {formatTimestamp(cast.timestamp)}
                  </Text>
                </>
              );
            })()}
          </View>
        </View>

        {/* Parent context - URL (non-channel) or reply to user */}
        {isMain && (() => {
          // Check if parentUrl is a channel URL - if so, don't show as reply context
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
        {cast.text.trim().length > 0 && (
          <CastText
            text={cast.text}
            style={{ color: theme.colors.textMain, fontSize: 15, lineHeight: 20 }}
            theme={theme}
            onMentionPress={handleMentionPress}
            onChannelPress={onOpenChannel}
            onLinkPress={onOpenMiniApp}
          />
        )}

        {/* Images - edge to edge */}
        {hasImages && (
          <View style={{ marginHorizontal: -12 - borderWidth }}>
            {imageUrls.length === 1 ? (
              <AutoHeightImage
                uri={imageUrls[0]}
                maxHeight={SCREEN_HEIGHT * 0.6}
                style={{ backgroundColor: theme.colors.surface3 }}
                onPress={() => setViewerState({ images: imageUrls, index: 0 })}
              />
            ) : (
              <ImageCarousel
                urls={imageUrls}
                maxHeight={SCREEN_HEIGHT * 0.6}
                theme={theme}
                onImagePress={(_, index) => setViewerState({ images: imageUrls, index })}
              />
            )}
          </View>
        )}

        {/* Videos - edge to edge */}
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

        {/* Frame embeds (mini apps) */}
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

        {/* URL previews (non-frame) — snap-aware */}
        {urlPreviews.length > 0 && (
          <View style={{ gap: 8 }}>
            {urlPreviews.map((urlEmbed, index) => {
              const linkUrl = urlEmbed.openGraph?.url || urlEmbed.openGraph?.sourceUrl;
              const isQuorumInvite = linkUrl && containsInviteLink(linkUrl);
              if (isQuorumInvite) {
                return (
                  <InviteLinkCard
                    key={index}
                    inviteLink={linkUrl}
                  />
                );
              }
              return (
                <SnapAwareUrlPreview
                  key={index}
                  url={linkUrl}
                  snapUrl={urlEmbed.openGraph?.frameEmbedNext?.frameUrl}
                  frameImageUrl={urlEmbed.openGraph?.frameEmbedNext?.frameEmbed?.imageUrl}
                  frameButtonTitle={urlEmbed.openGraph?.frameEmbedNext?.frameEmbed?.button?.title}
                  frameActionUrl={urlEmbed.openGraph?.frameEmbedNext?.frameEmbed?.button?.action?.url ?? linkUrl}
                  title={urlEmbed.openGraph?.title}
                  description={urlEmbed.openGraph?.description}
                  domain={urlEmbed.openGraph?.domain}
                  image={urlEmbed.openGraph?.image}
                  useLargeImage={urlEmbed.openGraph?.useLargeImage}
                  theme={theme}
                  onPress={linkUrl ? () => onOpenMiniApp(linkUrl) : undefined}
                  userFid={currentUserFid}
                  token={token}
                  onOpenUrl={(u) => onOpenMiniApp(u)}
                  onOpenProfile={(fid) => onOpenProfile(fid)}
                  onOpenMiniApp={(u) => onOpenMiniApp(u)}
                />
              );
            })}
          </View>
        )}

        {/* Inline YouTube URLs in cast text (deduped against explicit embeds) */}
        <InlineYouTubeFromText
          text={cast.text}
          excludeUrls={(cast.embeds?.urls ?? []).map((u: any) => u.openGraph?.url ?? u.openGraph?.sourceUrl)}
          theme={theme}
        />

        {/* Embedded casts (quote casts) */}
        {cast.embeds?.casts && cast.embeds.casts.length > 0 && (
          <View style={{ gap: 8 }}>
            {cast.embeds.casts.map((embeddedCast, index) => (
              <QuoteCast
                key={index}
                cast={embeddedCast as EmbeddedCast}
                theme={theme}
                onPress={() => onOpenThread(embeddedCast.author.username, embeddedCast.hash.slice(0, 10), embeddedCast)}
              />
            ))}
          </View>
        )}

        {/* Stats row */}
        {(() => {
          const optimistic = likeStates.get(cast.hash);
          const isLiked = optimistic?.liked ?? cast.viewerContext?.reacted ?? false;
          const likeCount = optimistic?.count ?? (cast.reactions?.count ?? 0);
          const recastOptimistic = recastStates.get(cast.hash);
          const isRecasted = recastOptimistic?.recasted ?? cast.viewerContext?.recast ?? false;
          const recastCount = recastOptimistic?.count ?? (cast.recasts?.count ?? 0);
          return (
            <View style={{ flexDirection: 'row', gap: 16, marginTop: 4 }}>
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
                onPress={() => onLikeToggle(cast.hash, isLiked, likeCount)}
                hitSlop={12}
              >
                <LikeIcon
                  type={getLikeIconType(cast.text)}
                  isLiked={isLiked}
                  color={theme.colors.textMuted}
                  activeColor={theme.colors.danger}
                  size={16}
                />
                {likeCount > 0 && (
                  <Text style={{ color: theme.colors.textMuted, fontSize: 13 }}>{likeCount}</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4, paddingHorizontal: 2 }}
                onPress={() => onOpenThread(cast.author.username, cast.hash.slice(0, 10), cast)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <IconSymbol name="bubble.left" color={theme.colors.textMuted} size={16} />
                {(cast.replies?.count ?? 0) > 0 && (
                  <Text style={{ color: theme.colors.textMuted, fontSize: 13 }}>{cast.replies?.count}</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4, paddingHorizontal: 2 }}
                onPress={() => {
                  setShareSheetCast({
                    hash: cast.hash,
                    author: cast.author.username,
                    authorFid: cast.author.fid,
                    text: cast.text || '',
                    isRecasted,
                    recastCount,
                  });
                }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <IconSymbol
                  name={isRecasted ? 'arrowshape.turn.up.right.fill' : 'arrowshape.turn.up.right'}
                  color={isRecasted ? theme.colors.success : theme.colors.textMuted}
                  size={16}
                />
                {recastCount > 0 && (
                  <Text style={{ color: theme.colors.textMuted, fontSize: 13 }}>{recastCount}</Text>
                )}
              </TouchableOpacity>
            </View>
          );
        })()}
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? (8 + 32 + Math.max(8, bottomInset)) : 0}
    >
    <View style={{ flex: 1, backgroundColor: theme.colors.surface1 }}>
      {error && (
        <View style={{ padding: 20 }}>
          <Text style={{ color: theme.colors.danger }}>{error}</Text>
        </View>
      )}

      {mainCast && (
        <ScrollView
          ref={scrollViewRef}
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingBottom: 16,
          }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          onScroll={(e) => {
            const editorY = editorYRef.current;
            if (editorY == null) return;
            const { contentOffset, layoutMeasurement } = e.nativeEvent;
            const visible = contentOffset.y + layoutMeasurement.height >= editorY;
            setIsEditorVisible((prev) => (prev === visible ? prev : visible));
          }}
          scrollEventThrottle={32}
        >
          {/* Parent chain — when entering from a reply notification we
              land on the reply itself; the parent casts above give the
              conversation context. See useFarcasterThread comments. */}
          {parentCasts.length > 0 && (
            <View>
              {parentCasts.map((parent) => renderCast({ ...parent, depth: 0 }))}
            </View>
          )}
          {renderCast({ ...mainCast, depth: 0 }, true)}

          {/* Replies-loading spinner — sits between the root cast and
              the replies area so the root cast (placeholder or real)
              stays at the top of the view, exactly where the user
              tapped. Previously the full-screen spinner above split
              the layout in half. */}
          {isLoading && replies.length === 0 && (
            <View style={{ paddingVertical: 24, alignItems: 'center' }}>
              <ActivityIndicator color={theme.colors.accent} />
            </View>
          )}

          {replies.length > 0 && (
            <View>
              {replies.map((reply) => renderCast(reply))}
            </View>
          )}

          {/* Inline reply editor - styled like a cast card */}
          {token && (
            <View
              onLayout={(e) => {
                editorYRef.current = e.nativeEvent.layout.y;
              }}
              style={{
                borderTopWidth: 1,
                borderTopColor: theme.colors.surface3,
                paddingTop: 12,
                paddingBottom: 14,
                paddingLeft: 12,
                paddingRight: 12,
                gap: 10,
              }}
            >
              {/* Mention autocomplete - positioned above the editor */}
              {replyMentionInfo && (
                <View style={{ zIndex: 10, marginBottom: -2 }}>
                  <MentionAutocomplete
                    mentionInfo={replyMentionInfo}
                    token={token}
                    onSelectUser={handleReplySelectUser}
                    onSelectChannel={handleReplySelectChannel}
                    theme={theme}
                    maxHeight={160}
                  />
                </View>
              )}

              {/* Header row - avatar + name, matching cast layout */}
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ marginRight: 12 }}>
                  <CachedAvatar
                    source={replyAvatarUri ? { uri: replyAvatarUri } : null}
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 22,
                      backgroundColor: theme.colors.surface3,
                    }}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.colors.textStrong, fontWeight: '600', fontSize: 15 }}>
                    {currentUser?.displayName || currentUser?.farcaster?.username || 'You'}
                  </Text>
                  {currentUser?.farcaster?.username && (
                    <Text style={{ color: theme.colors.textMuted, fontSize: 13, marginTop: 2 }}>
                      @{currentUser.farcaster.username}
                    </Text>
                  )}
                </View>
              </View>

              {/* Text input - styled like cast body text, no border/background */}
              <View style={{ marginLeft: 56 }}>
                <TextInput
                  ref={replyInputRef}
                  onFocus={() => setIsEditorFocused(true)}
                  onBlur={() => setIsEditorFocused(false)}
                  style={{
                    minHeight: 40,
                    color: theme.colors.textMain,
                    fontSize: 15,
                    lineHeight: 20,
                    padding: 0,
                    textAlignVertical: 'top',
                  }}
                  placeholder={`Reply to @${username}...`}
                  placeholderTextColor={theme.colors.textMuted}
                  value={replyText}
                  onChangeText={(text) => {
                    setReplyText(text.slice(0, maxCastLength));
                  }}
                  onSelectionChange={(e) => {
                    setReplyCursorPosition(e.nativeEvent.selection.end);
                  }}
                  onFocus={() => {
                    // Scroll to bottom when input is focused so the editor is visible
                    setTimeout(() => {
                      scrollViewRef.current?.scrollToEnd({ animated: true });
                    }, 300);
                  }}
                  multiline
                />

                {/* Image previews */}
                {replyImages.length > 0 && (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={{ marginTop: 10 }}
                    contentContainerStyle={{ gap: 8 }}
                  >
                    {replyImages.map((image, index) => (
                      <View key={index} style={{ position: 'relative' }}>
                        <Image
                          source={{ uri: image.localUri }}
                          style={{
                            width: 80,
                            height: 80,
                            borderRadius: 8,
                            backgroundColor: theme.colors.surface3,
                          }}
                          resizeMode="cover"
                        />
                        <TouchableOpacity
                          onPress={() => handleRemoveReplyImage(index)}
                          style={{
                            position: 'absolute',
                            top: 4,
                            right: 4,
                            width: 22,
                            height: 22,
                            borderRadius: 11,
                            backgroundColor: 'rgba(0,0,0,0.6)',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <IconSymbol name="xmark" size={12} color="#fff" />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </ScrollView>
                )}

                {/* Error message */}
                {replyError && (
                  <Text style={{ color: theme.colors.danger, fontSize: 13, marginTop: 6 }}>
                    {replyError}
                  </Text>
                )}

                {/* Bottom row: photo button, post button, character count */}
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    marginTop: 10,
                  }}
                >
                  <TouchableOpacity
                    onPress={handlePickReplyImage}
                    disabled={isPosting || replyImages.length >= 2}
                    style={{
                      opacity: replyImages.length >= 2 ? 0.4 : 1,
                      padding: 4,
                    }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <IconSymbol name="photo" size={20} color={theme.colors.textMuted} />
                  </TouchableOpacity>

                  <View style={{ flex: 1 }} />

                  {replyText.length > 0 && (
                    <Text style={{
                      fontSize: 12,
                      marginRight: 10,
                      color: replyText.length > regularCastByteLimit && replyText.length <= maxCastLength
                        ? (theme.colors.warning || '#FFA500')
                        : theme.colors.textMuted,
                    }}>
                      {replyText.length}/{maxCastLength}
                    </Text>
                  )}

                  <TouchableOpacity
                    onPress={handleSubmitReply}
                    disabled={!canReply}
                    style={{
                      paddingHorizontal: 16,
                      paddingVertical: 8,
                      borderRadius: 16,
                      backgroundColor: canReply ? theme.colors.accent : theme.colors.surface3,
                    }}
                  >
                    {isPosting ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={{
                        color: canReply ? '#fff' : theme.colors.textMuted,
                        fontSize: 14,
                        fontWeight: '600',
                      }}>
                        Post
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}
        </ScrollView>
      )}

      {/* Floating reply FAB — hidden when the editor is in viewport (the
          user can already see/tap the composer directly). */}
      {token && mainCast && !isEditorVisible && !isEditorFocused && (
        <TouchableOpacity
          onPress={scrollToReplyAndFocus}
          style={{
            position: 'absolute',
            right: 16,
            bottom: bottomInset + 16,
            width: 48,
            height: 48,
            borderRadius: 24,
            backgroundColor: theme.colors.accent,
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.25,
            shadowRadius: 4,
            elevation: 5,
          }}
        >
          <IconSymbol name="arrowshape.turn.up.left.fill" size={22} color="#fff" />
        </TouchableOpacity>
      )}

      {/* Thread Image Viewer */}
      <ImageViewer
        visible={viewerState !== null}
        images={viewerState?.images}
        initialIndex={viewerState?.index}
        onClose={() => setViewerState(null)}
      />

      {/* Share Action Sheet */}
      <ShareActionSheet
        visible={shareSheetCast !== null}
        castHash={shareSheetCast?.hash ?? ''}
        castAuthor={shareSheetCast?.author ?? ''}
        isRecasted={shareSheetCast?.isRecasted ?? false}
        recastCount={shareSheetCast?.recastCount ?? 0}
        token={token}
        theme={theme}
        bottomInset={bottomInset}
        onClose={() => setShareSheetCast(null)}
        onRecast={() => {
          if (shareSheetCast) {
            const { hash, isRecasted, recastCount } = shareSheetCast;
            setShareSheetCast(null); // Close the share sheet first
            onRecastToggle(hash, isRecasted, recastCount);
          }
        }}
        onQuote={() => {
          if (shareSheetCast) {
            const { hash, author, text } = shareSheetCast;
            setShareSheetCast(null); // Close the share sheet first
            onQuoteCast(hash, author, text);
          }
        }}
        onShareToChat={() => {
          if (shareSheetCast) {
            const castUrl = `https://warpcast.com/${shareSheetCast.author}/${shareSheetCast.hash.slice(0, 10)}`;
            setShareSheetCast(null); // Close the share sheet
            onShareToChat(castUrl);
          }
        }}
        onNativeShare={async () => {
          if (shareSheetCast) {
            const castUrl = `https://warpcast.com/${shareSheetCast.author}/${shareSheetCast.hash.slice(0, 10)}`;
            try {
              await Share.share({
                message: castUrl,
                url: castUrl,
              });
            } catch {
              // User cancelled share — no action needed
            }
          }
        }}
        onReport={() => {
          if (shareSheetCast) {
            const { hash, authorFid } = shareSheetCast;
            setShareSheetCast(null);
            setReportCastTarget({ castHash: hash, castAuthorFid: authorFid });
          }
        }}
      />

      <ReportModal
        visible={!!reportCastTarget}
        onClose={() => setReportCastTarget(null)}
        target={reportCastTarget ? { type: 'cast', ...reportCastTarget } : null}
      />
    </View>
    </KeyboardAvoidingView>
  );
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
  currentUserFid,
  hideBackButton = false,
}: {
  fid: number;
  token?: string;
  theme: AppTheme;
  currentUserFid?: number;
  onClose: () => void;
  onOpenThread: (username: string, hashPrefix: string, placeholderCast?: unknown) => void;
  onOpenMiniApp: (url: string) => void;
  onOpenProfile: (fid: number, username?: string) => void;
  onOpenChannel: (channelKey: string) => void;
  likeStates: Map<string, { liked: boolean; count: number }>;
  onLikeToggle: (castHash: string, currentlyLiked: boolean, currentCount: number) => void;
  bottomInset?: number;
  hideBackButton?: boolean;
}) {
  const {
    author,
    casts,
    isLoading,
    isFetchingNextPage,
    error,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = useFarcasterProfile({ fid, token });

  // Image viewer state
  const [viewerState, setViewerState] = useState<{ images: string[]; index: number } | null>(null);

  const renderProfileHeader = () => {
    if (!author) return null;

    return (
      <View style={{ backgroundColor: theme.colors.surface1 }}>
        {/* Banner */}
        <TouchableOpacity
          activeOpacity={author.profile?.bannerImageUrl ? 0.8 : 1}
          onPress={() => author.profile?.bannerImageUrl && setViewerState({ images: [author.profile.bannerImageUrl], index: 0 })}
          style={{ width: SCREEN_WIDTH, height: 120 }}
        >
          {author.profile?.bannerImageUrl ? (
            <Image
              source={{ uri: author.profile.bannerImageUrl }}
              style={{
                width: '100%',
                height: '100%',
                backgroundColor: theme.colors.surface3,
              }}
              resizeMode="cover"
            />
          ) : (
            <View
              style={{
                width: '100%',
                height: '100%',
                backgroundColor: theme.colors.accent,
                opacity: 0.3,
              }}
            />
          )}
        </TouchableOpacity>

        {/* Avatar */}
        <View style={{ paddingHorizontal: 16, marginTop: -40 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => author.pfp?.url && setViewerState({ images: [author.pfp.url], index: 0 })}
            >
              <CachedAvatar
                source={author.pfp?.url ? { uri: author.pfp.url } : null}
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

        {/* Separator */}
        <View style={{ height: 1, backgroundColor: theme.colors.surface3, marginTop: 16 }} />
      </View>
    );
  };

  const handleMentionPress = async (username: string) => {
    try {
      const response = await fetch(`https://farcaster.xyz/~api/v2/user-by-username?username=${username}`, {
        headers: {
          accept: '*/*',
          origin: 'https://farcaster.xyz',
          referer: 'https://farcaster.xyz/',
        },
      });
      if (response.ok) {
        const json = await response.json();
        if (json.result?.fid) {
          onOpenProfile(json.result.fid, username);
        }
      }
    } catch {
      // Profile lookup failed — no action needed
    }
  };

  const renderCast = (cast: ProfileCast) => {
    const imageUrls = (cast.embeds?.images ?? [])
      .map((img) => img.url)
      .filter((url): url is string => Boolean(url));
    const hasImages = imageUrls.length > 0;
    const videos = (cast.embeds?.videos ?? []).filter((v) => v.url && v.thumbnailUrl);
    const hasVideos = videos.length > 0;

    // Each URL embed renders exactly once — SnapAwareUrlPreview decides between
    // snap UI, frame card, or plain link preview (no duplicates).
    const frameEmbeds: { imageUrl: string; buttonTitle: string; actionUrl: string }[] = [];
    const embeddedCasts = cast.embeds?.casts ?? [];
    const urlPreviews = (cast.embeds?.urls ?? [])
      .filter((u) => {
        if (u.openGraph?.frameEmbedNext?.frameUrl || u.openGraph?.frameEmbedNext?.frameEmbed?.imageUrl) return true;
        const url = u.openGraph?.url || u.openGraph?.sourceUrl || '';
        // Drop farcaster.xyz cast links that are already shown as a quote cast
        if (url.includes('farcaster.xyz/')) {
          const parsed = parseFarcasterUrl(url);
          if (parsed) {
            const alreadyEmbedded = embeddedCasts.some((c: any) =>
              c?.hash?.toLowerCase().startsWith(parsed.castHashPrefix.toLowerCase())
            );
            if (alreadyEmbedded) return false;
          }
        }
        if (containsInviteLink(url)) return true;
        return u.openGraph?.title;
      });

    // Quote casts
    const quoteCasts = cast.embeds?.casts ?? [];

    const navigateToThread = () => {
      if (cast.author.username && cast.hash) {
        onOpenThread(cast.author.username, cast.hash.slice(0, 10), cast);
      }
    };

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
            <TouchableOpacity
              onPress={() => onOpenProfile(cast.author.fid, cast.author.username)}
            >
              <CachedAvatar
                source={cast.author.pfp?.url ? { uri: cast.author.pfp.url } : null}
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
                    <Text style={{ color: theme.colors.accent, fontSize: 13 }}>
                      /{cast.channel.key}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
              <Text style={{ color: theme.colors.textMuted, fontSize: 13, marginTop: 2 }}>
                @{cast.author.username} • {formatTimestamp(cast.timestamp)}
              </Text>
            </View>
          </View>
        </Pressable>

        {cast.text.trim().length > 0 && (
          <Pressable onPress={navigateToThread}>
            <CastText
              text={cast.text}
              style={{ color: theme.colors.textMain, fontSize: 15, lineHeight: 20 }}
              theme={theme}
              onMentionPress={handleMentionPress}
              onChannelPress={onOpenChannel}
              onLinkPress={onOpenMiniApp}
            />
          </Pressable>
        )}

        {/* Images */}
        {hasImages && (
          <View style={{ marginHorizontal: -12 }}>
            {imageUrls.length === 1 ? (
              <AutoHeightImage
                uri={imageUrls[0]}
                maxHeight={SCREEN_HEIGHT * 0.6}
                style={{ backgroundColor: theme.colors.surface3 }}
                onPress={() => setViewerState({ images: imageUrls, index: 0 })}
              />
            ) : (
              <ImageCarousel
                urls={imageUrls}
                maxHeight={SCREEN_HEIGHT * 0.6}
                theme={theme}
                onImagePress={(_, index) => setViewerState({ images: imageUrls, index })}
              />
            )}
          </View>
        )}

        {/* Videos */}
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

        {/* Frame embeds (mini apps) */}
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

        {/* URL previews — snap-aware */}
        {urlPreviews.length > 0 && (
          <View style={{ gap: 8 }}>
            {urlPreviews.map((urlEmbed, index) => {
              const linkUrl = urlEmbed.openGraph?.url || urlEmbed.openGraph?.sourceUrl;
              const isQuorumInvite = linkUrl && containsInviteLink(linkUrl);
              if (isQuorumInvite) {
                return (
                  <InviteLinkCard
                    key={index}
                    inviteLink={linkUrl}
                  />
                );
              }
              return (
                <SnapAwareUrlPreview
                  key={index}
                  url={linkUrl}
                  snapUrl={urlEmbed.openGraph?.frameEmbedNext?.frameUrl}
                  frameImageUrl={urlEmbed.openGraph?.frameEmbedNext?.frameEmbed?.imageUrl}
                  frameButtonTitle={urlEmbed.openGraph?.frameEmbedNext?.frameEmbed?.button?.title}
                  frameActionUrl={urlEmbed.openGraph?.frameEmbedNext?.frameEmbed?.button?.action?.url ?? linkUrl}
                  title={urlEmbed.openGraph?.title}
                  description={urlEmbed.openGraph?.description}
                  domain={urlEmbed.openGraph?.domain}
                  image={urlEmbed.openGraph?.image}
                  useLargeImage={urlEmbed.openGraph?.useLargeImage}
                  theme={theme}
                  userFid={currentUserFid}
                  token={token}
                  onPress={linkUrl ? () => onOpenMiniApp(linkUrl) : undefined}
                  onOpenUrl={(u) => onOpenMiniApp(u)}
                  onOpenProfile={(profileFid) => onOpenProfile(profileFid)}
                  onOpenMiniApp={(u) => onOpenMiniApp(u)}
                />
              );
            })}
          </View>
        )}

        {/* Inline YouTube URLs in cast text (deduped against explicit embeds) */}
        <InlineYouTubeFromText
          text={cast.text}
          excludeUrls={(cast.embeds?.urls ?? []).map((u: any) => u.openGraph?.url ?? u.openGraph?.sourceUrl)}
          theme={theme}
        />

        {/* Quote casts */}
        {quoteCasts.length > 0 && (
          <View style={{ gap: 8 }}>
            {quoteCasts.map((embeddedCast, index) => (
              <QuoteCast
                key={index}
                cast={embeddedCast as EmbeddedCast}
                theme={theme}
                onPress={() => onOpenThread(embeddedCast.author.username, embeddedCast.hash.slice(0, 10), embeddedCast)}
              />
            ))}
          </View>
        )}

        {/* Stats row */}
        {(() => {
          const optimistic = likeStates.get(cast.hash);
          const isLiked = optimistic?.liked ?? cast.viewerContext?.reacted ?? false;
          const likeCount = optimistic?.count ?? (cast.reactions?.count ?? 0);
          return (
            <View style={{ flexDirection: 'row', gap: 16, marginTop: 4 }}>
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
                onPress={() => onLikeToggle(cast.hash, isLiked, likeCount)}
                hitSlop={12}
              >
                <LikeIcon
                  type={getLikeIconType(cast.text)}
                  isLiked={isLiked}
                  color={theme.colors.textMuted}
                  activeColor={theme.colors.danger}
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
          );
        })()}
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.surface1 }}>
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

      <FlashList
        data={casts}
        extraData={likeStates}
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

      {/* Back button - positioned absolutely at top for consistency */}
      {!hideBackButton && (
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
      )}

      {/* Image Viewer */}
      <ImageViewer
        visible={viewerState !== null}
        images={viewerState?.images}
        initialIndex={viewerState?.index}
        onClose={() => setViewerState(null)}
      />
    </View>
  );
}

function ChannelView({
  channelKey,
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
  currentUserFid,
}: {
  channelKey: string;
  token?: string;
  theme: AppTheme;
  currentUserFid?: number;
  onClose: () => void;
  onOpenThread: (username: string, hashPrefix: string, placeholderCast?: unknown) => void;
  onOpenMiniApp: (url: string) => void;
  onOpenProfile: (fid: number, username?: string) => void;
  onOpenChannel: (channelKey: string) => void;
  likeStates: Map<string, { liked: boolean; count: number }>;
  onLikeToggle: (castHash: string, currentlyLiked: boolean, currentCount: number) => void;
  bottomInset?: number;
}) {
  const {
    channel,
    casts,
    isLoading,
    isFetchingNextPage,
    error,
    hasNextPage,
    fetchNextPage,
  } = useFarcasterChannel({ channelKey, token });

  const renderChannelHeader = () => {
    const frameEmbed = channel?.headerActionMetadata?.frameEmbedNext?.frameEmbed;
    const miniAppUrl = frameEmbed?.button?.action?.url;
    const miniAppTitle = frameEmbed?.button?.title || channel?.headerAction?.title;

    return (
      <View style={{ backgroundColor: theme.colors.surface1 }}>
        {/* Header Image */}
        {channel?.headerImageUrl && (
          <Image
            source={{ uri: channel.headerImageUrl }}
            style={{
              width: SCREEN_WIDTH,
              height: 100,
              backgroundColor: theme.colors.surface3,
            }}
            resizeMode="cover"
          />
        )}

        {/* Back button overlay on header */}
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

        {/* Channel Info */}
        <View style={{ padding: 16, marginTop: channel?.headerImageUrl ? -24 : 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
            {channel?.imageUrl ? (
              <Image
                source={{ uri: channel.imageUrl }}
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 12,
                  marginRight: 12,
                  backgroundColor: theme.colors.surface3,
                  borderWidth: channel?.headerImageUrl ? 3 : 0,
                  borderColor: theme.colors.surface1,
                }}
              />
            ) : (
              <View style={{
                width: 64,
                height: 64,
                borderRadius: 12,
                marginRight: 12,
                backgroundColor: theme.colors.accent,
                justifyContent: 'center',
                alignItems: 'center',
              }}>
                <Text style={{ color: '#fff', fontSize: 24, fontWeight: '700' }}>
                  /{channelKey.charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
            <View style={{ flex: 1, paddingBottom: 4 }}>
              <Text style={{ color: theme.colors.textStrong, fontSize: 22, fontWeight: '700' }}>
                /{channel?.name || channelKey}
              </Text>
            </View>
          </View>

          {/* Description */}
          {channel?.description && (
            <Text style={{ color: theme.colors.textMain, fontSize: 15, lineHeight: 21, marginTop: 12 }}>
              {channel.description}
            </Text>
          )}

          {/* Channel stats */}
          <View style={{ flexDirection: 'row', gap: 16, marginTop: 12 }}>
            {channel?.followerCount !== undefined && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={{ color: theme.colors.textStrong, fontWeight: '600', fontSize: 15 }}>
                  {channel.followerCount.toLocaleString()}
                </Text>
                <Text style={{ color: theme.colors.textMuted, fontSize: 14 }}>Followers</Text>
              </View>
            )}
            {channel?.memberCount !== undefined && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={{ color: theme.colors.textStrong, fontWeight: '600', fontSize: 15 }}>
                  {channel.memberCount.toLocaleString()}
                </Text>
                <Text style={{ color: theme.colors.textMuted, fontSize: 14 }}>Members</Text>
              </View>
            )}
          </View>

          {/* Mini App Button */}
          {miniAppUrl && miniAppTitle && (
            <TouchableOpacity
              onPress={() => onOpenMiniApp(miniAppUrl)}
              style={{
                backgroundColor: theme.colors.accent,
                borderRadius: 20,
                paddingVertical: 10,
                paddingHorizontal: 20,
                marginTop: 16,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              <IconSymbol name="play.fill" color="#fff" size={16} />
              <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }}>
                {miniAppTitle}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Separator */}
        <View style={{ height: 1, backgroundColor: theme.colors.surface3 }} />
      </View>
    );
  };

  const handleMentionPress = async (username: string) => {
    // Need to look up fid from username - for now just use a search API
    // This is a simplified version - ideally we'd have a username->fid lookup
    try {
      const response = await fetch(`https://farcaster.xyz/~api/v2/user-by-username?username=${username}`, {
        headers: {
          accept: '*/*',
          origin: 'https://farcaster.xyz',
          referer: 'https://farcaster.xyz/',
        },
      });
      if (response.ok) {
        const json = await response.json();
        if (json.result?.fid) {
          onOpenProfile(json.result.fid, username);
        }
      }
    } catch {
      // Profile lookup failed — no action needed
    }
  };

  // Image viewer state
  const [viewerState, setViewerState] = useState<{ images: string[]; index: number } | null>(null);

  const renderCast = (cast: ChannelCast) => {
    const imageUrls = (cast.embeds?.images ?? [])
      .map((img) => img.url)
      .filter((url): url is string => Boolean(url));
    const hasImages = imageUrls.length > 0;
    const videos = (cast.embeds?.videos ?? []).filter((v) => v.url && v.thumbnailUrl);
    const hasVideos = videos.length > 0;

    // Each URL embed renders exactly once — SnapAwareUrlPreview decides between
    // snap UI, frame card, or plain link preview (no duplicates).
    const frameEmbeds: { imageUrl: string; buttonTitle: string; actionUrl: string }[] = [];
    const embeddedCasts = cast.embeds?.casts ?? [];
    const urlPreviews = (cast.embeds?.urls ?? [])
      .filter((u) => {
        if (u.openGraph?.frameEmbedNext?.frameUrl || u.openGraph?.frameEmbedNext?.frameEmbed?.imageUrl) return true;
        const url = u.openGraph?.url || u.openGraph?.sourceUrl || '';
        // Drop farcaster.xyz cast links that are already shown as a quote cast
        if (url.includes('farcaster.xyz/')) {
          const parsed = parseFarcasterUrl(url);
          if (parsed) {
            const alreadyEmbedded = embeddedCasts.some((c: any) =>
              c?.hash?.toLowerCase().startsWith(parsed.castHashPrefix.toLowerCase())
            );
            if (alreadyEmbedded) return false;
          }
        }
        if (containsInviteLink(url)) return true;
        return u.openGraph?.title;
      });

    // Quote casts
    const quoteCasts = cast.embeds?.casts ?? [];

    const navigateToThread = () => {
      if (cast.author.username && cast.hash) {
        onOpenThread(cast.author.username, cast.hash.slice(0, 10), cast);
      }
    };

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
            <TouchableOpacity
              onPress={() => onOpenProfile(cast.author.fid, cast.author.username)}
            >
              <CachedAvatar
                source={cast.author.pfp?.url ? { uri: cast.author.pfp.url } : null}
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
              </View>
              <Text style={{ color: theme.colors.textMuted, fontSize: 13, marginTop: 2 }}>
                @{cast.author.username} • {formatTimestamp(cast.timestamp)}
              </Text>
            </View>
          </View>
        </Pressable>

        {cast.text.trim().length > 0 && (
          <Pressable onPress={navigateToThread}>
            <CastText
              text={cast.text}
              style={{ color: theme.colors.textMain, fontSize: 15, lineHeight: 20 }}
              theme={theme}
              onMentionPress={handleMentionPress}
              onChannelPress={onOpenChannel}
              onLinkPress={onOpenMiniApp}
            />
          </Pressable>
        )}

        {/* Images */}
        {hasImages && (
          <View style={{ marginHorizontal: -12 }}>
            {imageUrls.length === 1 ? (
              <AutoHeightImage
                uri={imageUrls[0]}
                maxHeight={SCREEN_HEIGHT * 0.6}
                style={{ backgroundColor: theme.colors.surface3 }}
                onPress={() => setViewerState({ images: imageUrls, index: 0 })}
              />
            ) : (
              <ImageCarousel
                urls={imageUrls}
                maxHeight={SCREEN_HEIGHT * 0.6}
                theme={theme}
                onImagePress={(_, index) => setViewerState({ images: imageUrls, index })}
              />
            )}
          </View>
        )}

        {/* Videos */}
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

        {/* Frame embeds (mini apps) */}
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

        {/* URL previews — snap-aware */}
        {urlPreviews.length > 0 && (
          <View style={{ gap: 8 }}>
            {urlPreviews.map((urlEmbed, index) => {
              const linkUrl = urlEmbed.openGraph?.url || urlEmbed.openGraph?.sourceUrl;
              const isQuorumInvite = linkUrl && containsInviteLink(linkUrl);
              if (isQuorumInvite) {
                return (
                  <InviteLinkCard
                    key={index}
                    inviteLink={linkUrl}
                  />
                );
              }
              return (
                <SnapAwareUrlPreview
                  key={index}
                  url={linkUrl}
                  snapUrl={urlEmbed.openGraph?.frameEmbedNext?.frameUrl}
                  frameImageUrl={urlEmbed.openGraph?.frameEmbedNext?.frameEmbed?.imageUrl}
                  frameButtonTitle={urlEmbed.openGraph?.frameEmbedNext?.frameEmbed?.button?.title}
                  frameActionUrl={urlEmbed.openGraph?.frameEmbedNext?.frameEmbed?.button?.action?.url ?? linkUrl}
                  title={urlEmbed.openGraph?.title}
                  description={urlEmbed.openGraph?.description}
                  domain={urlEmbed.openGraph?.domain}
                  image={urlEmbed.openGraph?.image}
                  useLargeImage={urlEmbed.openGraph?.useLargeImage}
                  theme={theme}
                  userFid={currentUserFid}
                  token={token}
                  onPress={linkUrl ? () => onOpenMiniApp(linkUrl) : undefined}
                  onOpenUrl={(u) => onOpenMiniApp(u)}
                  onOpenProfile={(profileFid) => onOpenProfile(profileFid)}
                  onOpenMiniApp={(u) => onOpenMiniApp(u)}
                />
              );
            })}
          </View>
        )}

        {/* Inline YouTube URLs in cast text (deduped against explicit embeds) */}
        <InlineYouTubeFromText
          text={cast.text}
          excludeUrls={(cast.embeds?.urls ?? []).map((u: any) => u.openGraph?.url ?? u.openGraph?.sourceUrl)}
          theme={theme}
        />

        {/* Quote casts */}
        {quoteCasts.length > 0 && (
          <View style={{ gap: 8 }}>
            {quoteCasts.map((embeddedCast, index) => (
              <QuoteCast
                key={index}
                cast={embeddedCast as EmbeddedCast}
                theme={theme}
                onPress={() => onOpenThread(embeddedCast.author.username, embeddedCast.hash.slice(0, 10), embeddedCast)}
              />
            ))}
          </View>
        )}

        {/* Stats row */}
        {(() => {
          const optimistic = likeStates.get(cast.hash);
          const isLiked = optimistic?.liked ?? cast.viewerContext?.reacted ?? false;
          const likeCount = optimistic?.count ?? (cast.reactions?.count ?? 0);
          return (
            <View style={{ flexDirection: 'row', gap: 16, marginTop: 4 }}>
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
                onPress={() => onLikeToggle(cast.hash, isLiked, likeCount)}
                hitSlop={12}
              >
                <LikeIcon
                  type={getLikeIconType(cast.text)}
                  isLiked={isLiked}
                  color={theme.colors.textMuted}
                  activeColor={theme.colors.danger}
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
          );
        })()}
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.surface1 }}>
      {error && (
        <View style={{ padding: 20 }}>
          <Text style={{ color: theme.colors.danger }}>{error}</Text>
        </View>
      )}

      <FlashList
        data={casts}
        extraData={likeStates}
        keyExtractor={(item) => item.hash}
        ListHeaderComponent={renderChannelHeader}
        // Loader lives inside the list (as the empty-state slot) so it
        // appears BELOW the channel header instead of above it. The
        // previous sibling-of-FlashList layout was claiming half the
        // screen and pushing the header down to fill the rest.
        ListEmptyComponent={
          isLoading ? (
            <View style={{ paddingVertical: 32, alignItems: 'center' }}>
              <ActivityIndicator color={theme.colors.accent} />
            </View>
          ) : null
        }
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

      {/* Channel Image Viewer */}
      <ImageViewer
        visible={viewerState !== null}
        images={viewerState?.images}
        initialIndex={viewerState?.index}
        onClose={() => setViewerState(null)}
      />
    </View>
  );
}

interface SocialFeedModalProps {
  visible: boolean;
  onClose: () => void;
  token?: string;
  /** Initial thread to open when modal becomes visible */
  initialThread?: {
    username: string;
    castHashPrefix: string;
  };
  /** Initial channel to open (e.g. when navigated from a space binding chip) */
  initialChannel?: {
    channelKey: string;
  };
  /** Initial profile to open (e.g. when tapped from UserProfileModal's
   *  linked-Farcaster row). Pushes a profile screen on first mount. */
  initialProfile?: {
    fid: number;
    username?: string;
  };
  /** When true, renders as a full screen without modal animation (for route-based navigation) */
  isRouteMode?: boolean;
}

import type {
  FeedFilter,
  FeedPost,
  FrameEmbedInfo,
  MiniAppInfo,
  QuoteCastEmbed,
  UrlEmbed,
  VideoEmbed,
} from '@/components/SocialFeed/types';

type SearchTab = 'top' | 'users' | 'channels' | 'casts';

// Search result item types for FlatList
type SearchResultItem =
  | { type: 'section-header'; title: string; key: string }
  | { type: 'user'; data: SearchUser; key: string }
  | { type: 'channel'; data: SearchChannel; key: string }
  | { type: 'cast'; data: SearchCast; key: string };

const AVATAR_FALLBACK = require('../assets/images/quorum-symbol-bg-blue.png');
// Default cast length for non-Pro users (Pro limits fetched dynamically)
const DEFAULT_CAST_LENGTH = 320;

// Memoized feed post card for better FlatList performance
interface FeedPostCardProps {
  post: FeedPost;
  theme: AppTheme;
  styles: ReturnType<typeof createStyles>;
  likeState?: { liked: boolean; count: number };
  recastState?: { recasted: boolean; count: number };
  followState?: boolean;
  token?: string;
  currentUserFid?: number;
  onNavigateToThread: (username: string, hash: string, focusReply?: boolean, placeholderCast?: unknown) => void;
  onNavigateToProfile: (fid: number, username?: string) => void;
  onOpenChannel: (channelKey: string) => void;
  onMentionPress: (username: string) => void;
  onLinkPress: (url: string) => void;
  onImagePress: (images: string[], index: number) => void;
  onLikeToggle: (hash: string, isLiked: boolean, count: number) => void;
  onOpenShareSheet: (hash: string, author: string, text: string, isRecasted: boolean, recastCount: number) => void;
  onFollow: (fid: number) => void;
}

// Square media-grid cell — used by the "Media" filter to render the
// feed as a 3-wide Instagram-style grid. Edge-to-edge tiles (no gap)
// matches the Instagram aesthetic and keeps the row width exactly
// equal to SCREEN_WIDTH, which avoids FlashList layout thrash that
// produces the jittery scrolling we saw with the earlier marginRight-
// based layout (row width exceeded container width by 3*gap).
const GRID_TILE_SIZE = Math.floor(SCREEN_WIDTH / 3);

function pickGridThumb(post: FeedPost): { uri: string; isVideo: boolean } | null {
  if (post.mediaUrls.length > 0) return { uri: post.mediaUrls[0], isVideo: false };
  for (const v of post.videos) {
    if (v.thumbnailUrl) return { uri: v.thumbnailUrl, isVideo: true };
  }
  return null;
}

/**
 * Map a FeedPost (flat shape produced by useFarcasterFeed) to the
 * thread-API cast shape that the thread renderer expects. Used as an
 * optimistic placeholder when tapping a cell in the media grid so the
 * thread view shows the cast immediately while replies load in the
 * background. Anything we can't materialize (precise timestamp,
 * channel.key) is left undefined; the renderer's defensive fallbacks
 * handle the missing fields, and the real cast replaces this within
 * a few hundred ms when the thread fetch resolves.
 */
function feedPostToCastPlaceholder(post: FeedPost): unknown {
  return {
    hash: post.hash,
    threadHash: post.hash,
    author: {
      fid: post.authorFid,
      username: post.username,
      displayName: post.authorName,
      pfp: post.authorAvatar ? { url: post.authorAvatar } : undefined,
    },
    text: post.content,
    // No exact ms timestamp on FeedPost (it stores a relative string
    // already formatted for display). Date.now() puts the cast at
    // "just now" — slightly inaccurate but only visible for the
    // network round-trip.
    timestamp: Date.now(),
    embeds: {
      images: post.mediaUrls.map((url) => ({ url })),
      videos: post.videos,
    },
    replies: { count: parseInt(post.stats.replies, 10) || 0 },
    reactions: { count: parseInt(post.stats.likes, 10) || 0 },
    recasts: { count: parseInt(post.stats.shares, 10) || 0 },
    viewerContext: {
      reacted: post.viewerHasLiked,
      recast: post.viewerHasRecast,
    },
    channel: post.channel ? { key: post.channel } : undefined,
  };
}

const MediaGridCell = React.memo(function MediaGridCell({
  post,
  theme,
  onPress,
}: {
  post: FeedPost;
  theme: AppTheme;
  onPress: () => void;
}) {
  const thumb = pickGridThumb(post);
  if (!thumb) return null;
  const mediaCount = post.mediaUrls.length + post.videos.length;
  const showStack = mediaCount > 1;
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={{ width: GRID_TILE_SIZE, height: GRID_TILE_SIZE, backgroundColor: theme.colors.surface3 }}
    >
      {/* expo-image: GPU-accelerated decode + memory/disk cache.
          Decoding 60+ thumbnails with React Native's stock Image
          stalls the JS thread on the first scroll past each tile;
          expo-image hands decoding off to native so scrolling
          stays smooth. */}
      <ExpoImage
        source={{ uri: thumb.uri }}
        contentFit="cover"
        cachePolicy="memory-disk"
        transition={0}
        style={{ width: GRID_TILE_SIZE, height: GRID_TILE_SIZE }}
      />
      {thumb.isVideo && (
        <View style={{ position: 'absolute', top: 6, right: 6 }}>
          <IconSymbol name="play.rectangle.fill" size={16} color="#fff" />
        </View>
      )}
      {showStack && !thumb.isVideo && (
        <View style={{ position: 'absolute', top: 6, right: 6 }}>
          <IconSymbol name="square.stack" size={16} color="#fff" />
        </View>
      )}
    </TouchableOpacity>
  );
});

const FeedPostCard = React.memo(function FeedPostCard({
  post,
  theme,
  styles,
  likeState,
  recastState,
  followState,
  token,
  currentUserFid,
  onNavigateToThread,
  onNavigateToProfile,
  onOpenChannel,
  onMentionPress,
  onLinkPress,
  onImagePress,
  onLikeToggle,
  onOpenShareSheet,
  onFollow,
}: FeedPostCardProps) {
  const navigateToThread = useCallback(() => {
    if (post.username && post.hash) {
      onNavigateToThread(post.username, post.hash.slice(0, 10), false, feedPostToCastPlaceholder(post));
    }
  }, [post, onNavigateToThread]);

  const navigateToReply = useCallback(() => {
    if (post.username && post.hash) {
      onNavigateToThread(post.username, post.hash.slice(0, 10), true, feedPostToCastPlaceholder(post));
    }
  }, [post, onNavigateToThread]);

  const navigateToProfile = useCallback(() => {
    if (post.authorFid > 0) {
      onNavigateToProfile(post.authorFid, post.username);
    }
  }, [post.authorFid, post.username, onNavigateToProfile]);

  const isLiked = likeState?.liked ?? post.viewerHasLiked ?? false;
  const likeCount = likeState?.count ?? (parseInt(post.stats.likes, 10) || 0);
  const isRecasted = recastState?.recasted ?? post.viewerHasRecast ?? false;
  const recastCount = recastState?.count ?? (parseInt(post.stats.shares, 10) || 0);
  // Show follow button only when we explicitly know the user is not following
  // If viewerIsFollowing is undefined, we don't know the state, so default to hiding button
  // But if viewerIsFollowing is explicitly false, show the button
  const isFollowing = followState ?? (post.viewerIsFollowing === false ? false : true);

  return (
    <View style={styles.postCard}>
      <Pressable onPress={navigateToThread} style={styles.postHeader}>
        <TouchableOpacity onPress={navigateToProfile} style={styles.avatarContainer}>
          <Image
            source={post.authorAvatar ? { uri: post.authorAvatar } : AVATAR_FALLBACK}
            style={styles.avatar}
          />
          {!isFollowing && post.authorFid > 0 && (
            <TouchableOpacity
              style={[styles.followButton, { backgroundColor: theme.colors.primary }]}
              onPress={() => onFollow(post.authorFid)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <IconSymbol name="plus" size={10} color="#fff" />
            </TouchableOpacity>
          )}
        </TouchableOpacity>
        <View style={styles.postAuthor}>
          <View style={styles.authorRow}>
            <TouchableOpacity onPress={navigateToProfile}>
              <Text style={styles.authorName}>{post.authorName}</Text>
            </TouchableOpacity>
            {post.isPro && (
              <IconSymbol name="star.fill" color={theme.colors.warning} size={14} />
            )}
            {post.channel && (
              <TouchableOpacity onPress={() => onOpenChannel(post.channel!)}>
                <Text style={[styles.channelLabel, { color: theme.colors.accent }]}>/{post.channel}</Text>
              </TouchableOpacity>
            )}
          </View>
          <Text style={styles.authorHandle}>
            {post.authorHandle} • {post.time}
          </Text>
        </View>
      </Pressable>

      {post.content.trim().length > 0 && (
        <Pressable onPress={navigateToThread}>
          <CastText
            text={post.content}
            style={styles.postContent}
            theme={theme}
            onMentionPress={onMentionPress}
            onChannelPress={onOpenChannel}
            onLinkPress={onLinkPress}
          />
        </Pressable>
      )}

      {post.mediaUrls.length > 0 && (
        <View style={styles.mediaContainer}>
          {post.mediaUrls.length === 1 ? (
            <AutoHeightImage
              uri={post.mediaUrls[0]}
              maxHeight={SCREEN_HEIGHT * 0.6}
              style={styles.postMedia}
              onPress={() => onImagePress(post.mediaUrls, 0)}
            />
          ) : (
            <ImageCarousel
              urls={post.mediaUrls}
              maxHeight={SCREEN_HEIGHT * 0.6}
              theme={theme}
              onImagePress={(_, index) => onImagePress(post.mediaUrls, index)}
            />
          )}
        </View>
      )}

      {post.videos.length > 0 && (
        <View style={styles.mediaContainer}>
          {post.videos.map((video, index) => (
            video.url && video.thumbnailUrl && (
              <VideoPlayer
                key={index}
                url={video.url}
                thumbnailUrl={video.thumbnailUrl}
                width={video.width}
                height={video.height}
                duration={video.duration}
                theme={theme}
              />
            )
          ))}
        </View>
      )}

      {post.frameEmbeds.length > 0 && (
        <View style={styles.mediaContainer}>
          {post.frameEmbeds.map((frame, index) => (
            <FrameEmbed
              key={index}
              imageUrl={frame.imageUrl}
              buttonTitle={frame.buttonTitle}
              actionUrl={frame.actionUrl}
              theme={theme}
              onPress={() => onLinkPress(frame.actionUrl)}
            />
          ))}
        </View>
      )}

      {post.quoteCasts.length > 0 && (
        <View style={{ gap: 8 }}>
          {post.quoteCasts.map((qc, index) => (
            <QuoteCast
              key={index}
              cast={qc.cast}
              theme={theme}
              onPress={() => onNavigateToThread(qc.username, qc.hashPrefix, false, qc.cast)}
            />
          ))}
        </View>
      )}

      {post.urlPreviews.length > 0 && (
        <View style={{ gap: 8, paddingHorizontal: 12 }}>
          {post.urlPreviews.map((preview, index) => (
            preview.isQuorumInvite && preview.url ? (
              <InviteLinkCard
                key={index}
                inviteLink={preview.url}
              />
            ) : preview.isFarcasterLink && preview.farcasterUsername && preview.farcasterCastHash ? (
              <TouchableOpacity
                key={index}
                style={{
                  backgroundColor: theme.colors.surface2,
                  borderRadius: 12,
                  padding: 12,
                  borderWidth: 1,
                  borderColor: theme.colors.surface3,
                }}
                onPress={() => onNavigateToThread(preview.farcasterUsername!, preview.farcasterCastHash!)}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <IconSymbol name="bubble.left.and.bubble.right" color={theme.colors.accent} size={16} />
                  <Text style={{ color: theme.colors.textStrong, fontWeight: '600', flex: 1 }} numberOfLines={1}>
                    {preview.title || 'View cast'}
                  </Text>
                  <IconSymbol name="chevron.right" color={theme.colors.textMuted} size={14} />
                </View>
                {preview.description && (
                  <Text style={{ color: theme.colors.textMuted, fontSize: 13, marginTop: 4 }} numberOfLines={2}>
                    {preview.description}
                  </Text>
                )}
              </TouchableOpacity>
            ) : (
              <SnapAwareUrlPreview
                key={index}
                url={preview.url}
                snapUrl={preview.snapUrl}
                title={preview.title}
                description={preview.description}
                domain={preview.domain}
                image={preview.image}
                useLargeImage={preview.useLargeImage}
                frameImageUrl={preview.frameImageUrl}
                frameButtonTitle={preview.frameButtonTitle}
                frameActionUrl={preview.frameActionUrl}
                theme={theme}
                userFid={currentUserFid}
                token={token}
                onPress={preview.url ? () => onLinkPress(preview.url!) : undefined}
                onOpenUrl={(u) => onLinkPress(u)}
                onOpenProfile={(fid) => onNavigateToProfile(fid)}
                onOpenMiniApp={(u) => onLinkPress(u)}
              />
            )
          ))}
        </View>
      )}

      {/* Inline YouTube URLs in cast text (deduped against existing embeds) */}
      <InlineYouTubeFromText
        text={post.content}
        excludeUrls={post.urlPreviews.map((p) => p.url)}
        theme={theme}
      />

      {/* Channel / topic tag pills used to render here. They duplicated
          the /channel link in the cast header (rendered above next to
          the author name) — same channel, two visual treatments. Kept
          just the header link. */}

      <View style={styles.postStats}>
        <TouchableOpacity
          style={styles.statButton}
          onPress={() => onLikeToggle(post.hash, isLiked, likeCount)}
          hitSlop={12}
        >
          <LikeIcon
            type={getLikeIconType(post.content)}
            isLiked={isLiked}
            color={theme.colors.textMuted}
            activeColor={theme.colors.danger}
            size={16}
          />
          {likeCount > 0 && (
            <Text style={styles.statText}>{likeCount}</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.statButton}
          onPress={navigateToReply}
          hitSlop={12}
        >
          <IconSymbol name="bubble.left" color={theme.colors.textMuted} size={16} />
          {post.stats.replies !== '0' && (
            <Text style={styles.statText}>{post.stats.replies}</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.statButton}
          hitSlop={12}
          onPress={() => onOpenShareSheet(post.hash, post.username ?? '', post.content ?? '', isRecasted, recastCount)}
        >
          <IconSymbol
            name={isRecasted ? "arrowshape.turn.up.right.fill" : "arrowshape.turn.up.right"}
            color={isRecasted ? theme.colors.success : theme.colors.textMuted}
            size={16}
          />
          {recastCount > 0 && (
            <Text style={styles.statText}>{recastCount}</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
});

// Navigation stack types
type NavScreen =
  | { type: 'feed' }
  | {
      type: 'thread';
      username: string;
      castHashPrefix: string;
      focusReply?: boolean;
      // Optional cast snapshot from the surface that pushed this
      // screen. Used as an optimistic placeholder so the thread view
      // shows real content immediately instead of just a spinner
      // while the network request resolves. Shape kept loose because
      // different sources (feed item, channel cast, embedded preview,
      // thread reply) carry different field subsets.
      placeholderCast?: unknown;
    }
  | { type: 'profile'; fid: number; username?: string }
  | { type: 'channel'; channelKey: string }
  | { type: 'proposal'; proposalId: string };

export interface SocialFeedModalHandle {
  /** Apply the "tab icon pressed while already on feed" behavior:
   *   - if a thread/profile/channel is on the internal nav stack → pop to root feed;
   *   - else if the feed list is scrolled down → scroll to top;
   *   - else → refresh. */
  handleActiveTabTap: () => void;
}

const SocialFeedModal = React.forwardRef<SocialFeedModalHandle, SocialFeedModalProps>(
function SocialFeedModal({ visible, token, onClose: _onClose, initialThread, initialChannel, initialProfile, isRouteMode = false }, externalRef) {
  const slideAnim = useRef(new Animated.Value(isRouteMode ? 0 : SCREEN_HEIGHT)).current;
  const backdropAnim = useRef(new Animated.Value(isRouteMode ? 1 : 0)).current;
  const { theme, isDark } = useTheme();
  const { user } = useAuth();
  const currentUserFid = user?.farcaster?.fid;
  const insets = useSafeAreaInsets();

  // Farcaster Pro status and cast limits
  const { regularCastByteLimit, longCastByteLimit, isPro } = useFarcasterCastLimits();
  const maxCastLength = isPro ? longCastByteLimit : regularCastByteLimit;
  const [activeFilter, setActiveFilter] = useState<FeedFilter>('all');
  const [rendered, setRendered] = useState(visible);
  const [castText, setCastText] = useState('');
  const [castCursorPosition, setCastCursorPosition] = useState(0);
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const [selectedImages, setSelectedImages] = useState<ProcessedAttachment[]>([]);

  // Mention autocomplete state for compose
  const composeMentionInfo = useMemo(
    () => getMentionInfo(castText, castCursorPosition),
    [castText, castCursorPosition]
  );

  // Handle selecting a user mention in compose
  const handleComposeSelectUser = useCallback((user: SearchUser) => {
    if (!composeMentionInfo) return;
    const newText = replaceMention(castText, composeMentionInfo, user.username);
    setCastText(newText.slice(0, maxCastLength));
    setCastCursorPosition(composeMentionInfo.replaceStart + user.username.length + 1);
  }, [castText, composeMentionInfo, maxCastLength]);

  // Handle selecting a channel mention in compose
  const handleComposeSelectChannel = useCallback((channel: SearchChannel) => {
    if (!composeMentionInfo) return;
    const newText = replaceMention(castText, composeMentionInfo, channel.key);
    setCastText(newText.slice(0, maxCastLength));
    setCastCursorPosition(composeMentionInfo.replaceStart + channel.key.length + 1);
  }, [castText, composeMentionInfo, maxCastLength]);

  // Navigation stack - starts with feed, can push thread/profile/channel views
  const [navStack, setNavStack] = useState<NavScreen[]>(() => {
    if (initialThread) {
      return [{ type: 'feed' }, { type: 'thread', username: initialThread.username, castHashPrefix: initialThread.castHashPrefix }];
    }
    if (initialChannel) {
      return [{ type: 'feed' }, { type: 'channel', channelKey: initialChannel.channelKey }];
    }
    if (initialProfile) {
      return [{ type: 'feed' }, { type: 'profile', fid: initialProfile.fid, username: initialProfile.username }];
    }
    return [{ type: 'feed' }];
  });

  const [selectedMiniApp, setSelectedMiniApp] = useState<MiniAppInfo | null>(null);
  const [composeVisible, setComposeVisible] = useState(false);
  const [composeChannelKey, setComposeChannelKey] = useState<string | undefined>(undefined);
  const [composeChannelPickerVisible, setComposeChannelPickerVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  // Mini app compose state
  const [miniAppEmbeds, setMiniAppEmbeds] = useState<string[]>([]);
  const miniAppComposeResolverRef = useRef<((result: ComposeCastResult) => void) | null>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchActive, setSearchActive] = useState(false);
  const [searchTab, setSearchTab] = useState<SearchTab>('top');
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 300);
  const searchInputRef = useRef<TextInput>(null);
  // Track when the main feed has scrolled past its inline search bar so
  // the floating magnifying-glass shortcut can appear top-right.
  const feedListRef = useRef<FlashListRef<FeedPost> | null>(null);
  const searchBarHeightRef = useRef(0);
  const [searchBarOutOfView, setSearchBarOutOfView] = useState(false);
  // Detached floating-search overlay state — independent of the inline
  // search bar's focus. The overlay renders its own TextInput bound to
  // the same `searchQuery`, so search results behave identically whether
  // the inline or floating input was used.
  const [floatingSearchVisible, setFloatingSearchVisible] = useState(false);
  const floatingSearchInputRef = useRef<TextInput>(null);

  // Navigation helpers
  const pushScreen = useCallback((screen: NavScreen) => {
    setNavStack(prev => [...prev, screen]);
  }, []);

  const popScreen = useCallback(() => {
    setNavStack(prev => prev.length > 1 ? prev.slice(0, -1) : prev);
  }, []);

  const currentScreen = navStack[navStack.length - 1];

  // Swipe-back gesture for navigation stack
  const SWIPE_EDGE_WIDTH = 80;
  const swipeTranslateX = useSharedValue(0);
  const isSwipeActive = useSharedValue(false);

  const swipeBackGesture = useMemo(() => Gesture.Pan()
    // Activate quickly on rightward motion. Y-fail bounds used to be
    // ±10 which is tighter than most real edge-swipes (thumbs drift
    // vertically). Loosened so the gesture actually fires.
    .activeOffsetX(10)
    .failOffsetX(-25)
    .failOffsetY([-30, 30])
    .onStart((event) => {
      // Only allow swipe-back when there's something to go back to
      const canGoBack = navStack.length > 1;
      const isNearLeftEdge = event.absoluteX < SWIPE_EDGE_WIDTH;
      isSwipeActive.value = canGoBack && isNearLeftEdge;
    })
    .onUpdate((event) => {
      if (isSwipeActive.value && event.translationX > 0) {
        swipeTranslateX.value = Math.min(event.translationX, SCREEN_WIDTH);
      }
    })
    .onEnd((event) => {
      if (isSwipeActive.value) {
        const threshold = SCREEN_WIDTH / 3;
        if (event.translationX > threshold || event.velocityX > 400) {
          // Complete the swipe - animate out then pop
          swipeTranslateX.value = withSpring(SCREEN_WIDTH, { damping: 28, stiffness: 300 }, () => {
            runOnJS(popScreen)();
            swipeTranslateX.value = 0;
          });
        } else {
          // Cancel - spring back
          swipeTranslateX.value = withSpring(0, { damping: 28, stiffness: 300 });
        }
      }
      isSwipeActive.value = false;
    }), [navStack.length, popScreen]);

  const swipeAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: swipeTranslateX.value }],
  }));

  // Legacy compatibility - derive selected* from navStack for components that still use them
  const selectedThread = currentScreen.type === 'thread' ? { username: currentScreen.username, castHashPrefix: currentScreen.castHashPrefix } : null;
  const selectedProfile = currentScreen.type === 'profile' ? { fid: currentScreen.fid, username: currentScreen.username } : null;
  const selectedChannel = currentScreen.type === 'channel' ? { channelKey: currentScreen.channelKey } : null;

  // Update navStack when initialThread/initialChannel changes (e.g., opening from chat or a space binding chip)
  useEffect(() => {
    if (!visible) return;
    if (initialThread) {
      setNavStack([{ type: 'feed' }, { type: 'thread', username: initialThread.username, castHashPrefix: initialThread.castHashPrefix }]);
    } else if (initialChannel) {
      setNavStack([{ type: 'feed' }, { type: 'channel', channelKey: initialChannel.channelKey }]);
    }
  }, [visible, initialThread, initialChannel]);

  // Track keyboard height for compose modal positioning
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSubscription = Keyboard.addListener(showEvent, (e: KeyboardEvent) => {
      setKeyboardHeight(e.endCoordinates.height);
    });
    const hideSubscription = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  const openMiniApp = useCallback((url: string) => {
    setSelectedMiniApp({ url });
  }, []);

  const handleMentionPress = useCallback(async (username: string) => {
    try {
      const response = await fetch(`https://farcaster.xyz/~api/v2/user-by-username?username=${username}`, {
        headers: {
          accept: '*/*',
          origin: 'https://farcaster.xyz',
          referer: 'https://farcaster.xyz/',
        },
      });
      if (response.ok) {
        const json = await response.json();
        const fid = json.result?.fid || json.result?.user?.fid;
        if (fid) {
          pushScreen({ type: 'profile', fid, username });
        }
      }
    } catch {
      // Profile lookup failed — no action needed
    }
  }, [pushScreen]);

  const openChannel = useCallback((channelKey: string) => {
    pushScreen({ type: 'channel', channelKey });
  }, [pushScreen]);

  // Track optimistic like states: hash -> { liked: boolean, count: number }
  const [likeStates, setLikeStates] = useState<Map<string, { liked: boolean; count: number }>>(new Map());

  // Image viewer state for feed images
  const [feedViewerState, setFeedViewerState] = useState<{ images: string[]; index: number } | null>(null);

  // Share action sheet state for main feed
  const [feedShareSheet, setFeedShareSheet] = useState<{
    hash: string;
    author: string;
    text: string;
    isRecasted: boolean;
    recastCount: number;
  } | null>(null);

  const handleLikeToggle = useCallback(async (castHash: string, currentlyLiked: boolean, currentCount: number) => {
    if (!token) return;

    const newLiked = !currentlyLiked;
    const newCount = newLiked ? currentCount + 1 : Math.max(0, currentCount - 1);

    // Optimistic update
    setLikeStates((prev) => {
      const next = new Map(prev);
      next.set(castHash, { liked: newLiked, count: newCount });
      return next;
    });

    try {
      if (newLiked) {
        await likeCast({ token, castHash });
      } else {
        await unlikeCast({ token, castHash });
      }
    } catch (e) {
      // Revert on failure
      setLikeStates((prev) => {
        const next = new Map(prev);
        next.set(castHash, { liked: currentlyLiked, count: currentCount });
        return next;
      });
    }
  }, [token]);

  // Track optimistic recast states: hash -> { recasted: boolean, count: number }
  const [recastStates, setRecastStates] = useState<Map<string, { recasted: boolean; count: number }>>(new Map());

  const handleRecastToggle = useCallback(async (castHash: string, currentlyRecasted: boolean, currentCount: number) => {
    if (!token) return;

    const newRecasted = !currentlyRecasted;
    const newCount = newRecasted ? currentCount + 1 : Math.max(0, currentCount - 1);

    // Optimistic update
    setRecastStates((prev) => {
      const next = new Map(prev);
      next.set(castHash, { recasted: newRecasted, count: newCount });
      return next;
    });

    try {
      if (newRecasted) {
        await recastCast({ token, castHash });
      } else {
        await unrecastCast({ token, castHash });
      }
    } catch (e) {
      // Revert on failure
      setRecastStates((prev) => {
        const next = new Map(prev);
        next.set(castHash, { recasted: currentlyRecasted, count: currentCount });
        return next;
      });
    }
  }, [token]);

  // Track optimistic follow states: fid -> following
  const [followStates, setFollowStates] = useState<Map<number, boolean>>(new Map());

  const handleFollow = useCallback(async (fid: number) => {
    if (!token) return;

    // Optimistic update - immediately show as following
    setFollowStates((prev) => {
      const next = new Map(prev);
      next.set(fid, true);
      return next;
    });

    try {
      await followUser({ token, targetFid: fid });
    } catch (e) {
      // Revert on failure
      setFollowStates((prev) => {
        const next = new Map(prev);
        next.delete(fid);
        return next;
      });
    }
  }, [token]);

  // Quote cast handler - opens compose modal with quote embed
  const [quoteCastEmbed, setQuoteCastEmbed] = useState<{ hash: string; author: string; text: string } | null>(null);

  const handleQuoteCast = useCallback((castHash: string, castAuthor: string, castText: string) => {
    setQuoteCastEmbed({ hash: castHash, author: castAuthor, text: castText });
    setComposeVisible(true);
  }, []);

  // Mini app compose handler - called when mini app requests to compose a cast
  // Note: BrowserModal now handles compose internally as an overlay, so this is only
  // used if compose is triggered from within SocialFeedModal's own content
  const handleMiniAppCompose = useCallback((options: ComposeCastOptions): Promise<ComposeCastResult> => {
    return new Promise((resolve) => {
      // Store the resolver to call when compose is complete
      miniAppComposeResolverRef.current = resolve;

      // Pre-fill compose modal with mini app options
      setCastText(options.text ?? '');
      setMiniAppEmbeds(options.embeds ?? []);
      setQuoteCastEmbed(null); // Clear any quote embed

      // Show compose modal
      setComposeVisible(true);
    });
  }, []);

  // Cancel compose handler - cleans up state and rejects mini app promise if active
  const handleCancelCompose = useCallback(() => {
    setComposeVisible(false);
    setQuoteCastEmbed(null);
    setSelectedImages([]);
    setCastText('');
    setComposeChannelKey(undefined);

    // Reject mini app promise if compose was triggered by mini app
    if (miniAppComposeResolverRef.current) {
      miniAppComposeResolverRef.current({ error: { type: 'rejected_by_user', message: 'User cancelled' } });
      miniAppComposeResolverRef.current = null;
    }
    setMiniAppEmbeds([]);
  }, []);

  // Share to chat state
  const [shareToChatUrl, setShareToChatUrl] = useState<string | null>(null);

  // Share to chat handler - opens the share to chat modal
  const handleShareToChat = useCallback((castUrl: string) => {
    setFeedShareSheet(null); // Close the share action sheet
    setShareToChatUrl(castUrl);
  }, []);

  // Memoized callbacks for FeedPostCard
  const handleNavigateToThread = useCallback(
    (username: string, hashPrefix: string, focusReply?: boolean, placeholderCast?: unknown) => {
      pushScreen({
        type: 'thread',
        username,
        castHashPrefix: hashPrefix,
        focusReply,
        placeholderCast,
      });
    },
    [pushScreen],
  );

  const handleNavigateToProfile = useCallback((fid: number, username?: string) => {
    pushScreen({ type: 'profile', fid, username });
  }, [pushScreen]);

  const handleOpenShareSheet = useCallback((hash: string, author: string, text: string, isRecasted: boolean, recastCount: number) => {
    setFeedShareSheet({ hash, author, text, isRecasted, recastCount });
  }, []);

  const {
    data: farcasterItems,
    isLoading,
    isFetchingNextPage,
    error,
    hasNextPage,
    fetchNextPage,
    refetch,
    isRefetching,
  } = useFarcasterFeed({
    token,
    enabled: visible,
  });

  // Live scroll position of the home feed list — used to decide
  // whether tapping the active feed tab should scroll-to-top or
  // refresh. Ref instead of state since we don't need re-renders.
  const feedScrollYRef = useRef(0);

  // Exposed via forwardRef. Drives the "tap feed tab while on feed"
  // behavior: pop a thread/profile/channel back to the feed; else
  // scroll to top if scrolled; else refresh.
  React.useImperativeHandle(externalRef, () => ({
    handleActiveTabTap: () => {
      if (navStack.length > 1) {
        // Pop ALL inner screens — most natural interpretation of
        // "take me back to the feed" when the user might be deep in
        // thread → profile → thread.
        setNavStack([{ type: 'feed' }]);
        return;
      }
      if (feedScrollYRef.current > 64) {
        feedListRef.current?.scrollToOffset({ offset: 0, animated: true });
        return;
      }
      // At top already — pull-to-refresh equivalent.
      void refetch();
    },
  }), [navStack.length, refetch]);

  // Search hooks
  const { data: searchSummary, isLoading: isSearchLoading } = useSearchSummary({
    q: debouncedSearchQuery,
    token,
    enabled: visible && searchActive && debouncedSearchQuery.length > 0,
  });

  const { users: searchUsers, onEndReached: onUsersEndReached, isFetchingNextPage: isFetchingMoreUsers } = useSearchUsers({
    q: debouncedSearchQuery,
    token,
    enabled: visible && searchActive && searchTab === 'users' && debouncedSearchQuery.length > 0,
  });

  const { channels: searchChannels, onEndReached: onChannelsEndReached, isFetchingNextPage: isFetchingMoreChannels } = useSearchChannels({
    q: debouncedSearchQuery,
    token,
    enabled: visible && searchActive && searchTab === 'channels' && debouncedSearchQuery.length > 0,
  });

  const { casts: searchCasts, onEndReached: onCastsEndReached, isFetchingNextPage: isFetchingMoreCasts } = useSearchCasts({
    q: debouncedSearchQuery,
    token,
    enabled: visible && searchActive && searchTab === 'casts' && debouncedSearchQuery.length > 0,
  });

  // User's followed channels for tabs
  const { data: followedChannels } = useUserFollowedChannels({
    fid: currentUserFid,
    token,
    enabled: visible && !!currentUserFid,
  });

  useEffect(() => {
    // In route mode, always stay visible
    if (isRouteMode) {
      setRendered(true);
      slideAnim.setValue(0);
      backdropAnim.setValue(1);
      return;
    }

    if (visible) {
      setRendered(true);
      // Instantly show - no animation
      slideAnim.setValue(0);
      backdropAnim.setValue(1);
    } else {
      // Instantly hide - no animation
      slideAnim.setValue(SCREEN_HEIGHT);
      backdropAnim.setValue(0);
      setRendered(false);
    }
  }, [backdropAnim, slideAnim, visible, isRouteMode]);

  const styles = useMemo(() => createStyles(theme, isDark, insets), [theme, isDark, insets]);

  const posts = useMemo<FeedPost[]>(() => {
    return farcasterItems.map((item) => {
      const cast = item.cast;
      const mediaUrls = (cast.embeds?.images ?? [])
        .map((img) => img.url)
        .filter((url): url is string => Boolean(url));

      const videos: VideoEmbed[] = (cast.embeds?.videos ?? [])
        .filter((v) => v.thumbnailUrl && v.url)
        .map((v) => ({
          url: v.url,
          thumbnailUrl: v.thumbnailUrl,
          width: v.width,
          height: v.height,
          duration: v.duration,
        }));

      // Extract embedded casts (quote casts)
      const quoteCasts: QuoteCastEmbed[] = (cast.embeds?.casts ?? [])
        .filter((c) => c.hash && c.author?.username)
        .map((c) => ({
          cast: c,
          username: c.author.username,
          hashPrefix: c.hash.slice(0, 10), // e.g., "0x2cba399b"
        }));

      // Extract URL embeds. Each `cast.embeds.urls` entry becomes EXACTLY ONE
      // `urlPreviews` item — `SnapAwareUrlPreview` decides at render time whether
      // to show a snap, a frame/miniapp card, or a plain link preview, so we
      // don't render duplicates. (`frameEmbeds` stays empty for new posts.)
      const allUrls = cast.embeds?.urls ?? [];
      const frameEmbeds: FrameEmbedInfo[] = [];

      const urlPreviews: UrlEmbed[] = allUrls
        .filter((u) => {
          const frameUrl = u.openGraph?.frameEmbedNext?.frameUrl;
          const frameEmbed = u.openGraph?.frameEmbedNext?.frameEmbed;
          // Always keep frame/snap embeds — the renderer picks the right UI
          if (frameUrl || frameEmbed?.imageUrl) return true;
          // Skip farcaster.xyz links if we already have the cast embedded
          const url = u.openGraph?.url || u.openGraph?.sourceUrl || '';
          if (url.includes('farcaster.xyz/')) {
            const parsed = parseFarcasterUrl(url);
            if (parsed) {
              const alreadyEmbedded = quoteCasts.some(
                (qc) => qc.hashPrefix.toLowerCase().startsWith(parsed.castHashPrefix.toLowerCase())
              );
              return !alreadyEmbedded;
            }
          }
          if (containsInviteLink(url)) return true;
          return u.openGraph?.title;
        })
        .map((u) => {
          const url = u.openGraph?.url || u.openGraph?.sourceUrl || '';
          const parsed = url.includes('farcaster.xyz/') ? parseFarcasterUrl(url) : null;
          const isQuorumInvite = containsInviteLink(url);
          const frameEmbed = u.openGraph?.frameEmbedNext?.frameEmbed;
          const frameImageUrl = frameEmbed?.imageUrl;
          const frameAction = frameEmbed?.button?.action?.url;
          return {
            url,
            title: u.openGraph?.title,
            description: u.openGraph?.description,
            domain: u.openGraph?.domain,
            image: u.openGraph?.image,
            useLargeImage: u.openGraph?.useLargeImage,
            isFarcasterLink: Boolean(parsed),
            farcasterUsername: parsed?.username,
            farcasterCastHash: parsed?.castHashPrefix,
            isQuorumInvite,
            snapUrl: u.openGraph?.frameEmbedNext?.frameUrl,
            frameImageUrl,
            frameButtonTitle: frameEmbed?.button?.title ?? 'Open',
            frameActionUrl: frameAction ?? u.openGraph?.url ?? undefined,
          };
        });

      const tags =
        cast.tags
          ?.filter((tag) => tag.id || tag.name)
          .map((tag) => `#${(tag.id || tag.name || '').toLowerCase()}`)
          .slice(0, 3) ?? [];

      const hasMedia = mediaUrls.length > 0 || videos.length > 0;
      const filter = deriveFilter(cast, hasMedia);

      const accountLevel = cast.author?.profile?.accountLevel?.toLowerCase();
      return {
        id: item.id,
        hash: cast.hash,
        username: cast.author?.username ?? '',
        authorFid: cast.author?.fid ?? 0,
        authorName: cast.author?.displayName || `fid:${cast.author?.fid}`,
        authorHandle: cast.author?.username ? `@${cast.author.username}` : '',
        authorAvatar: cast.author?.pfp?.url,
        channel: cast.channel?.name,
        isPro: accountLevel === 'pro' || accountLevel === 'premium',
        time: formatTimestamp(cast.timestamp),
        content: cast.text,
        stats: {
          likes: formatCount(cast.reactions?.count),
          replies: formatCount(cast.replies?.count),
          shares: formatCount(cast.recasts?.count),
        },
        tags,
        mediaUrls,
        videos,
        urlPreviews,
        quoteCasts,
        frameEmbeds,
        filter,
        viewerHasLiked: cast.viewerContext?.reacted,
        viewerHasRecast: cast.viewerContext?.recast,
        viewerIsFollowing: cast.author?.viewerContext?.following,
      };
    });
  }, [farcasterItems]);

  const filteredPosts = useMemo(() => {
    if (activeFilter === 'all') {
      return posts;
    }
    return posts.filter((post) => post.filter === activeFilter);
  }, [activeFilter, posts]);

  // Build search results list based on current tab
  const searchResultItems = useMemo<SearchResultItem[]>(() => {
    if (!searchActive || !debouncedSearchQuery) return [];

    if (searchTab === 'top' && searchSummary) {
      // Top view shows preview of all categories
      const items: SearchResultItem[] = [];

      if (searchSummary.users.length > 0) {
        items.push({ type: 'section-header', title: 'Users', key: 'section-users' });
        searchSummary.users.forEach((user) => {
          items.push({ type: 'user', data: user, key: `user-${user.fid}` });
        });
      }

      if (searchSummary.channels.length > 0) {
        items.push({ type: 'section-header', title: 'Channels', key: 'section-channels' });
        searchSummary.channels.forEach((channel) => {
          items.push({ type: 'channel', data: channel, key: `channel-${channel.key}` });
        });
      }

      if (searchSummary.casts.length > 0) {
        items.push({ type: 'section-header', title: 'Casts', key: 'section-casts' });
        searchSummary.casts.forEach((cast) => {
          items.push({ type: 'cast', data: cast, key: `cast-${cast.hash}` });
        });
      }

      return items;
    }

    if (searchTab === 'users') {
      return searchUsers.map((user) => ({ type: 'user' as const, data: user, key: `user-${user.fid}` }));
    }

    if (searchTab === 'channels') {
      return searchChannels.map((channel) => ({ type: 'channel' as const, data: channel, key: `channel-${channel.key}` }));
    }

    if (searchTab === 'casts') {
      return searchCasts.map((cast) => ({ type: 'cast' as const, data: cast, key: `cast-${cast.hash}` }));
    }

    return [];
  }, [searchActive, debouncedSearchQuery, searchTab, searchSummary, searchUsers, searchChannels, searchCasts]);

  // Handlers for search result item presses
  const handleSearchUserPress = useCallback((user: SearchUser) => {
    setSearchActive(false);
    setSearchQuery('');
    Keyboard.dismiss();
    pushScreen({ type: 'profile', fid: user.fid, username: user.username });
  }, [pushScreen]);

  const handleSearchChannelPress = useCallback((channel: SearchChannel) => {
    setSearchActive(false);
    setSearchQuery('');
    Keyboard.dismiss();
    pushScreen({ type: 'channel', channelKey: channel.key });
  }, [pushScreen]);

  const handleSearchCastPress = useCallback((cast: SearchCast) => {
    setSearchActive(false);
    setSearchQuery('');
    Keyboard.dismiss();
    // Pass the cast as a placeholder so the thread shows real content
    // immediately while the full thread loads.
    pushScreen({
      type: 'thread',
      username: cast.author.username,
      castHashPrefix: cast.hash.slice(0, 10),
      placeholderCast: cast,
    });
  }, [pushScreen]);

  // Render function for search results
  const renderSearchResultItem = useCallback(({ item }: { item: SearchResultItem }) => {
    if (item.type === 'section-header') {
      return (
        <View style={styles.searchSectionHeader}>
          <Text style={styles.searchSectionTitle}>{item.title}</Text>
        </View>
      );
    }

    if (item.type === 'user') {
      const user = item.data;
      return (
        <TouchableOpacity style={styles.searchResultItem} onPress={() => handleSearchUserPress(user)}>
          <CachedAvatar
            source={user.pfp?.url ? { uri: user.pfp.url } : null}
            style={styles.searchResultAvatar}
          />
          <View style={styles.searchResultInfo}>
            <Text style={styles.searchResultName}>{user.displayName}</Text>
            <Text style={styles.searchResultUsername}>@{user.username}</Text>
            {user.profile?.bio?.text && (
              <Text style={styles.searchResultBio} numberOfLines={2}>{user.profile.bio.text}</Text>
            )}
            {user.followerCount !== undefined && (
              <Text style={styles.searchResultFollowers}>
                {user.followerCount.toLocaleString()} followers
              </Text>
            )}
          </View>
        </TouchableOpacity>
      );
    }

    if (item.type === 'channel') {
      const channel = item.data;
      return (
        <TouchableOpacity style={styles.searchResultItem} onPress={() => handleSearchChannelPress(channel)}>
          {channel.imageUrl ? (
            <Image source={{ uri: channel.imageUrl }} style={styles.channelImage} />
          ) : (
            <View style={styles.channelImage} />
          )}
          <View style={styles.searchResultInfo}>
            <Text style={styles.searchResultName}>{channel.name}</Text>
            <Text style={styles.searchResultUsername}>/{channel.key}</Text>
            {channel.description && (
              <Text style={styles.searchResultBio} numberOfLines={2}>{channel.description}</Text>
            )}
            {channel.followerCount !== undefined && (
              <Text style={styles.searchResultFollowers}>
                {channel.followerCount.toLocaleString()} followers
              </Text>
            )}
          </View>
        </TouchableOpacity>
      );
    }

    if (item.type === 'cast') {
      const cast = item.data;
      return (
        <TouchableOpacity style={styles.searchResultItem} onPress={() => handleSearchCastPress(cast)}>
          <CachedAvatar
            source={cast.author.pfp?.url ? { uri: cast.author.pfp.url } : null}
            style={styles.searchResultAvatar}
          />
          <View style={styles.searchResultInfo}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={styles.searchResultName}>{cast.author.displayName}</Text>
              <Text style={styles.searchResultUsername}>@{cast.author.username}</Text>
            </View>
            <Text style={styles.searchResultBio} numberOfLines={3}>{cast.text}</Text>
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 4 }}>
              <Text style={styles.searchResultFollowers}>
                {cast.replies?.count ?? 0} replies
              </Text>
              <Text style={styles.searchResultFollowers}>
                {cast.reactions?.count ?? 0} likes
              </Text>
            </View>
          </View>
        </TouchableOpacity>
      );
    }

    return null;
  }, [styles, handleSearchUserPress, handleSearchChannelPress, handleSearchCastPress]);

  const trendingTopics = useMemo(() => {
    const counts = new Map<string, number>();
    farcasterItems.forEach((item) => {
      item.cast.tags
        ?.filter((tag) => tag.type === 'channel' && tag.id)
        .forEach((tag) => {
          const key = `#${tag.id!.toLowerCase()}`;
          counts.set(key, (counts.get(key) ?? 0) + 1);
        });
    });
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([label, count]) => ({ id: label, label, delta: `+${count}` }));
  }, [farcasterItems]);

  const filters: { id: FeedFilter; label: string; icon: IconSymbolName }[] = [
    { id: 'all', label: 'All', icon: 'rectangle.stack.fill' },
    { id: 'media', label: 'Media', icon: 'play.rectangle.fill' },
    // { id: 'events', label: 'Events', icon: 'calendar' },
  ];

  if (!rendered) {
    return null;
  }

  const showEmpty = !isLoading && !error && filteredPosts.length === 0;
  // Allow posting if there's text, images, or mini app embeds (not requiring all)
  const canPost = Boolean(token && (castText.trim().length > 0 || selectedImages.length > 0 || miniAppEmbeds.length > 0) && !posting);

  const handleChangeText = (value: string) => {
    setCastText(value.slice(0, maxCastLength));
  };

  const handlePickImage = async () => {
    if (selectedImages.length >= 2) {
      setPostError('Maximum 2 images per cast');
      return;
    }
    const result = await pickImage('library');
    if (result.success && result.attachment) {
      setSelectedImages(prev => [...prev, result.attachment!]);
      setPostError(null);
    } else if (result.error) {
      setPostError(result.error);
    }
  };

  const handleRemoveImage = (index: number) => {
    setSelectedImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmitCast = async () => {
    if (!canPost) {
      if (!token) {
        setPostError('Missing Farcaster token.');
      }
      return;
    }
    try {
      setPosting(true);
      setPostError(null);

      // Build embeds array as simple URL strings (API expects string[])
      const embeds: string[] = [];
      if (quoteCastEmbed) {
        // Farcaster expects a cast URL for quote casts
        const quoteUrl = `https://warpcast.com/${quoteCastEmbed.author}/${quoteCastEmbed.hash.slice(0, 10)}`;
        embeds.push(quoteUrl);
      }

      // Add mini app embeds
      for (const embedUrl of miniAppEmbeds) {
        embeds.push(embedUrl);
      }

      // Upload images and add to embeds
      for (const image of selectedImages) {
        try {
          const uploaded = await uploadImageForCast(token as string, image.localUri, image.mimeType);
          embeds.push(uploaded.url);
        } catch (uploadErr: any) {
          setPostError(`Failed to upload image: ${uploadErr?.message ?? 'Unknown error'}`);
          setPosting(false);
          return;
        }
      }

      const result = await postFarcasterCast({
        token: token as string,
        text: castText.trim(),
        embeds,
        channelKey: composeChannelKey,
      });

      // Resolve mini app promise if this was a mini app compose request
      if (miniAppComposeResolverRef.current) {
        miniAppComposeResolverRef.current({ hash: result.hash });
        miniAppComposeResolverRef.current = null;
      }

      setCastText('');
      setSelectedImages([]); // Clear images after posting
      setMiniAppEmbeds([]); // Clear mini app embeds after posting
      setQuoteCastEmbed(null); // Clear quote embed after posting
      setComposeChannelKey(undefined); // Clear channel target after posting
      setComposeVisible(false); // Close compose modal
      await refetch();
    } catch (err: unknown) {
      setPostError(err?.message ?? 'Failed to publish cast.');
    } finally {
      setPosting(false);
    }
  };

  const handleRefresh = () => {
    refetch();
  };

  // Calculate userPanel height to match index.tsx: paddingTop(8) + content(~32) + paddingBottom(max(8, insets.bottom))
  const userPanelHeight = 8 + 32 + Math.max(8, insets.bottom);

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <Animated.View
        pointerEvents="none"
        style={[
          styles.backdrop,
          {
            opacity: backdropAnim,
          },
        ]}
      />
      <View style={styles.container} pointerEvents="box-none">
        <Animated.View
          style={[
            styles.modalContent,
            {
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          {/* Search Results FlatList */}
          {searchActive && debouncedSearchQuery.length > 0 ? (
            <FlashList
              data={searchResultItems}
              keyExtractor={(item) => item.key}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.contentContainer}
              onEndReached={() => {
                if (searchTab === 'users') onUsersEndReached();
                else if (searchTab === 'channels') onChannelsEndReached();
                else if (searchTab === 'casts') onCastsEndReached();
              }}
              onEndReachedThreshold={0.5}
              keyboardShouldPersistTaps="handled"
              ListHeaderComponent={
              <>
                {/* Search Input */}
                <View style={styles.searchContainer}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    {/* Avatar (top-left) — only in route mode, the modal
                        presentation has its own dismiss affordance. */}
                    {isRouteMode && <HeaderAvatar />}
                    <View style={[styles.searchInputContainer, { flex: 1 }]}>
                      <IconSymbol name="magnifyingglass" size={18} color={theme.colors.textMuted} />
                      <TextInput
                        ref={searchInputRef}
                        style={styles.searchInput}
                        placeholder="Search users, channels, casts..."
                        placeholderTextColor={theme.colors.textMuted}
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        onFocus={() => setSearchActive(true)}
                        returnKeyType="search"
                      />
                      {searchQuery.length > 0 && (
                        <TouchableOpacity onPress={() => setSearchQuery('')}>
                          <IconSymbol name="xmark.circle.fill" size={18} color={theme.colors.textMuted} />
                        </TouchableOpacity>
                      )}
                    </View>
                    {searchActive && (
                      <TouchableOpacity
                        style={styles.searchCancelButton}
                        onPress={() => {
                          setSearchActive(false);
                          setSearchQuery('');
                          setSearchTab('top');
                          Keyboard.dismiss();
                        }}
                      >
                        <Text style={styles.searchCancelText}>Cancel</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>

                {/* Search Tabs - only show when searching */}
                {searchActive && debouncedSearchQuery.length > 0 && (
                  <View style={styles.searchTabsContainer}>
                    {(['top', 'users', 'channels', 'casts'] as SearchTab[]).map((tab) => (
                      <TouchableOpacity
                        key={tab}
                        style={[styles.searchTab, searchTab === tab && styles.searchTabActive]}
                        onPress={() => setSearchTab(tab)}
                      >
                        <Text style={[styles.searchTabText, searchTab === tab && styles.searchTabTextActive]}>
                          {tab.charAt(0).toUpperCase() + tab.slice(1)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                {/* Filters Row with Channel Tabs - only show when not searching */}
                {!searchActive && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filtersRow}>
                    <View style={{width:16}}/>
                    {filters.map((filter) => {
                      const isActive = activeFilter === filter.id;
                      return (
                        <TouchableOpacity
                          key={filter.id}
                          style={[styles.filterChip, isActive && styles.filterChipActive]}
                          onPress={() => setActiveFilter(filter.id)}
                        >
                          <IconSymbol
                            name={filter.icon}
                            color={isActive ? theme.colors.surface0 : theme.colors.accent}
                            size={14}
                          />
                          <Text
                            style={[
                              styles.filterChipText,
                              { color: isActive ? theme.colors.surface0 : theme.colors.accent },
                            ]}
                          >
                            {filter.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                    {/* User's followed channels as round image chips.
                        Channel image fills the circle; no text. Falls
                        back to a tinted placeholder when the channel
                        has no image set. */}
                    {followedChannels && followedChannels.slice(0, 10).map((channel) => (
                      <TouchableOpacity
                        key={channel.key}
                        accessibilityLabel={channel.name}
                        style={styles.filterChip}
                        onPress={() => pushScreen({ type: 'channel', channelKey: channel.key })}
                      >
                        {channel.imageUrl ? (
                          <ExpoImage
                            source={{ uri: channel.imageUrl }}
                            contentFit="cover"
                            cachePolicy="memory-disk"
                            style={styles.channelChipImage}
                          />
                        ) : (
                          <View style={styles.channelChipPlaceholder}>
                            <Text style={{ color: theme.colors.textMuted, fontSize: 13, fontWeight: '600' }}>
                              /{channel.key.charAt(0).toUpperCase()}
                            </Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    ))}
                    <View style={{width:16}}/>
                  </ScrollView>
                )}

                {/* Loading state intentionally renders nothing. Stale
                    casts (if any) stay visible while the refresh runs;
                    when the refresh resolves, the list updates in
                    place. Avoids the flash of an empty/loading panel
                    on every tab visit. */}

                {!searchActive && error && (
                  <TouchableOpacity style={styles.errorCard} onPress={() => refetch()}>
                    <Text style={styles.errorText}>{error}</Text>
                    <Text style={styles.errorHint}>Tap to retry</Text>
                  </TouchableOpacity>
                )}

                {!searchActive && showEmpty && (
                  <View style={styles.stateCard}>
                    <Text style={styles.stateText}>No casts match this filter yet.</Text>
                  </View>
                )}

                {/* Search Loading */}
                {searchActive && isSearchLoading && (
                  <View style={styles.stateCard}>
                    <ActivityIndicator color={theme.colors.accent} />
                    <Text style={styles.stateText}>Searching...</Text>
                  </View>
                )}
              </>
            }
            ListFooterComponent={
              (isFetchingMoreUsers || isFetchingMoreChannels || isFetchingMoreCasts) ? (
                <View style={styles.loadingMore}>
                  <ActivityIndicator color={theme.colors.accent} />
                </View>
              ) : null
            }
            renderItem={renderSearchResultItem}
          />
          ) : activeFilter === 'governance' ? (
            <View style={{ flex: 1 }}>
              {/* Search + filter row above governance */}
              <View style={[styles.searchContainer, { flexShrink: 0 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={[styles.searchInputContainer, { flex: 1 }]}>
                    <IconSymbol name="magnifyingglass" size={18} color={theme.colors.textMuted} />
                    <TextInput
                      style={styles.searchInput}
                      placeholder="Search users, channels, casts..."
                      placeholderTextColor={theme.colors.textMuted}
                      value={searchQuery}
                      onChangeText={setSearchQuery}
                      onFocus={() => setSearchActive(true)}
                      returnKeyType="search"
                    />
                    {searchQuery.length > 0 && (
                      <TouchableOpacity onPress={() => setSearchQuery('')}>
                        <IconSymbol name="xmark.circle.fill" size={18} color={theme.colors.textMuted} />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[styles.filtersRow, { flexShrink: 0, flexGrow: 0 }]}>
                <View style={{width:16}}/>
                {filters.map((filter) => {
                  const isActive = activeFilter === filter.id;
                  return (
                    <TouchableOpacity
                      key={filter.id}
                      style={[styles.filterChip, isActive && styles.filterChipActive]}
                      onPress={() => setActiveFilter(filter.id)}
                    >
                      <IconSymbol
                        name={filter.icon}
                        color={isActive ? theme.colors.surface0 : theme.colors.accent}
                        size={14}
                      />
                      <Text
                        style={[
                          styles.filterChipText,
                          { color: isActive ? theme.colors.surface0 : theme.colors.accent },
                        ]}
                      >
                        {filter.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
                <View style={{width:16}}/>
              </ScrollView>
              <GovernanceView
                theme={theme}
                onOpenProposal={(id) => pushScreen({ type: 'proposal', proposalId: id })}
              />
            </View>
          ) : (
            /* Regular Feed FlashList — flips to a 3-wide Instagram-
               style grid when the user selects the "Media" filter.
               Same underlying data + pagination + refresh control;
               only the cell renderer and column count change. */
            <FlashList
              ref={feedListRef}
              key={activeFilter === 'media' ? 'media-grid' : 'list'}
              data={
                activeFilter === 'media'
                  ? filteredPosts.filter((p) => p.mediaUrls.length > 0 || p.videos.some((v) => v.thumbnailUrl))
                  : filteredPosts
              }
              numColumns={activeFilter === 'media' ? 3 : 1}
              // Hint FlashList with the row size so recycling computes
              // accurate slot positions without measuring during scroll.
              // Grid mode: a single tile is one row's height. Card mode:
              // an average post is ~400px once media + actions are
              // accounted for.
              estimatedItemSize={activeFilter === 'media' ? GRID_TILE_SIZE : 400}
              extraData={likeStates}
              keyExtractor={(item) => item.id}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.contentContainer}
              onEndReached={() => {
                if (hasNextPage && !isFetchingNextPage) {
                  fetchNextPage();
                }
              }}
              onEndReachedThreshold={0.5}
              onScroll={(e) => {
                const y = e.nativeEvent.contentOffset.y;
                feedScrollYRef.current = y;
                const h = searchBarHeightRef.current;
                if (h <= 0) return;
                const out = y > h - 8;
                setSearchBarOutOfView((prev) => (prev === out ? prev : out));
              }}
              scrollEventThrottle={64}
              refreshControl={
                <RefreshControl
                  refreshing={isRefetching}
                  onRefresh={handleRefresh}
                  tintColor={theme.colors.textMain}
                />
              }
              ListHeaderComponent={
                <>
                  {/* Search Input */}
                  <View
                    style={styles.searchContainer}
                    onLayout={(e) => {
                      searchBarHeightRef.current = e.nativeEvent.layout.height;
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      {/* Avatar (top-left) — only in route mode. The
                          modal presentation has its own dismiss
                          affordance and doesn't need a header avatar. */}
                      {isRouteMode && <HeaderAvatar />}
                      <View style={[styles.searchInputContainer, { flex: 1 }]}>
                        <IconSymbol name="magnifyingglass" size={18} color={theme.colors.textMuted} />
                        <TextInput
                          style={styles.searchInput}
                          placeholder="Search users, channels, casts..."
                          placeholderTextColor={theme.colors.textMuted}
                          value={searchQuery}
                          onChangeText={setSearchQuery}
                          onFocus={() => setSearchActive(true)}
                          returnKeyType="search"
                        />
                        {searchQuery.length > 0 && (
                          <TouchableOpacity onPress={() => setSearchQuery('')}>
                            <IconSymbol name="xmark.circle.fill" size={18} color={theme.colors.textMuted} />
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  </View>

                  {/* Filter selector — round icon buttons, no text.
                      The icon alone carries the meaning ("All" =
                      rectangle stack, "Media" = play.rectangle, etc.),
                      and the active state is shown by filled background. */}
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filtersRow}>
                    <View style={{width:16}}/>
                    {filters.map((filter) => {
                      const isActive = activeFilter === filter.id;
                      return (
                        <TouchableOpacity
                          key={filter.id}
                          accessibilityLabel={filter.label}
                          style={[styles.filterChip, isActive && styles.filterChipActive]}
                          onPress={() => setActiveFilter(filter.id)}
                        >
                          <IconSymbol
                            name={filter.icon}
                            color={isActive ? theme.colors.surface0 : theme.colors.accent}
                            size={18}
                          />
                        </TouchableOpacity>
                      );
                    })}
                    {/* User's followed channels as round image chips.
                        Channel image fills the circle; no text. Falls
                        back to a tinted placeholder when the channel
                        has no image set. */}
                    {followedChannels && followedChannels.slice(0, 10).map((channel) => (
                      <TouchableOpacity
                        key={channel.key}
                        accessibilityLabel={channel.name}
                        style={styles.filterChip}
                        onPress={() => pushScreen({ type: 'channel', channelKey: channel.key })}
                      >
                        {channel.imageUrl ? (
                          <ExpoImage
                            source={{ uri: channel.imageUrl }}
                            contentFit="cover"
                            cachePolicy="memory-disk"
                            style={styles.channelChipImage}
                          />
                        ) : (
                          <View style={styles.channelChipPlaceholder}>
                            <Text style={{ color: theme.colors.textMuted, fontSize: 13, fontWeight: '600' }}>
                              /{channel.key.charAt(0).toUpperCase()}
                            </Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    ))}
                    <View style={{width:16}}/>
                  </ScrollView>

                  {isLoading && posts.length === 0 && (
                    <View style={styles.stateSpinner}>
                      <ActivityIndicator color={theme.colors.textMuted} />
                    </View>
                  )}

                  {error && (
                    <TouchableOpacity style={styles.errorCard} onPress={() => refetch()}>
                      <Text style={styles.errorText}>{error}</Text>
                      <Text style={styles.errorHint}>Tap to retry</Text>
                    </TouchableOpacity>
                  )}

                  {showEmpty && (
                    <View style={styles.stateCard}>
                      <Text style={styles.stateText}>No casts match this filter yet.</Text>
                    </View>
                  )}
                </>
              }
              ListFooterComponent={
                isFetchingNextPage ? (
                  <View style={styles.loadingMore}>
                    <ActivityIndicator color={theme.colors.accent} />
                  </View>
                ) : null
              }
              renderItem={({ item: post }) =>
                activeFilter === 'media' ? (
                  <MediaGridCell
                    post={post}
                    theme={theme}
                    onPress={() =>
                      handleNavigateToThread(
                        post.username,
                        post.hash.slice(0, 10),
                        false,
                        feedPostToCastPlaceholder(post),
                      )
                    }
                  />
                ) : (
                  <FeedPostCard
                    post={post}
                    theme={theme}
                    styles={styles}
                    likeState={likeStates.get(post.hash)}
                    recastState={recastStates.get(post.hash)}
                    followState={followStates.get(post.authorFid)}
                    token={token}
                    currentUserFid={currentUserFid}
                    onNavigateToThread={handleNavigateToThread}
                    onNavigateToProfile={handleNavigateToProfile}
                    onOpenChannel={openChannel}
                    onMentionPress={handleMentionPress}
                    onLinkPress={openMiniApp}
                    onImagePress={(images, index) => setFeedViewerState({ images, index })}
                    onLikeToggle={handleLikeToggle}
                    onOpenShareSheet={handleOpenShareSheet}
                    onFollow={handleFollow}
                  />
                )
              }
            />
          )}

          {/* Farcaster Account Required Overlay */}
          {!token && (
            <View style={styles.farcasterRequiredOverlay}>
              <View style={styles.farcasterRequiredContent}>
                <IconSymbol name="person.crop.circle.badge.exclamationmark" size={48} color={theme.colors.warning} />
                <Text style={styles.farcasterRequiredTitle}>Farcaster Account Required</Text>
                <Text style={styles.farcasterRequiredMessage}>
                  The social feed requires a Farcaster account. You can import your Farcaster account in Settings to view and interact with the feed.
                </Text>
              </View>
            </View>
          )}

          {/* Floating Action Button */}
          {token && activeFilter !== 'governance' && (
            <TouchableOpacity
              style={styles.fab}
              onPress={() => {
                // Pre-fill the channel target if the user opened compose from a channel screen
                setComposeChannelKey(selectedChannel?.channelKey);
                setComposeVisible(true);
              }}
              activeOpacity={0.8}
            >
              <IconSymbol name="plus" color={theme.colors.surface0} size={20} />
            </TouchableOpacity>
          )}

          {/* Floating search shortcut — appears top-right once the inline
              search bar has scrolled out of view. Tapping opens a detached
              floating search box (NO scroll back to the inline bar). */}
          {searchBarOutOfView && !floatingSearchVisible && (
            <TouchableOpacity
              onPress={() => {
                setFloatingSearchVisible(true);
                // Focus on next frame so the input is mounted.
                setTimeout(() => floatingSearchInputRef.current?.focus(), 50);
              }}
              activeOpacity={0.8}
              style={{
                position: 'absolute',
                top: 8,
                right: 16,
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: theme.colors.surface2,
                borderWidth: 1,
                borderColor: theme.colors.surface3,
                alignItems: 'center',
                justifyContent: 'center',
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.2,
                shadowRadius: 4,
                elevation: 4,
              }}
            >
              <IconSymbol name="magnifyingglass" size={18} color={theme.colors.textMain} />
            </TouchableOpacity>
          )}

          {/* Detached floating search overlay — replaces the icon when
              active. Bound to the same `searchQuery` as the inline input
              so search results behave identically. Closing the overlay
              clears the query and the search-active flag so the user
              returns cleanly to the feed. */}
          {floatingSearchVisible && (
            <View
              style={{
                position: 'absolute',
                top: 8,
                left: 16,
                right: 16,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                backgroundColor: theme.colors.surface2,
                borderWidth: 1,
                borderColor: theme.colors.surface3,
                borderRadius: 20,
                paddingHorizontal: 12,
                paddingVertical: 8,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.25,
                shadowRadius: 6,
                elevation: 6,
              }}
            >
              <IconSymbol name="magnifyingglass" size={18} color={theme.colors.textMuted} />
              <TextInput
                ref={floatingSearchInputRef}
                style={{ flex: 1, fontSize: 15, color: theme.colors.textMain, paddingVertical: 0, minHeight: 24 }}
                placeholder="Search users, channels, casts..."
                placeholderTextColor={theme.colors.textMuted}
                value={searchQuery}
                onChangeText={(t) => {
                  setSearchQuery(t);
                  if (t.length > 0) setSearchActive(true);
                }}
                onFocus={() => setSearchActive(true)}
                returnKeyType="search"
                autoFocus
              />
              <TouchableOpacity
                onPress={() => {
                  setFloatingSearchVisible(false);
                  setSearchQuery('');
                  setSearchActive(false);
                }}
                hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
              >
                <IconSymbol name="xmark.circle.fill" size={20} color={theme.colors.textMuted} />
              </TouchableOpacity>
            </View>
          )}

          {/* Navigation Stack - render screens above feed */}
          {navStack.slice(1).map((screen, index) => {
            const stackIndex = index + 1;
            const isTopScreen = stackIndex === navStack.length - 1;

            // Wrap content with gesture detector for swipe-back on top screen
            const wrapWithGesture = (content: React.ReactNode, key: string) => {
              if (isTopScreen) {
                return (
                  <GestureDetector key={key} gesture={swipeBackGesture}>
                    <ReanimatedView style={[styles.stackScreen, { zIndex: 10 + stackIndex }, swipeAnimatedStyle]}>
                      {content}
                    </ReanimatedView>
                  </GestureDetector>
                );
              }
              return (
                <View key={key} style={[styles.stackScreen, { zIndex: 10 + stackIndex }]}>
                  {content}
                </View>
              );
            };

            if (screen.type === 'thread') {
              return wrapWithGesture(
                <ThreadDetailView
                  username={screen.username}
                  castHashPrefix={screen.castHashPrefix}
                  focusReply={screen.focusReply}
                  placeholderCast={screen.placeholderCast}
                  token={token}
                  theme={theme}
                  onClose={popScreen}
                  onOpenMiniApp={openMiniApp}
                  onOpenProfile={(fid, username) => pushScreen({ type: 'profile', fid, username })}
                  onOpenChannel={(channelKey) => pushScreen({ type: 'channel', channelKey })}
                  onOpenThread={(username, hashPrefix, placeholderCast) => pushScreen({ type: 'thread', username, castHashPrefix: hashPrefix, placeholderCast })}
                  likeStates={likeStates}
                  onLikeToggle={handleLikeToggle}
                  recastStates={recastStates}
                  onRecastToggle={handleRecastToggle}
                  onQuoteCast={handleQuoteCast}
                  onShareToChat={handleShareToChat}
                  followStates={followStates}
                  onFollow={handleFollow}
                  bottomInset={insets.bottom}
                  currentUserFid={currentUserFid}
                  maxCastLength={maxCastLength}
                  regularCastByteLimit={regularCastByteLimit}
                />,
                `thread-${screen.castHashPrefix}-${stackIndex}`
              );
            }

            if (screen.type === 'profile') {
              return wrapWithGesture(
                <ProfileView
                  fid={screen.fid}
                  token={token}
                  theme={theme}
                  currentUserFid={currentUserFid}
                  onClose={popScreen}
                  onOpenThread={(username, hashPrefix, placeholderCast) => pushScreen({ type: 'thread', username, castHashPrefix: hashPrefix, placeholderCast })}
                  onOpenMiniApp={openMiniApp}
                  onOpenProfile={(fid, username) => pushScreen({ type: 'profile', fid, username })}
                  onOpenChannel={(channelKey) => pushScreen({ type: 'channel', channelKey })}
                  likeStates={likeStates}
                  onLikeToggle={handleLikeToggle}
                  bottomInset={insets.bottom}
                />,
                `profile-${screen.fid}-${stackIndex}`
              );
            }

            if (screen.type === 'channel') {
              return wrapWithGesture(
                <ChannelView
                  channelKey={screen.channelKey}
                  token={token}
                  theme={theme}
                  currentUserFid={currentUserFid}
                  onClose={popScreen}
                  onOpenThread={(username, hashPrefix, placeholderCast) => pushScreen({ type: 'thread', username, castHashPrefix: hashPrefix, placeholderCast })}
                  onOpenMiniApp={openMiniApp}
                  onOpenProfile={(fid, username) => pushScreen({ type: 'profile', fid, username })}
                  onOpenChannel={(channelKey) => pushScreen({ type: 'channel', channelKey })}
                  likeStates={likeStates}
                  onLikeToggle={handleLikeToggle}
                  bottomInset={insets.bottom}
                />,
                `channel-${screen.channelKey}-${stackIndex}`
              );
            }

            if (screen.type === 'proposal') {
              return wrapWithGesture(
                <ProposalDetailView
                  proposalId={screen.proposalId}
                  theme={theme}
                  onClose={popScreen}
                  keyboardHeight={keyboardHeight}
                  userPanelHeight={userPanelHeight}
                />,
                `proposal-${screen.proposalId}-${stackIndex}`
              );
            }

            return null;
          })}
          
          {/* Compose Modal */}
          {composeVisible && (
            <KeyboardAvoidingView
              style={styles.composeOverlay}
              behavior="padding"
              keyboardVerticalOffset={insets.top}
            >
              <Pressable style={styles.composeBackdrop} onPress={handleCancelCompose} />
              <View style={[styles.composeModal, keyboardHeight > 0 && { paddingBottom: insets.bottom }]}>
                <View style={styles.composeHeader}>
                  <TouchableOpacity onPress={handleCancelCompose}>
                    <Text style={styles.composeCancel}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={async () => {
                      await handleSubmitCast();
                      if (!postError) {
                        setComposeVisible(false);
                      }
                    }}
                    disabled={!canPost}
                    style={[styles.composePostButton, !canPost && styles.composePostButtonDisabled]}
                  >
                    {posting ? (
                      <ActivityIndicator color={theme.colors.surface0} size="small" />
                    ) : (
                      <Text style={[styles.composePostText, !canPost && styles.composePostTextDisabled]}>Post</Text>
                    )}
                  </TouchableOpacity>
                </View>
                <View style={{ position: 'relative' }}>
                  {/* Mention autocomplete for compose */}
                  {composeMentionInfo && (
                    <View style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, zIndex: 10 }}>
                      <MentionAutocomplete
                        mentionInfo={composeMentionInfo}
                        token={token}
                        onSelectUser={handleComposeSelectUser}
                        onSelectChannel={handleComposeSelectChannel}
                        theme={theme}
                        maxHeight={180}
                      />
                    </View>
                  )}
                  <TextInput
                    multiline
                    autoFocus
                    placeholder={composeChannelKey ? `Cast in /${composeChannelKey}…` : "What's happening?"}
                    placeholderTextColor={theme.colors.textMuted}
                    style={styles.composeInput}
                    value={castText}
                    editable={!posting}
                    onChangeText={handleChangeText}
                    onSelectionChange={(e) => {
                      setCastCursorPosition(e.nativeEvent.selection.end);
                    }}
                  />
                </View>
                {/* Channel target chip — tap to open picker; long-press clears. */}
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                  <TouchableOpacity
                    onPress={() => setComposeChannelPickerVisible(true)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 4,
                      paddingHorizontal: 10,
                      paddingVertical: 5,
                      borderRadius: 14,
                      borderWidth: 1,
                      borderColor: theme.colors.surface3,
                      backgroundColor: composeChannelKey ? theme.colors.surface2 : 'transparent',
                    }}
                  >
                    <IconSymbol
                      name={composeChannelKey ? 'number' : 'house.fill'}
                      size={11}
                      color={composeChannelKey ? theme.colors.accent : theme.colors.textMuted}
                    />
                    <Text style={{ fontSize: 12, color: composeChannelKey ? theme.colors.textMain : theme.colors.textMuted, fontWeight: '500' }}>
                      {composeChannelKey ? `/${composeChannelKey}` : 'Home feed'}
                    </Text>
                    <IconSymbol name="chevron.down" size={10} color={theme.colors.textMuted} />
                  </TouchableOpacity>
                </View>
                {quoteCastEmbed && (
                  <View style={styles.quotePreview}>
                    <View style={styles.quotePreviewContent}>
                      <Text style={styles.quotePreviewAuthor}>@{quoteCastEmbed.author}</Text>
                      <Text style={styles.quotePreviewText} numberOfLines={2}>
                        {quoteCastEmbed.text}
                      </Text>
                    </View>
                    <TouchableOpacity onPress={() => setQuoteCastEmbed(null)} style={styles.quotePreviewRemove}>
                      <IconSymbol name="xmark.circle.fill" size={20} color={theme.colors.textMuted} />
                    </TouchableOpacity>
                  </View>
                )}
                {/* Image previews */}
                {selectedImages.length > 0 && (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={{ marginBottom: 12 }}
                    contentContainerStyle={{ gap: 8 }}
                  >
                    {selectedImages.map((image, index) => (
                      <View key={index} style={{ position: 'relative' }}>
                        <Image
                          source={{ uri: image.localUri }}
                          style={{
                            width: 100,
                            height: 100,
                            borderRadius: 8,
                            backgroundColor: theme.colors.surface3,
                          }}
                          resizeMode="cover"
                        />
                        <TouchableOpacity
                          onPress={() => handleRemoveImage(index)}
                          style={{
                            position: 'absolute',
                            top: 4,
                            right: 4,
                            width: 24,
                            height: 24,
                            borderRadius: 12,
                            backgroundColor: 'rgba(0,0,0,0.6)',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <IconSymbol name="xmark" size={14} color="#fff" />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </ScrollView>
                )}
                {/* Mini app embed previews */}
                {miniAppEmbeds.length > 0 && (
                  <View style={{ marginBottom: 12, gap: 8 }}>
                    {miniAppEmbeds.map((embedUrl, index) => (
                      <View
                        key={index}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          backgroundColor: theme.colors.surface2,
                          borderRadius: 8,
                          padding: 10,
                        }}
                      >
                        <IconSymbol name="link" size={16} color={theme.colors.textMuted} />
                        <Text
                          style={{
                            flex: 1,
                            marginLeft: 8,
                            color: theme.colors.text,
                            fontSize: 13,
                          }}
                          numberOfLines={1}
                        >
                          {embedUrl}
                        </Text>
                        <TouchableOpacity
                          onPress={() => setMiniAppEmbeds(prev => prev.filter((_, i) => i !== index))}
                          style={{ marginLeft: 8 }}
                        >
                          <IconSymbol name="xmark.circle.fill" size={20} color={theme.colors.textMuted} />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}
                <View style={styles.composeFooter}>
                  <TouchableOpacity
                    onPress={handlePickImage}
                    disabled={posting || selectedImages.length >= 2}
                    style={{ opacity: selectedImages.length >= 2 ? 0.5 : 1 }}
                  >
                    <IconSymbol
                      name="photo"
                      size={24}
                      color={theme.colors.accent}
                    />
                  </TouchableOpacity>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[
                      styles.composeCharCount,
                      castText.length > regularCastByteLimit && castText.length <= maxCastLength && { color: theme.colors.warning || '#FFA500' }
                    ]}>
                      {castText.length}/{maxCastLength}
                    </Text>
                    {castText.length > regularCastByteLimit && castText.length <= maxCastLength && (
                      <Text style={{ fontSize: 11, color: theme.colors.warning || '#FFA500', marginTop: 2 }}>
                        Only first {regularCastByteLimit} chars visible on timeline
                      </Text>
                    )}
                  </View>
                </View>
                {postError && (
                  <Text style={styles.composeError}>{postError}</Text>
                )}
              </View>
            </KeyboardAvoidingView>
          )}

          {/* Compose target channel picker */}
          <ComposeChannelPickerModal
            visible={composeChannelPickerVisible}
            onClose={() => setComposeChannelPickerVisible(false)}
            value={composeChannelKey}
            onPick={(key) => setComposeChannelKey(key)}
          />



          {/* Feed Image Viewer */}
          <ImageViewer
            visible={feedViewerState !== null}
            images={feedViewerState?.images}
            initialIndex={feedViewerState?.index ?? 0}
            onClose={() => setFeedViewerState(null)}
          />

          {/* Feed Share Action Sheet */}
          <ShareActionSheet
            visible={feedShareSheet !== null}
            castHash={feedShareSheet?.hash ?? ''}
            castAuthor={feedShareSheet?.author ?? ''}
            isRecasted={feedShareSheet?.isRecasted ?? false}
            recastCount={feedShareSheet?.recastCount ?? 0}
            token={token}
            theme={theme}
            bottomInset={insets.bottom}
            onClose={() => setFeedShareSheet(null)}
            onRecast={() => {
              if (feedShareSheet) {
                const { hash, isRecasted, recastCount } = feedShareSheet;
                setFeedShareSheet(null); // Close the share sheet first
                handleRecastToggle(hash, isRecasted, recastCount);
              }
            }}
            onQuote={() => {
              if (feedShareSheet) {
                const { hash, author, text } = feedShareSheet;
                setFeedShareSheet(null); // Close the share sheet first
                handleQuoteCast(hash, author, text);
              }
            }}
            onShareToChat={() => {
              if (feedShareSheet) {
                const castUrl = `https://warpcast.com/${feedShareSheet.author}/${feedShareSheet.hash.slice(0, 10)}`;
                handleShareToChat(castUrl);
              }
            }}
            onNativeShare={async () => {
              if (feedShareSheet) {
                const castUrl = `https://warpcast.com/${feedShareSheet.author}/${feedShareSheet.hash.slice(0, 10)}`;
                try {
                  await Share.share({
                    message: castUrl,
                    url: castUrl,
                  });
                } catch {
                  // User cancelled share — no action needed
                }
              }
            }}
          />

          {/* Share to Chat Modal */}
          <ShareToChatModal
            visible={shareToChatUrl !== null}
            castUrl={shareToChatUrl ?? ''}
            theme={theme}
            bottomInset={insets.bottom}
            onClose={() => setShareToChatUrl(null)}
            onSent={() => {
              setShareToChatUrl(null);
              setFeedShareSheet(null);
            }}
          />

          {/* Mini App Browser */}
          <BrowserModal
            visible={selectedMiniApp !== null}
            url={selectedMiniApp?.url ?? ''}
            onClose={() => setSelectedMiniApp(null)}
          />
        </Animated.View>
        {/* Bottom spacer to align with userPanel - uses layout constraint instead of padding */}
        <View style={{ height: userPanelHeight }} />
      </View>
    </View>
  );
});

export default SocialFeedModal;

const createStyles = (theme: AppTheme, isDark: boolean, insets: EdgeInsets) =>
  StyleSheet.create({
    overlay: {
      ...StyleSheet.absoluteFillObject,
    },
    container: {
      flex: 1,
      paddingTop: insets.top,
      backgroundColor: theme.colors.surface1,
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
    },
    modalContent: {
      flex: 1,
      backgroundColor: theme.colors.surface1,
    },
    contentContainer: {
      flexGrow: 1,
      paddingBottom: 32,
    },
    loadingMore: {
      paddingVertical: 20,
      alignItems: 'center',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    title: {
      color: theme.colors.textStrong,
      fontSize: 20,
      fontFamily: theme.fonts.bold.fontFamily,
      fontWeight: theme.fonts.bold.fontWeight,
    },
    subtitle: {
      color: theme.colors.textMuted,
      marginTop: 2,
      fontSize: 13,
      fontFamily: theme.fonts.regular.fontFamily,
    },
    refreshButton: {
      padding: 10,
      borderRadius: 999,
      backgroundColor: theme.colors.surface3,
    },
    trendingCard: {
      backgroundColor: theme.colors.surface2,
      borderRadius: 18,
      padding: 16,
    },
    trendingHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 12,
      gap: 8,
    },
    trendingTitle: {
      color: theme.colors.textStrong,
      fontFamily: theme.fonts.medium.fontFamily,
      fontWeight: theme.fonts.medium.fontWeight,
    },
    trendingList: {
      gap: 10,
    },
    trendingRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    trendingLabel: {
      color: theme.colors.textMain,
      fontFamily: theme.fonts.regular.fontFamily,
    },
    trendingDelta: {
      color: theme.colors.success,
      fontFamily: theme.fonts.medium.fontFamily,
      fontWeight: theme.fonts.medium.fontWeight,
    },
    filtersRow: {
      marginTop: 4,
      // Bottom padding so the filter pills don't butt directly against
      // the content below — particularly the media grid, which would
      // otherwise touch the active filter chip without any breathing
      // room. Card-list mode has the post card's own padding, but the
      // grid cells run edge-to-edge so the row needs its own gap.
      marginBottom: 8,
    },
    filterChip: {
      // Round icon-only button. Width = height for a perfect circle.
      // Active state filled with primary, inactive uses surface3.
      // overflow: hidden so the channel image clips to the circle.
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: theme.colors.surface3,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      marginRight: 10,
    },
    channelChipImage: {
      width: 36,
      height: 36,
    },
    channelChipPlaceholder: {
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
    },
    filterChipActive: {
      backgroundColor: theme.colors.primary,
    },
    filterChipText: {
      fontFamily: theme.fonts.medium.fontFamily,
      fontWeight: theme.fonts.medium.fontWeight,
      fontSize: 13,
    },
    stateCard: {
      backgroundColor: theme.colors.surface2,
      borderRadius: 16,
      padding: 20,
      marginHorizontal: 20,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    /** Lightweight loading indicator — bare spinner, no card/text.
     *  Replaces the "Loading Farcaster feed…" panel that was visually
     *  too heavy for what's a transient state. */
    stateSpinner: {
      paddingVertical: 32,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stateText: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.regular.fontFamily,
      textAlign: 'center',
    },
    errorCard: {
      backgroundColor: theme.colors.surface2,
      borderRadius: 16,
      padding: 16,
      marginHorizontal: 20,
      borderWidth: 1,
      borderColor: theme.colors.danger,
      gap: 4,
    },
    errorText: {
      color: theme.colors.danger,
      fontFamily: theme.fonts.medium.fontFamily,
      fontWeight: theme.fonts.medium.fontWeight,
    },
    errorHint: {
      color: theme.colors.textMuted,
      fontSize: 12,
    },
    postCard: {
      backgroundColor: 'transparent',
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.surface3,
      paddingTop: 12,
      paddingBottom: 14,
      paddingHorizontal: 12,
      gap: 10,
    },
    postHeader: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    avatarContainer: {
      position: 'relative',
      marginRight: 12,
    },
    avatar: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: theme.colors.surface4,
    },
    followButton: {
      position: 'absolute',
      bottom: -2,
      right: -2,
      width: 18,
      height: 18,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: theme.colors.background,
    },
    postAuthor: {
      flex: 1,
    },
    authorRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    authorName: {
      color: theme.colors.textStrong,
      fontFamily: theme.fonts.medium.fontFamily,
      fontWeight: theme.fonts.medium.fontWeight,
      fontSize: 15,
    },
    channelLabel: {
      color: theme.colors.textMuted,
      fontSize: 13,
      fontFamily: theme.fonts.regular.fontFamily,
      opacity: 0.7,
    },
    authorHandle: {
      color: theme.colors.textMuted,
      fontSize: 13,
      marginTop: 2,
    },
    postContent: {
      color: theme.colors.textMain,
      fontSize: 15,
      lineHeight: 20,
      fontFamily: theme.fonts.regular.fontFamily,
    },
    mediaContainer: {
      marginHorizontal: -16,
    },
    postMedia: {
      backgroundColor: theme.colors.surface3,
    },
    mediaCarousel: {
      // height is set dynamically by AutoHeightImage
    },
    carouselImage: {
      backgroundColor: theme.colors.surface3,
    },
    tagsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    tagPill: {
      backgroundColor: theme.colors.surface3,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 999,
    },
    tagText: {
      color: theme.colors.textMuted,
      fontSize: 12,
    },
    postStats: {
      flexDirection: 'row',
      justifyContent: 'flex-start',
      gap: 16,
      marginTop: 4,
    },
    statButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    statText: {
      color: theme.colors.textMain,
      fontFamily: theme.fonts.medium.fontFamily,
      fontWeight: theme.fonts.medium.fontWeight,
    },
    fab: {
      position: 'absolute',
      bottom: 16,
      right: 16,
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: theme.colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOpacity: 0.25,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 4 },
      elevation: 8,
    },
    composeOverlay: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 1000,
      justifyContent: 'flex-end',
    },
    composeBackdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.5)',
    },
    composeModal: {
      backgroundColor: theme.colors.surface1,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingHorizontal: 20,
      paddingBottom: insets.bottom + 20,
      minHeight: 200,
    },
    composeHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 16,
    },
    composeCancel: {
      color: theme.colors.textMuted,
      fontSize: 16,
      fontFamily: theme.fonts.regular.fontFamily,
    },
    composePostButton: {
      backgroundColor: theme.colors.accent,
      paddingHorizontal: 20,
      paddingVertical: 8,
      borderRadius: 999,
    },
    composePostButtonDisabled: {
      backgroundColor: theme.colors.surface4,
    },
    composePostText: {
      color: theme.colors.surface0,
      fontSize: 15,
      fontFamily: theme.fonts.medium.fontFamily,
      fontWeight: theme.fonts.medium.fontWeight,
    },
    composePostTextDisabled: {
      color: theme.colors.textMuted,
    },
    composeInput: {
      color: theme.colors.textMain,
      fontSize: 18,
      fontFamily: theme.fonts.regular.fontFamily,
      lineHeight: 24,
      minHeight: 100,
      maxHeight: 200,
      textAlignVertical: 'top',
    },
    composeFooter: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: theme.colors.surface3,
    },
    composeCharCount: {
      color: theme.colors.textMuted,
      fontSize: 13,
    },
    composeError: {
      color: theme.colors.danger,
      fontSize: 13,
      marginTop: 8,
    },
    quotePreview: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      backgroundColor: theme.colors.surface2,
      borderRadius: 8,
      borderLeftWidth: 3,
      borderLeftColor: theme.colors.primary,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginBottom: 8,
    },
    quotePreviewContent: {
      flex: 1,
    },
    quotePreviewAuthor: {
      color: theme.colors.primary,
      fontSize: 13,
      fontFamily: theme.fonts.medium.fontFamily,
      marginBottom: 4,
    },
    quotePreviewText: {
      color: theme.colors.textMain,
      fontSize: 13,
      lineHeight: 18,
    },
    quotePreviewRemove: {
      marginLeft: 8,
      padding: 4,
    },
    threadOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: theme.colors.surface1,
      zIndex: 10,
    },
    profileOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: theme.colors.surface1,
      zIndex: 20,
    },
    channelOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: theme.colors.surface1,
      zIndex: 15,
    },
    stackScreen: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: theme.colors.surface1,
    },
    farcasterRequiredOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0, 0, 0, 0.85)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
      zIndex: 100,
    },
    farcasterRequiredContent: {
      backgroundColor: theme.colors.surface,
      borderRadius: 16,
      padding: 24,
      width: '100%',
      maxWidth: 340,
      alignItems: 'center',
    },
    farcasterRequiredTitle: {
      fontSize: 18,
      fontFamily: theme.fonts.medium.fontFamily,
      fontWeight: theme.fonts.medium.fontWeight,
      color: theme.colors.textMain,
      textAlign: 'center',
      marginTop: 16,
      marginBottom: 12,
    },
    farcasterRequiredMessage: {
      fontSize: 14,
      color: theme.colors.textMuted,
      textAlign: 'center',
      lineHeight: 20,
    },
    // Search styles
    searchContainer: {
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 4,
    },
    searchInputContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.colors.surface3,
      borderRadius: 12,
      paddingHorizontal: 12,
      height: 40,
    },
    searchInput: {
      flex: 1,
      fontSize: 15,
      color: theme.colors.textMain,
      marginLeft: 8,
      paddingVertical: 0,
    },
    searchCancelButton: {
      paddingLeft: 12,
      paddingVertical: 8,
    },
    searchCancelText: {
      color: theme.colors.accent,
      fontSize: 15,
      fontFamily: theme.fonts.medium.fontFamily,
    },
    searchTabsContainer: {
      flexDirection: 'row',
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 8,
      gap: 8,
    },
    searchTab: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 20,
      backgroundColor: theme.colors.surface3,
    },
    searchTabActive: {
      backgroundColor: theme.colors.primary,
    },
    searchTabText: {
      fontSize: 14,
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium.fontFamily,
    },
    searchTabTextActive: {
      color: theme.colors.surface0,
    },
    searchResultItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
      gap: 12,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.surface3,
    },
    searchResultAvatar: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: theme.colors.surface4,
    },
    searchResultInfo: {
      flex: 1,
    },
    searchResultName: {
      fontSize: 15,
      fontFamily: theme.fonts.medium.fontFamily,
      color: theme.colors.textMain,
    },
    searchResultUsername: {
      fontSize: 13,
      color: theme.colors.textMuted,
      marginTop: 2,
    },
    searchResultBio: {
      fontSize: 13,
      color: theme.colors.textMuted,
      marginTop: 4,
      lineHeight: 18,
    },
    searchResultFollowers: {
      fontSize: 12,
      color: theme.colors.textMuted,
      marginTop: 4,
    },
    searchSectionHeader: {
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 8,
    },
    searchSectionTitle: {
      fontSize: 13,
      fontFamily: theme.fonts.medium.fontFamily,
      color: theme.colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    channelImage: {
      width: 44,
      height: 44,
      borderRadius: 8,
      backgroundColor: theme.colors.surface4,
    },
    channelTabImage: {
      width: 24,
      height: 24,
      borderRadius: 4,
      backgroundColor: theme.colors.surface4,
    },
  });

function formatTimestamp(timestamp?: number) {
  if (!timestamp) {
    return '';
  }
  const diff = Math.max(Date.now() - timestamp, 0);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) {
    return `${Math.max(1, Math.floor(diff / 1000))}s`;
  }
  if (diff < hour) {
    return `${Math.floor(diff / minute)}m`;
  }
  if (diff < day) {
    return `${Math.floor(diff / hour)}h`;
  }
  const date = new Date(timestamp);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatCount(value?: number) {
  if (!value) {
    return '0';
  }
  return value.toLocaleString();
}

function deriveFilter(cast: any, hasMedia: boolean): FeedFilter {
  if (hasMedia) {
    return 'media';
  }
  const channelTags = cast.tags?.map((tag: any) => (tag.id || tag.name || '').toLowerCase()) ?? [];
  if (channelTags.some((tag: string) => tag.includes('node'))) {
    return 'node-ops';
  }
  if (channelTags.some((tag: string) => tag.includes('event'))) {
    return 'events';
  }
  return 'all';
}
