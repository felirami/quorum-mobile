import BrowserModal from '@/components/BrowserModal';
import { IconSymbol, type IconSymbolName } from '@/components/ui/IconSymbol';
import { useConversations, type ConversationWithPreview } from '@/hooks/chat/useConversations';
import { useSendDirectMessage } from '@/hooks/chat/useSendDirectMessage';
import { useSendSpaceMessage } from '@/hooks/chat/useSendSpaceMessage';
import { useSpaces } from '@/hooks/chat/useSpaces';
import { useFarcasterChannel, type ChannelCast } from '@/hooks/useFarcasterChannel';
import { useFarcasterFeed, type EmbeddedCast } from '@/hooks/useFarcasterFeed';
import { useFarcasterProfile, type ProfileCast } from '@/hooks/useFarcasterProfile';
import { parseFarcasterUrl, useFarcasterThread, type FlattenedCast } from '@/hooks/useFarcasterThread';
import { likeCast, postFarcasterCast, recastCast, unlikeCast, unrecastCast } from '@/services/farcasterClient';
import { useTheme } from '@/theme';
import type { Channel, Space } from '@quilibrium/quorum-shared';
import { logger } from '@quilibrium/quorum-shared';
import { Audio, ResizeMode, Video } from 'expo-av';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
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
  type KeyboardEvent,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import ReanimatedModule, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const ReanimatedView = ReanimatedModule.View;

const SCREEN_WIDTH = Dimensions.get('window').width;
const SCREEN_HEIGHT = Dimensions.get('window').height;

// Configure audio to play even when silent switch is on
let audioModeConfigured = false;
async function ensureAudioMode() {
  if (audioModeConfigured) return;
  try {
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
    });
    audioModeConfigured = true;
  } catch (e) {
    logger.warn('[SocialFeedModal] Failed to set audio mode:', e);
  }
}

// Image viewer with pinch-to-zoom and pan
function ImageViewer({
  visible,
  imageUrl,
  onClose,
}: {
  visible: boolean;
  imageUrl: string | null;
  onClose: () => void;
}) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  // Reset transforms when image changes
  useEffect(() => {
    if (visible) {
      scale.value = 1;
      savedScale.value = 1;
      translateX.value = 0;
      translateY.value = 0;
      savedTranslateX.value = 0;
      savedTranslateY.value = 0;
    }
  }, [visible, imageUrl]);

  const pinchGesture = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.max(1, Math.min(savedScale.value * e.scale, 5));
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      if (scale.value < 1) {
        scale.value = withSpring(1);
        savedScale.value = 1;
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      }
    });

  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      if (scale.value > 1) {
        translateX.value = savedTranslateX.value + e.translationX;
        translateY.value = savedTranslateY.value + e.translationY;
      }
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (scale.value > 1) {
        scale.value = withSpring(1);
        savedScale.value = 1;
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      } else {
        scale.value = withSpring(2.5);
        savedScale.value = 2.5;
      }
    });

  const composedGesture = Gesture.Simultaneous(
    pinchGesture,
    Gesture.Race(doubleTapGesture, panGesture)
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  if (!visible || !imageUrl) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={{
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.95)',
        justifyContent: 'center',
        alignItems: 'center',
      }}>
        <TouchableOpacity
          onPress={onClose}
          style={{
            position: 'absolute',
            top: 50,
            right: 20,
            zIndex: 10,
            backgroundColor: 'rgba(255,255,255,0.2)',
            borderRadius: 20,
            padding: 10,
          }}
        >
          <IconSymbol name="xmark" color="#fff" size={24} />
        </TouchableOpacity>

        <GestureDetector gesture={composedGesture}>
          <ReanimatedView style={[{ width: SCREEN_WIDTH, height: SCREEN_HEIGHT * 0.7 }, animatedStyle]}>
            <Image
              source={{ uri: imageUrl }}
              style={{ width: '100%', height: '100%' }}
              resizeMode="contain"
            />
          </ReanimatedView>
        </GestureDetector>
      </View>
    </Modal>
  );
}

// Cache for image dimensions to prevent recalculation during scroll
const imageDimensionCache = new Map<string, number>();

function AutoHeightImage({ uri, maxHeight, style, onPress }: { uri: string; maxHeight: number; style?: any; onPress?: () => void }) {
  const cachedHeight = imageDimensionCache.get(uri);
  const [height, setHeight] = useState<number>(cachedHeight ?? 250);

  useEffect(() => {
    // Skip if already cached
    if (imageDimensionCache.has(uri)) {
      setHeight(imageDimensionCache.get(uri)!);
      return;
    }

    Image.getSize(
      uri,
      (width, imgHeight) => {
        const aspectRatio = imgHeight / width;
        const calculatedHeight = Math.min(SCREEN_WIDTH * aspectRatio, maxHeight);
        imageDimensionCache.set(uri, calculatedHeight);
        setHeight(calculatedHeight);
      },
      () => {
        imageDimensionCache.set(uri, 250);
        setHeight(250); // fallback
      }
    );
  }, [uri, maxHeight]);

  const imageElement = (
    <Image
      source={{ uri }}
      style={[style, { width: SCREEN_WIDTH, height }]}
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

function ImageCarousel({ urls, maxHeight, theme, onImagePress }: { urls: string[]; maxHeight: number; theme: any; onImagePress?: (url: string) => void }) {
  const [activeIndex, setActiveIndex] = useState(0);

  const handleScroll = useCallback((event: any) => {
    const contentOffsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(contentOffsetX / SCREEN_WIDTH);
    setActiveIndex(index);
  }, []);

  return (
    <View>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
        {urls.map((url, index) => (
          <View
            key={index}
            style={{
              width: SCREEN_WIDTH,
              height: maxHeight,
              backgroundColor: theme.colors.surface3,
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <AutoHeightImage
              uri={url}
              maxHeight={maxHeight}
              onPress={onImagePress ? () => onImagePress(url) : undefined}
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
  style?: any;
  theme: any;
  onMentionPress?: (username: string) => void;
  onChannelPress?: (channelKey: string) => void;
  onLinkPress?: (url: string) => void;
}) {
  // Match URLs, @mentions (after whitespace/start), and /channels (after whitespace/start)
  // URLs are matched first to prevent their paths being parsed as channels
  const parts: { type: 'text' | 'mention' | 'channel' | 'link'; value: string }[] = [];
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
      // URL
      parts.push({ type: 'link', value: match[1] });
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
  theme: any;
  bottomInset: number;
  onClose: () => void;
  onRecast: () => void;
  onQuote: () => void;
  onShareToChat: () => void;
  onNativeShare: () => void;
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
}: ShareActionSheetProps) {
  logger.log('[ShareActionSheet] visible:', visible, 'castHash:', castHash);
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
              onPress={() => {
                if (!action.disabled) {
                  action.onPress();
                  onClose();
                }
              }}
              disabled={action.disabled}
            >
              <IconSymbol
                name={action.icon as any}
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
  theme: any;
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
  const { data: spacesData } = useSpaces({ enabled: visible });
  const { mutateAsync: sendDirectMessage } = useSendDirectMessage();
  const { mutateAsync: sendSpaceMessage } = useSendSpaceMessage();

  const [selectedSpace, setSelectedSpace] = useState<Space | null>(null);
  const [isSending, setIsSending] = useState(false);

  // Flatten conversations from pages
  const conversations = useMemo(() => {
    return conversationsData?.pages.flatMap(page => page.conversations) ?? [];
  }, [conversationsData]);

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
    } catch (e) {
      logger.log('[ShareToChatModal] Failed to send DM:', e);
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
    } catch (e) {
      logger.log('[ShareToChatModal] Failed to send to channel:', e);
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

              {/* DMs Section */}
              {conversations.length > 0 && (
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
                  {conversations.map((conv) => (
                    <TouchableOpacity
                      key={conv.conversationId}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        paddingHorizontal: 16,
                        paddingVertical: 12,
                        gap: 12,
                      }}
                      onPress={() => handleSelectDM(conv)}
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
                          {conv.displayName || conv.address.slice(0, 12) + '...'}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </>
              )}

              {spaces.length === 0 && conversations.length === 0 && (
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
  theme: any;
}) {
  const videoRef = useRef<Video>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const aspectRatio = width && height ? height / width : 9 / 16;
  const calculatedHeight = Math.min(SCREEN_WIDTH * aspectRatio, SCREEN_HEIGHT * 0.7);

  const handleTap = async () => {
    if (!hasStarted) {
      // First tap - start playing
      await ensureAudioMode();
      setHasStarted(true);
      setIsPlaying(true);
      await videoRef.current?.playAsync();
    } else if (isPlaying) {
      // Tap while playing - pause
      await videoRef.current?.pauseAsync();
      setIsPlaying(false);
    } else {
      // Tap while paused - resume
      await videoRef.current?.playAsync();
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
          <Video
            ref={videoRef}
            source={{ uri: url }}
            style={{
              width: SCREEN_WIDTH,
              height: calculatedHeight,
              backgroundColor: theme.colors.surface3,
            }}
            resizeMode={ResizeMode.CONTAIN}
            shouldPlay={true}
            isLooping={false}
            useNativeControls={false}
            onPlaybackStatusUpdate={(status) => {
              if (status.isLoaded && status.didJustFinish) {
                setIsPlaying(false);
                setHasStarted(false);
                videoRef.current?.setPositionAsync(0);
              }
            }}
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
  theme: any;
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

function QuoteCast({
  cast,
  theme,
  onPress,
}: {
  cast: EmbeddedCast;
  theme: any;
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
          <Image
            source={cast.author.pfp?.url ? { uri: cast.author.pfp.url } : require('../assets/images/quorum-symbol-bg-blue.png')}
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
  theme: any;
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
  bottomInset = 0,
}: {
  username: string;
  castHashPrefix: string;
  token?: string;
  theme: any;
  onClose: () => void;
  onOpenMiniApp: (url: string) => void;
  onOpenProfile: (fid: number, username?: string) => void;
  onOpenChannel: (channelKey: string) => void;
  onOpenThread: (username: string, castHashPrefix: string) => void;
  likeStates: Map<string, { liked: boolean; count: number }>;
  onLikeToggle: (castHash: string, currentlyLiked: boolean, currentCount: number) => void;
  onRecastToggle: (castHash: string, currentlyRecasted: boolean, currentCount: number) => void;
  recastStates: Map<string, { recasted: boolean; count: number }>;
  onQuoteCast: (castHash: string, castAuthor: string) => void;
  onShareToChat: (castUrl: string) => void;
  bottomInset?: number;
}) {
  const { mainCast, replies, isLoading, error, channelContext, refetch } = useFarcasterThread({
    username,
    castHashPrefix,
    token,
  });

  // Reply state
  const [replyText, setReplyText] = useState('');
  const [isPosting, setIsPosting] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  // Share action sheet state
  const [shareSheetCast, setShareSheetCast] = useState<{
    hash: string;
    author: string;
    isRecasted: boolean;
    recastCount: number;
  } | null>(null);

  // Track keyboard height for input positioning
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

  const canReply = Boolean(token && replyText.trim().length > 0 && !isPosting && mainCast);

  // Calculate input bar height for scroll padding
  const inputBarHeight = 64; // approximate height of input bar

  const handleSubmitReply = async () => {
    if (!canReply || !mainCast) return;

    try {
      setIsPosting(true);
      setReplyError(null);
      await postFarcasterCast({
        token: token!,
        text: replyText.trim(),
        parentHash: mainCast.hash,
      });
      setReplyText('');
      // Refetch to show the new reply
      await refetch();
    } catch (err: any) {
      logger.log('[ThreadDetailView] Reply error:', err);
      setReplyError(err?.message ?? 'Failed to post reply');
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
    } catch (e) {
      logger.log('[ThreadDetailView] Failed to look up user:', e);
    }
  };

  // Image viewer state
  const [viewerImage, setViewerImage] = useState<string | null>(null);

  const renderCast = (cast: FlattenedCast, isMain = false) => {
    const imageUrls = (cast.embeds?.images ?? [])
      .map((img) => img.url)
      .filter((url): url is string => Boolean(url));
    const hasImages = imageUrls.length > 0;
    const videos = (cast.embeds?.videos ?? []).filter((v) => v.url && v.thumbnailUrl);
    const hasVideos = videos.length > 0;

    // Extract frame embeds from URLs
    const frameEmbeds = (cast.embeds?.urls ?? [])
      .filter((u) => u.openGraph?.frameEmbedNext?.frameEmbed)
      .map((u) => ({
        imageUrl: u.openGraph!.frameEmbedNext!.frameEmbed!.imageUrl!,
        buttonTitle: u.openGraph!.frameEmbedNext!.frameEmbed!.button?.title ?? 'Open',
        actionUrl: u.openGraph!.frameEmbedNext!.frameEmbed!.button?.action?.url ?? u.openGraph!.url!,
      }))
      .filter((f) => f.imageUrl);

    // Regular URL previews (non-frame)
    const urlPreviews = (cast.embeds?.urls ?? [])
      .filter((u) => u.openGraph?.title && !u.openGraph?.frameEmbedNext?.frameEmbed);

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
          <TouchableOpacity onPress={() => onOpenProfile(cast.author.fid, cast.author.username)}>
            <Image
              source={cast.author.pfp?.url ? { uri: cast.author.pfp.url } : require('../assets/images/quorum-symbol-bg-blue.png')}
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
        {cast.text.length > 0 && (
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
                onPress={() => setViewerImage(imageUrls[0])}
              />
            ) : (
              <ImageCarousel
                urls={imageUrls}
                maxHeight={SCREEN_HEIGHT * 0.6}
                theme={theme}
                onImagePress={setViewerImage}
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

        {/* URL previews (non-frame) */}
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

        {/* Embedded casts (quote casts) */}
        {cast.embeds?.casts && cast.embeds.casts.length > 0 && (
          <View style={{ gap: 8 }}>
            {cast.embeds.casts.map((embeddedCast, index) => (
              <QuoteCast
                key={index}
                cast={embeddedCast as EmbeddedCast}
                theme={theme}
                onPress={() => onOpenThread(embeddedCast.author.username, embeddedCast.hash.slice(0, 10))}
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
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4, paddingHorizontal: 2 }}
                onPress={() => {
                  logger.log('[ThreadDetailView] Share button pressed for cast:', cast.hash);
                  setShareSheetCast({
                    hash: cast.hash,
                    author: cast.author.username,
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

  // Bottom position for the reply input
  // threadOverlay fills modalContent which sits above the userPanelHeight spacer
  // So bottom: 0 should be correct when keyboard hidden
  // When keyboard visible, we need to account for the keyboard height minus the userPanelHeight
  // since the keyboard overlaps the spacer
  const userPanelHeight = 8 + 32 + Math.max(8, bottomInset);
  const inputBottom = keyboardHeight > 0 ? keyboardHeight - userPanelHeight : 0;

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
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingBottom: token ? inputBarHeight + bottomInset : 16
          }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        >
          {renderCast({ ...mainCast, depth: 0 }, true)}

          {replies.length > 0 && (
            <View>
              {replies.map((reply) => renderCast(reply))}
            </View>
          )}
        </ScrollView>
      )}

      {/* Reply input - only shown if user has token */}
      {mainCast && token && (
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: inputBottom,
            flexDirection: 'row',
            alignItems: 'flex-end',
            padding: 12,
            backgroundColor: theme.colors.background,
            borderTopWidth: 1,
            borderTopColor: theme.colors.surface3,
            gap: 8,
          }}
        >
          <TextInput
            style={{
              flex: 1,
              minHeight: 40,
              maxHeight: 100,
              backgroundColor: theme.colors.surface2,
              borderRadius: 20,
              paddingHorizontal: 16,
              paddingVertical: 10,
              color: theme.colors.textMain,
              fontSize: 15,
            }}
            placeholder={`Reply to @${username}...`}
            placeholderTextColor={theme.colors.textMuted}
            value={replyText}
            onChangeText={(text) => setReplyText(text.slice(0, MAX_CAST_LENGTH))}
            multiline
            textAlignVertical="center"
          />
          <TouchableOpacity
            onPress={handleSubmitReply}
            disabled={!canReply}
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: canReply ? theme.colors.accent : theme.colors.surface3,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {isPosting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <IconSymbol name="arrow.up" size={20} color={canReply ? '#fff' : theme.colors.textMuted} />
            )}
          </TouchableOpacity>
        </View>
      )}
      {replyError && (
        <View style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: inputBottom + inputBarHeight,
          paddingHorizontal: 12,
          paddingBottom: 4,
          backgroundColor: theme.colors.background
        }}>
          <Text style={{ color: theme.colors.danger, fontSize: 13 }}>{replyError}</Text>
        </View>
      )}

      {/* Thread Image Viewer */}
      <ImageViewer
        visible={viewerImage !== null}
        imageUrl={viewerImage}
        onClose={() => setViewerImage(null)}
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
            onRecastToggle(shareSheetCast.hash, shareSheetCast.isRecasted, shareSheetCast.recastCount);
          }
        }}
        onQuote={() => {
          if (shareSheetCast) {
            onQuoteCast(shareSheetCast.hash, shareSheetCast.author);
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
            } catch (e) {
              logger.log('[ThreadDetailView] Share error:', e);
            }
          }
        }}
      />
    </View>
  );
}

function ProfileView({
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
}: {
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
  const [viewerImage, setViewerImage] = useState<string | null>(null);

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
              onPress={() => author.pfp?.url && setViewerImage(author.pfp.url)}
            >
              <Image
                source={author.pfp?.url ? { uri: author.pfp.url } : require('../assets/images/quorum-symbol-bg-blue.png')}
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
    } catch (e) {
      logger.log('[ProfileView] Failed to look up user:', e);
    }
  };

  const renderCast = (cast: ProfileCast) => {
    const imageUrls = (cast.embeds?.images ?? [])
      .map((img) => img.url)
      .filter((url): url is string => Boolean(url));
    const hasImages = imageUrls.length > 0;
    const videos = (cast.embeds?.videos ?? []).filter((v) => v.url && v.thumbnailUrl);
    const hasVideos = videos.length > 0;

    // Extract frame embeds from URLs
    const frameEmbeds = (cast.embeds?.urls ?? [])
      .filter((u) => u.openGraph?.frameEmbedNext?.frameEmbed)
      .map((u) => ({
        imageUrl: u.openGraph!.frameEmbedNext!.frameEmbed!.imageUrl!,
        buttonTitle: u.openGraph!.frameEmbedNext!.frameEmbed!.button?.title ?? 'Open',
        actionUrl: u.openGraph!.frameEmbedNext!.frameEmbed!.button?.action?.url ?? u.openGraph!.url!,
      }))
      .filter((f) => f.imageUrl);

    // Regular URL previews (non-frame)
    const urlPreviews = (cast.embeds?.urls ?? [])
      .filter((u) => u.openGraph?.title && !u.openGraph?.frameEmbedNext?.frameEmbed);

    // Quote casts
    const quoteCasts = cast.embeds?.casts ?? [];

    const navigateToThread = () => {
      if (cast.author.username && cast.hash) {
        onOpenThread(cast.author.username, cast.hash.slice(0, 10));
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
              <Image
                source={cast.author.pfp?.url ? { uri: cast.author.pfp.url } : require('../assets/images/quorum-symbol-bg-blue.png')}
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

        <Pressable onPress={navigateToThread}>
          {cast.text.length > 0 && (
            <CastText
              text={cast.text}
              style={{ color: theme.colors.textMain, fontSize: 15, lineHeight: 20 }}
              theme={theme}
              onMentionPress={handleMentionPress}
              onChannelPress={onOpenChannel}
              onLinkPress={onOpenMiniApp}
            />
          )}
        </Pressable>

        {/* Images */}
        {hasImages && (
          <View style={{ marginHorizontal: -12 }}>
            {imageUrls.length === 1 ? (
              <AutoHeightImage
                uri={imageUrls[0]}
                maxHeight={SCREEN_HEIGHT * 0.6}
                style={{ backgroundColor: theme.colors.surface3 }}
                onPress={() => setViewerImage(imageUrls[0])}
              />
            ) : (
              <ImageCarousel
                urls={imageUrls}
                maxHeight={SCREEN_HEIGHT * 0.6}
                theme={theme}
                onImagePress={setViewerImage}
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
          );
        })()}
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
        removeClippedSubviews={false}
        maxToRenderPerBatch={10}
        windowSize={11}
        initialNumToRender={8}
        ListFooterComponent={
          isFetchingNextPage ? (
            <View style={{ paddingVertical: 20, alignItems: 'center' }}>
              <ActivityIndicator color={theme.colors.accent} />
            </View>
          ) : null
        }
      />

      {/* Back button - positioned absolutely at top for consistency */}
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

      {/* Image Viewer */}
      <ImageViewer
        visible={viewerImage !== null}
        imageUrl={viewerImage}
        onClose={() => setViewerImage(null)}
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
}: {
  channelKey: string;
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
      <View style={{ backgroundColor: theme.colors.background }}>
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
                  borderColor: theme.colors.background,
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
    } catch (e) {
      logger.log('[ChannelView] Failed to look up user:', e);
    }
  };

  // Image viewer state
  const [viewerImage, setViewerImage] = useState<string | null>(null);

  const renderCast = (cast: ChannelCast) => {
    const imageUrls = (cast.embeds?.images ?? [])
      .map((img) => img.url)
      .filter((url): url is string => Boolean(url));
    const hasImages = imageUrls.length > 0;
    const videos = (cast.embeds?.videos ?? []).filter((v) => v.url && v.thumbnailUrl);
    const hasVideos = videos.length > 0;

    // Extract frame embeds from URLs
    const frameEmbeds = (cast.embeds?.urls ?? [])
      .filter((u) => u.openGraph?.frameEmbedNext?.frameEmbed)
      .map((u) => ({
        imageUrl: u.openGraph!.frameEmbedNext!.frameEmbed!.imageUrl!,
        buttonTitle: u.openGraph!.frameEmbedNext!.frameEmbed!.button?.title ?? 'Open',
        actionUrl: u.openGraph!.frameEmbedNext!.frameEmbed!.button?.action?.url ?? u.openGraph!.url!,
      }))
      .filter((f) => f.imageUrl);

    // Regular URL previews (non-frame)
    const urlPreviews = (cast.embeds?.urls ?? [])
      .filter((u) => u.openGraph?.title && !u.openGraph?.frameEmbedNext?.frameEmbed);

    // Quote casts
    const quoteCasts = cast.embeds?.casts ?? [];

    const navigateToThread = () => {
      if (cast.author.username && cast.hash) {
        onOpenThread(cast.author.username, cast.hash.slice(0, 10));
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
              <Image
                source={cast.author.pfp?.url ? { uri: cast.author.pfp.url } : require('../assets/images/quorum-symbol-bg-blue.png')}
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

        <Pressable onPress={navigateToThread}>
          {cast.text.length > 0 && (
            <CastText
              text={cast.text}
              style={{ color: theme.colors.textMain, fontSize: 15, lineHeight: 20 }}
              theme={theme}
              onMentionPress={handleMentionPress}
              onChannelPress={onOpenChannel}
              onLinkPress={onOpenMiniApp}
            />
          )}
        </Pressable>

        {/* Images */}
        {hasImages && (
          <View style={{ marginHorizontal: -12 }}>
            {imageUrls.length === 1 ? (
              <AutoHeightImage
                uri={imageUrls[0]}
                maxHeight={SCREEN_HEIGHT * 0.6}
                style={{ backgroundColor: theme.colors.surface3 }}
                onPress={() => setViewerImage(imageUrls[0])}
              />
            ) : (
              <ImageCarousel
                urls={imageUrls}
                maxHeight={SCREEN_HEIGHT * 0.6}
                theme={theme}
                onImagePress={setViewerImage}
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
          );
        })()}
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
        ListHeaderComponent={renderChannelHeader}
        renderItem={({ item }) => renderCast(item)}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 32 + bottomInset }}
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage) {
            fetchNextPage();
          }
        }}
        onEndReachedThreshold={0.5}
        removeClippedSubviews={false}
        maxToRenderPerBatch={10}
        windowSize={11}
        initialNumToRender={8}
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
        visible={viewerImage !== null}
        imageUrl={viewerImage}
        onClose={() => setViewerImage(null)}
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
}

type FeedFilter = 'all' | 'media' | 'node-ops' | 'events';

interface VideoEmbed {
  url?: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
  duration?: number;
}

interface UrlEmbed {
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

interface QuoteCastEmbed {
  cast: EmbeddedCast;
  username: string;
  hashPrefix: string;
}

interface FrameEmbedInfo {
  imageUrl: string;
  buttonTitle: string;
  actionUrl: string;
}

interface FeedPost {
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

const AVATAR_FALLBACK = require('../assets/images/quorum-symbol-bg-blue.png');
const MAX_CAST_LENGTH = 320;

// Memoized feed post card for better FlatList performance
interface FeedPostCardProps {
  post: FeedPost;
  theme: any;
  styles: any;
  likeState?: { liked: boolean; count: number };
  recastState?: { recasted: boolean; count: number };
  onNavigateToThread: (username: string, hash: string) => void;
  onNavigateToProfile: (fid: number, username?: string) => void;
  onOpenChannel: (channelKey: string) => void;
  onMentionPress: (username: string) => void;
  onLinkPress: (url: string) => void;
  onImagePress: (url: string) => void;
  onLikeToggle: (hash: string, isLiked: boolean, count: number) => void;
  onOpenShareSheet: (hash: string, author: string, isRecasted: boolean, recastCount: number) => void;
}

const FeedPostCard = React.memo(function FeedPostCard({
  post,
  theme,
  styles,
  likeState,
  recastState,
  onNavigateToThread,
  onNavigateToProfile,
  onOpenChannel,
  onMentionPress,
  onLinkPress,
  onImagePress,
  onLikeToggle,
  onOpenShareSheet,
}: FeedPostCardProps) {
  const navigateToThread = useCallback(() => {
    if (post.username && post.hash) {
      onNavigateToThread(post.username, post.hash.slice(0, 10));
    }
  }, [post.username, post.hash, onNavigateToThread]);

  const navigateToProfile = useCallback(() => {
    if (post.authorFid > 0) {
      onNavigateToProfile(post.authorFid, post.username);
    }
  }, [post.authorFid, post.username, onNavigateToProfile]);

  const isLiked = likeState?.liked ?? post.viewerHasLiked ?? false;
  const likeCount = likeState?.count ?? (parseInt(post.stats.likes, 10) || 0);
  const isRecasted = recastState?.recasted ?? post.viewerHasRecast ?? false;
  const recastCount = recastState?.count ?? (parseInt(post.stats.shares, 10) || 0);

  return (
    <View style={styles.postCard}>
      <View style={styles.postHeader}>
        <TouchableOpacity onPress={navigateToProfile}>
          <Image
            source={post.authorAvatar ? { uri: post.authorAvatar } : AVATAR_FALLBACK}
            style={styles.avatar}
          />
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
      </View>

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

      {post.mediaUrls.length > 0 && (
        <View style={styles.mediaContainer}>
          {post.mediaUrls.length === 1 ? (
            <AutoHeightImage
              uri={post.mediaUrls[0]}
              maxHeight={SCREEN_HEIGHT * 0.6}
              style={styles.postMedia}
              onPress={() => onImagePress(post.mediaUrls[0])}
            />
          ) : (
            <ImageCarousel
              urls={post.mediaUrls}
              maxHeight={SCREEN_HEIGHT * 0.6}
              theme={theme}
              onImagePress={onImagePress}
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
              onPress={() => onNavigateToThread(qc.username, qc.hashPrefix)}
            />
          ))}
        </View>
      )}

      {post.urlPreviews.length > 0 && (
        <View style={{ gap: 8 }}>
          {post.urlPreviews.map((preview, index) => (
            preview.isFarcasterLink && preview.farcasterUsername && preview.farcasterCastHash ? (
              <TouchableOpacity
                key={index}
                style={{
                  backgroundColor: theme.colors.surface2,
                  borderRadius: 12,
                  padding: 12,
                  marginHorizontal: 12,
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
              <LinkPreview
                key={index}
                url={preview.url}
                title={preview.title}
                description={preview.description}
                domain={preview.domain}
                image={preview.image}
                useLargeImage={preview.useLargeImage}
                theme={theme}
                onPress={preview.url ? () => onLinkPress(preview.url!) : undefined}
              />
            )
          ))}
        </View>
      )}

      {post.tags.length > 0 && (
        <View style={styles.tagsRow}>
          {post.tags.map((tag) => (
            <View key={tag} style={styles.tagPill}>
              <Text style={styles.tagText}>{tag}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={styles.postStats}>
        <TouchableOpacity
          style={styles.statButton}
          onPress={() => onLikeToggle(post.hash, isLiked, likeCount)}
        >
          <IconSymbol
            name={isLiked ? "heart.fill" : "heart"}
            color={isLiked ? theme.colors.danger : theme.colors.textMuted}
            size={16}
          />
          {likeCount > 0 && (
            <Text style={styles.statText}>{likeCount}</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.statButton}
          onPress={navigateToThread}
        >
          <IconSymbol name="bubble.left" color={theme.colors.textMuted} size={16} />
          {post.stats.replies !== '0' && (
            <Text style={styles.statText}>{post.stats.replies}</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.statButton}
          onPress={() => onOpenShareSheet(post.hash, post.username ?? '', isRecasted, recastCount)}
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

interface ThreadInfo {
  username: string;
  castHashPrefix: string;
}

interface MiniAppInfo {
  url: string;
}

interface ProfileInfo {
  fid: number;
  username?: string;
}

interface ChannelNavInfo {
  channelKey: string;
}

export default function SocialFeedModal({ visible, token, onClose: _onClose, initialThread }: SocialFeedModalProps) {
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [activeFilter, setActiveFilter] = useState<FeedFilter>('all');
  const [rendered, setRendered] = useState(visible);
  const [castText, setCastText] = useState('');
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const [selectedThread, setSelectedThread] = useState<ThreadInfo | null>(initialThread ?? null);
  const [selectedMiniApp, setSelectedMiniApp] = useState<MiniAppInfo | null>(null);
  const [selectedProfile, setSelectedProfile] = useState<ProfileInfo | null>(null);
  const [selectedChannel, setSelectedChannel] = useState<ChannelNavInfo | null>(null);
  const [composeVisible, setComposeVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  // Update selectedThread when initialThread changes (e.g., opening from chat)
  useEffect(() => {
    if (visible && initialThread) {
      setSelectedThread(initialThread);
    }
  }, [visible, initialThread]);

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
    logger.log('[SocialFeedModal] handleMentionPress called with username:', username);
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
          setSelectedProfile({ fid, username });
        }
      }
    } catch (e) {
      logger.log('[SocialFeedModal] Failed to look up user:', e);
    }
  }, []);

  const openChannel = useCallback((channelKey: string) => {
    logger.log('[SocialFeedModal] openChannel called with channelKey:', channelKey);
    setSelectedChannel({ channelKey });
  }, []);

  // Track optimistic like states: hash -> { liked: boolean, count: number }
  const [likeStates, setLikeStates] = useState<Map<string, { liked: boolean; count: number }>>(new Map());

  // Image viewer state for feed images
  const [feedViewerImage, setFeedViewerImage] = useState<string | null>(null);

  // Share action sheet state for main feed
  const [feedShareSheet, setFeedShareSheet] = useState<{
    hash: string;
    author: string;
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
      logger.log('[SocialFeedModal] Like toggle failed:', e);
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
      logger.log('[SocialFeedModal] Recast toggle failed:', e);
      // Revert on failure
      setRecastStates((prev) => {
        const next = new Map(prev);
        next.set(castHash, { recasted: currentlyRecasted, count: currentCount });
        return next;
      });
    }
  }, [token]);

  // Quote cast handler - opens compose modal with quote embed
  const [quoteCastEmbed, setQuoteCastEmbed] = useState<{ hash: string; author: string } | null>(null);

  const handleQuoteCast = useCallback((castHash: string, castAuthor: string) => {
    setQuoteCastEmbed({ hash: castHash, author: castAuthor });
    setComposeVisible(true);
  }, []);

  // Share to chat state
  const [shareToChatUrl, setShareToChatUrl] = useState<string | null>(null);

  // Share to chat handler - opens the share to chat modal
  const handleShareToChat = useCallback((castUrl: string) => {
    setFeedShareSheet(null); // Close the share action sheet
    setShareToChatUrl(castUrl);
  }, []);

  // Memoized callbacks for FeedPostCard
  const handleNavigateToThread = useCallback((username: string, hashPrefix: string) => {
    setSelectedThread({ username, castHashPrefix: hashPrefix });
  }, []);

  const handleNavigateToProfile = useCallback((fid: number, username?: string) => {
    setSelectedProfile({ fid, username });
  }, []);

  const handleOpenShareSheet = useCallback((hash: string, author: string, isRecasted: boolean, recastCount: number) => {
    setFeedShareSheet({ hash, author, isRecasted, recastCount });
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

  useEffect(() => {
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
  }, [backdropAnim, slideAnim, visible]);

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

      // Extract frame embeds (mini apps)
      const allUrls = cast.embeds?.urls ?? [];
      const frameEmbeds: FrameEmbedInfo[] = allUrls
        .filter((u) => u.openGraph?.frameEmbedNext?.frameEmbed?.imageUrl)
        .map((u) => ({
          imageUrl: u.openGraph!.frameEmbedNext!.frameEmbed!.imageUrl!,
          buttonTitle: u.openGraph!.frameEmbedNext!.frameEmbed!.button?.title ?? 'Open',
          actionUrl: u.openGraph!.frameEmbedNext!.frameEmbed!.button?.action?.url ?? u.openGraph!.url!,
        }));

      // Filter URLs - separate farcaster.xyz links from regular URLs, exclude frame embeds
      const urlPreviews: UrlEmbed[] = allUrls
        .filter((u) => {
          // Skip frame embeds
          if (u.openGraph?.frameEmbedNext?.frameEmbed) {
            return false;
          }
          // Skip farcaster.xyz links if we already have the cast embedded
          const url = u.openGraph?.url || u.openGraph?.sourceUrl || '';
          if (url.includes('farcaster.xyz/')) {
            const parsed = parseFarcasterUrl(url);
            if (parsed) {
              // Check if this cast is already in quoteCasts
              const alreadyEmbedded = quoteCasts.some(
                (qc) => qc.hashPrefix.toLowerCase().startsWith(parsed.castHashPrefix.toLowerCase())
              );
              return !alreadyEmbedded;
            }
          }
          return u.openGraph?.title;
        })
        .map((u) => {
          const url = u.openGraph?.url || u.openGraph?.sourceUrl || '';
          const parsed = url.includes('farcaster.xyz/') ? parseFarcasterUrl(url) : null;
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
      };
    });
  }, [farcasterItems]);

  const filteredPosts = useMemo(() => {
    if (activeFilter === 'all') {
      return posts;
    }
    return posts.filter((post) => post.filter === activeFilter);
  }, [activeFilter, posts]);

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
    // { id: 'node-ops', label: 'Node Ops', icon: 'bolt.fill' },
    // { id: 'events', label: 'Events', icon: 'calendar' },
  ];

  if (!rendered) {
    return null;
  }

  const showEmpty = !isLoading && !error && filteredPosts.length === 0;
  const canPost = Boolean(token && castText.trim().length > 0 && !posting);

  const handleChangeText = (value: string) => {
    setCastText(value.slice(0, MAX_CAST_LENGTH));
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
      await postFarcasterCast({
        token: token as string,
        text: castText.trim(),
      });
      setCastText('');
      await refetch();
    } catch (err: any) {
      setPostError(err?.message ?? 'Failed to publish cast.');
    } finally {
      setPosting(false);
    }
  };

  const handleRefresh = () => {
    logger.log('[SocialFeedModal] handleRefresh called');
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
          <FlatList
            data={filteredPosts}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.contentContainer}
            onEndReached={() => {
              logger.log('[SocialFeedModal] onEndReached', { hasNextPage, isFetchingNextPage });
              if (hasNextPage && !isFetchingNextPage) {
                logger.log('[SocialFeedModal] Calling fetchNextPage');
                fetchNextPage();
              }
            }}
            onEndReachedThreshold={0.5}
            removeClippedSubviews={false}
            maxToRenderPerBatch={15}
            windowSize={21}
            initialNumToRender={10}
            updateCellsBatchingPeriod={50}
            refreshControl={
              <RefreshControl
                refreshing={isRefetching}
                onRefresh={handleRefresh}
                tintColor={theme.colors.textMain}
              />
            }
            ListHeaderComponent={
              <>
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
                </ScrollView>

                {isLoading && posts.length === 0 && (
                  <View style={styles.stateCard}>
                    <ActivityIndicator color={theme.colors.accent} />
                    <Text style={styles.stateText}>Loading Farcaster feed…</Text>
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
            renderItem={({ item: post }) => (
              <FeedPostCard
                post={post}
                theme={theme}
                styles={styles}
                likeState={likeStates.get(post.hash)}
                recastState={recastStates.get(post.hash)}
                onNavigateToThread={handleNavigateToThread}
                onNavigateToProfile={handleNavigateToProfile}
                onOpenChannel={openChannel}
                onMentionPress={handleMentionPress}
                onLinkPress={openMiniApp}
                onImagePress={setFeedViewerImage}
                onLikeToggle={handleLikeToggle}
                onOpenShareSheet={handleOpenShareSheet}
              />
            )}
          />

          {/* Floating Action Button */}
          {token && (
            <TouchableOpacity
              style={styles.fab}
              onPress={() => setComposeVisible(true)}
              activeOpacity={0.8}
            >
              <IconSymbol name="plus" color={theme.colors.surface0} size={20} />
            </TouchableOpacity>
          )}

          {/* Compose Modal */}
          {composeVisible && (
            <KeyboardAvoidingView
              style={styles.composeOverlay}
              behavior="padding"
              keyboardVerticalOffset={insets.top}
            >
              <Pressable style={styles.composeBackdrop} onPress={() => setComposeVisible(false)} />
              <View style={[styles.composeModal, keyboardHeight > 0 && { paddingBottom: insets.bottom }]}>
                <View style={styles.composeHeader}>
                  <TouchableOpacity onPress={() => setComposeVisible(false)}>
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
                <TextInput
                  multiline
                  autoFocus
                  placeholder="What's happening?"
                  placeholderTextColor={theme.colors.textMuted}
                  style={styles.composeInput}
                  value={castText}
                  editable={!posting}
                  onChangeText={handleChangeText}
                />
                <View style={styles.composeFooter}>
                  <Text style={styles.composeCharCount}>
                    {castText.length}/{MAX_CAST_LENGTH}
                  </Text>
                </View>
                {postError && (
                  <Text style={styles.composeError}>{postError}</Text>
                )}
              </View>
            </KeyboardAvoidingView>
          )}

          {/* Thread Detail View */}
          {selectedThread && (
            <View style={styles.threadOverlay}>
              <ThreadDetailView
                username={selectedThread.username}
                castHashPrefix={selectedThread.castHashPrefix}
                token={token}
                theme={theme}
                onClose={() => setSelectedThread(null)}
                onOpenMiniApp={openMiniApp}
                onOpenProfile={(fid, username) => setSelectedProfile({ fid, username })}
                onOpenChannel={(channelKey) => setSelectedChannel({ channelKey })}
                onOpenThread={(username, hashPrefix) => setSelectedThread({ username, castHashPrefix: hashPrefix })}
                likeStates={likeStates}
                onLikeToggle={handleLikeToggle}
                recastStates={recastStates}
                onRecastToggle={handleRecastToggle}
                onQuoteCast={handleQuoteCast}
                onShareToChat={handleShareToChat}
                bottomInset={insets.bottom}
              />
            </View>
          )}

          {/* Profile View */}
          {selectedProfile && (
            <View style={styles.threadOverlay}>
              <ProfileView
                fid={selectedProfile.fid}
                token={token}
                theme={theme}
                onClose={() => setSelectedProfile(null)}
                onOpenThread={(username, hashPrefix) => setSelectedThread({ username, castHashPrefix: hashPrefix })}
                onOpenMiniApp={openMiniApp}
                onOpenProfile={(fid, username) => setSelectedProfile({ fid, username })}
                onOpenChannel={(channelKey) => setSelectedChannel({ channelKey })}
                likeStates={likeStates}
                onLikeToggle={handleLikeToggle}
                bottomInset={insets.bottom}
              />
            </View>
          )}

          {/* Channel View */}
          {selectedChannel && (
            <View style={styles.threadOverlay}>
              <ChannelView
                channelKey={selectedChannel.channelKey}
                token={token}
                theme={theme}
                onClose={() => setSelectedChannel(null)}
                onOpenThread={(username, hashPrefix) => setSelectedThread({ username, castHashPrefix: hashPrefix })}
                onOpenMiniApp={openMiniApp}
                onOpenProfile={(fid, username) => setSelectedProfile({ fid, username })}
                onOpenChannel={(channelKey) => setSelectedChannel({ channelKey })}
                likeStates={likeStates}
                onLikeToggle={handleLikeToggle}
                bottomInset={insets.bottom}
              />
            </View>
          )}

          {/* Feed Image Viewer */}
          <ImageViewer
            visible={feedViewerImage !== null}
            imageUrl={feedViewerImage}
            onClose={() => setFeedViewerImage(null)}
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
                handleRecastToggle(feedShareSheet.hash, feedShareSheet.isRecasted, feedShareSheet.recastCount);
              }
            }}
            onQuote={() => {
              if (feedShareSheet) {
                handleQuoteCast(feedShareSheet.hash, feedShareSheet.author);
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
                } catch (e) {
                  logger.log('[SocialFeedModal] Share error:', e);
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
}

const createStyles = (theme: any, isDark: boolean, insets: any) =>
  StyleSheet.create({
    overlay: {
      ...StyleSheet.absoluteFillObject,
    },
    container: {
      flex: 1,
      paddingTop: insets.top,
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
    },
    modalContent: {
      flex: 1,
      backgroundColor: theme.colors.background,
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
    },
    filterChip: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.colors.surface3,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 999,
      marginRight: 10,
      gap: 6,
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
    avatar: {
      width: 44,
      height: 44,
      borderRadius: 22,
      marginRight: 12,
      backgroundColor: theme.colors.surface4,
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
      textAlignVertical: 'top',
    },
    composeFooter: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
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
    threadOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: theme.colors.background,
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
