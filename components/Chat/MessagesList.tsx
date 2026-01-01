import React, { useCallback, useState, useRef, useMemo, forwardRef, useImperativeHandle } from 'react';
import {
  Dimensions,
  Image,
  Text,
  View,
  StyleSheet,
  ImageSourcePropType,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  Pressable,
} from 'react-native';
import { FlatList } from 'react-native-gesture-handler';
import BrowserLink from '@/components/BrowserLink';
import { IconSymbol } from '@/components/ui/IconSymbol';
import { DefaultAvatar } from '@/components/ui/DefaultAvatar';
import { AutoHeightImage } from '@/components/SocialFeed/media/AutoHeightImage';
import { ImageViewer } from '@/components/SocialFeed/media/ImageViewer';
import { InviteLinkCard, containsInviteLink, extractInviteLink, stripInviteLink } from './InviteLinkCard';
import { FarcasterCastCard, containsFarcasterLink, extractFarcasterLink, stripFarcasterLink } from './FarcasterCastCard';
import { EmojiPicker } from './EmojiPicker';
import { MessageActionSheet } from './MessageActionSheet';
import type { DisplayMessage, DisplayReaction } from './types';
import type { Emoji, Sticker } from '@quilibrium/quorum-shared';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
// Message content width: padding (16) + avatar (40) + marginRight (12) + padding (16) = 84
const MESSAGE_IMAGE_MAX_WIDTH = SCREEN_WIDTH - 84;

// User info for profile display
export interface MessageUserInfo {
  userId: string;
  userName: string;
  userAvatar?: string;
}

interface MessagesListProps {
  messages: DisplayMessage[];
  theme: any;
  isLoading?: boolean;
  isRefreshing?: boolean;
  isLoadingMore?: boolean;
  error?: Error | null;
  onRefresh?: () => void;
  onLoadMore?: () => void;
  hasMore?: boolean;
  onRetryMessage?: (messageId: string) => void;
  onJoinSpace?: (spaceId: string, channelId: string) => void;
  onReaction?: (messageId: string, emoji: string) => void;
  onRemoveReaction?: (messageId: string, emoji: string) => void;
  customEmojis?: Emoji[]; // Space-specific custom emojis
  stickers?: Sticker[]; // Space-specific stickers
  onOpenFarcasterCast?: (username: string, castHashPrefix: string) => void;
  onUserPress?: (user: MessageUserInfo) => void;
  onReply?: (message: DisplayMessage) => void;
  onScrollToMessage?: (messageId: string) => void;
}

export interface MessagesListHandle {
  scrollToEnd: (animated?: boolean) => void;
  scrollToMessage: (messageId: string, animated?: boolean) => void;
}

// Get avatar source from message, returns undefined if no avatar
// Accepts data URIs and HTTP(S) URLs for remote avatars (e.g., Farcaster profile pictures)
function getAvatarSource(msg: DisplayMessage): ImageSourcePropType | undefined {
  if (!msg.userAvatar) return undefined;
  if (typeof msg.userAvatar === 'string') {
    // Accept data URIs (base64 encoded images)
    if (msg.userAvatar.startsWith('data:')) {
      return { uri: msg.userAvatar };
    }
    // Accept HTTP/HTTPS URLs (for Farcaster profile pictures)
    if (msg.userAvatar.startsWith('http://') || msg.userAvatar.startsWith('https://')) {
      return { uri: msg.userAvatar };
    }
    // Reject local paths (file://) and other formats
    return undefined;
  }
  return msg.userAvatar;
}

export const MessagesList = forwardRef<MessagesListHandle, MessagesListProps>(function MessagesList({
  messages,
  theme,
  isLoading = false,
  isRefreshing = false,
  isLoadingMore = false,
  error = null,
  onRefresh,
  onLoadMore,
  hasMore = false,
  onRetryMessage,
  onJoinSpace,
  onReaction,
  onRemoveReaction,
  customEmojis = [],
  stickers = [],
  onOpenFarcasterCast,
  onUserPress,
  onReply,
}, ref) {
  const styles = createStyles(theme);
  const [viewerImage, setViewerImage] = useState<string | null>(null);
  const [reactionPickerMessageId, setReactionPickerMessageId] = useState<string | null>(null);
  const [actionSheetMessageId, setActionSheetMessageId] = useState<string | null>(null);
  const flatListRef = useRef<FlatList<DisplayMessage>>(null);

  // Reverse messages for inverted FlatList - newest messages first in array
  // so they appear at the bottom (visual top in inverted list)
  const invertedMessages = useMemo(() => [...messages].reverse(), [messages]);

  // Expose scroll methods to parent
  // For inverted list, scrollToEnd means scroll to index 0 (newest message at bottom)
  useImperativeHandle(ref, () => ({
    scrollToEnd: (animated = true) => {
      flatListRef.current?.scrollToOffset({ offset: 0, animated });
    },
    scrollToMessage: (messageId: string, animated = true) => {
      // Find the index in the inverted array
      const index = invertedMessages.findIndex((m) => m.id === messageId);
      if (index !== -1) {
        flatListRef.current?.scrollToIndex({ index, animated, viewPosition: 0.5 });
      }
    },
  }), [invertedMessages]);

  // Create a lookup map for custom emojis by ID
  const customEmojiMap = React.useMemo(() => {
    const map: Record<string, Emoji> = {};
    customEmojis.forEach((e) => {
      map[e.id] = e;
    });
    return map;
  }, [customEmojis]);

  // Create a lookup map for stickers by ID
  const stickerMap = React.useMemo(() => {
    const map: Record<string, Sticker> = {};
    stickers.forEach((s) => {
      map[s.id] = s;
    });
    return map;
  }, [stickers]);

  // Helper to render tappable avatar
  const renderAvatar = useCallback(
    (item: DisplayMessage) => {
      const avatarSource = getAvatarSource(item);
      const handlePress = onUserPress
        ? () => {
            onUserPress({
              userId: item.userId,
              userName: item.userName,
              userAvatar: typeof item.userAvatar === 'string' ? item.userAvatar : undefined,
            });
          }
        : undefined;

      const avatarContent = avatarSource ? (
        <Image source={avatarSource} style={styles.messageAvatar} />
      ) : (
        <DefaultAvatar address={item.userId} size={40} style={styles.messageAvatar} />
      );

      if (handlePress) {
        return (
          <TouchableOpacity onPress={handlePress} activeOpacity={0.7}>
            {avatarContent}
          </TouchableOpacity>
        );
      }

      return avatarContent;
    },
    [styles.messageAvatar, onUserPress]
  );

  // For inverted list, onEndReached fires when scrolling toward the visual top
  // (older messages), which is exactly when we want to load more
  const handleEndReached = useCallback(() => {
    if (hasMore && !isLoadingMore && onLoadMore) {
      onLoadMore();
    }
  }, [hasMore, isLoadingMore, onLoadMore]);

  const handleSelectReaction = useCallback(
    (emoji: string) => {
      if (reactionPickerMessageId && onReaction) {
        onReaction(reactionPickerMessageId, emoji);
      }
      setReactionPickerMessageId(null);
    },
    [reactionPickerMessageId, onReaction]
  );

  // Get the message being acted on for reply
  const actionSheetMessage = useMemo(() => {
    if (!actionSheetMessageId) return null;
    return messages.find((m) => m.id === actionSheetMessageId) ?? null;
  }, [actionSheetMessageId, messages]);

  const handleReplyFromActionSheet = useCallback(() => {
    if (actionSheetMessage && onReply) {
      onReply(actionSheetMessage);
    }
    setActionSheetMessageId(null);
  }, [actionSheetMessage, onReply]);

  const handleReactFromActionSheet = useCallback(() => {
    // Move the message ID to the reaction picker
    setReactionPickerMessageId(actionSheetMessageId);
    setActionSheetMessageId(null);
  }, [actionSheetMessageId]);

  // Render reactions row
  const renderReactions = useCallback(
    (reactions: DisplayReaction[], messageId: string) => {
      if (!reactions || reactions.length === 0) return null;
      return (
        <View style={styles.reactionsRow}>
          {reactions.map((reaction) => {
            // Check if this is a custom emoji (ID matches a custom emoji)
            const customEmoji = customEmojiMap[reaction.emoji];

            return (
              <TouchableOpacity
                key={reaction.emoji}
                style={[
                  styles.reactionBadge,
                  reaction.hasReacted && styles.reactionBadgeActive,
                ]}
                onPress={() => {
                  if (reaction.hasReacted) {
                    onRemoveReaction?.(messageId, reaction.emoji);
                  } else {
                    onReaction?.(messageId, reaction.emoji);
                  }
                }}
              >
                {customEmoji ? (
                  <Image
                    source={{ uri: customEmoji.imgUrl }}
                    style={styles.reactionCustomEmoji}
                    resizeMode="contain"
                  />
                ) : (
                  <Text style={styles.reactionEmoji}>{reaction.emoji}</Text>
                )}
                <Text
                  style={[
                    styles.reactionCount,
                    reaction.hasReacted && styles.reactionCountActive,
                  ]}
                >
                  {reaction.count}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      );
    },
    [styles, onReaction, onRemoveReaction, customEmojiMap]
  );

  // Render system message (join/leave/kick)
  const renderSystemMessage = useCallback(
    (item: DisplayMessage) => {
      const iconName =
        item.systemEventType === 'join'
          ? 'arrow.right.circle.fill'
          : item.systemEventType === 'leave'
          ? 'arrow.left.circle.fill'
          : 'xmark.circle.fill';
      const iconColor =
        item.systemEventType === 'join'
          ? theme.colors.success ?? '#22c55e'
          : item.systemEventType === 'kick'
          ? theme.colors.error ?? '#ef4444'
          : theme.colors.textMuted;

      return (
        <View style={styles.systemMessage}>
          <IconSymbol name={iconName} size={16} color={iconColor} />
          <Text style={styles.systemMessageText}>{item.content}</Text>
          <Text style={styles.systemMessageTime}>{item.timeString}</Text>
        </View>
      );
    },
    [styles, theme]
  );

  // Render deleted message placeholder
  const renderDeletedMessage = useCallback(
    (item: DisplayMessage) => {
      return (
        <View style={styles.deletedMessage}>
          <IconSymbol
            name="trash.fill"
            size={14}
            color={theme.colors.textMuted}
          />
          <Text style={styles.deletedMessageText}>{item.content}</Text>
        </View>
      );
    },
    [styles, theme]
  );

  // Render embed/media message
  const renderEmbedMessage = useCallback(
    (item: DisplayMessage) => {
      const imageUrl = item.imageUrl || item.thumbnailUrl;

      return (
        <View style={styles.message}>
          {renderAvatar(item)}
          <View style={styles.messageContent}>
            <View style={styles.messageHeader}>
              <Text style={styles.messageUser}>{item.userName}</Text>
              <Text style={styles.messageTime}>{item.timeString}</Text>
            </View>
            {imageUrl && (
              <View style={styles.embedImageContainer}>
                <AutoHeightImage
                  uri={imageUrl}
                  maxHeight={400}
                  maxWidth={MESSAGE_IMAGE_MAX_WIDTH}
                  style={styles.embedImage}
                  onPress={() => setViewerImage(imageUrl)}
                />
              </View>
            )}
            {item.videoUrl && (
              <View style={styles.videoPlaceholder}>
                <IconSymbol name="play.circle.fill" size={40} color="#fff" />
                <Text style={styles.videoPlaceholderText}>Video</Text>
              </View>
            )}
            {renderReactions(item.reactions || [], item.id)}
          </View>
        </View>
      );
    },
    [styles, renderReactions, renderAvatar]
  );

  // Render sticker message
  const renderStickerMessage = useCallback(
    (item: DisplayMessage) => {
      const sticker = item.stickerId ? stickerMap[item.stickerId] : null;

      return (
        <View style={styles.message}>
          {renderAvatar(item)}
          <View style={styles.messageContent}>
            <View style={styles.messageHeader}>
              <Text style={styles.messageUser}>{item.userName}</Text>
              <Text style={styles.messageTime}>{item.timeString}</Text>
            </View>
            {sticker ? (
              <View style={styles.stickerContainer}>
                <Image
                  source={{ uri: sticker.imgUrl }}
                  style={styles.stickerImage}
                  resizeMode="contain"
                />
              </View>
            ) : (
              <View style={styles.stickerPlaceholder}>
                <Text style={styles.stickerPlaceholderText}>[Sticker]</Text>
              </View>
            )}
            {renderReactions(item.reactions || [], item.id)}
          </View>
        </View>
      );
    },
    [styles, renderReactions, stickerMap, renderAvatar]
  );

  // Render regular post message
  const renderPostMessage = useCallback(
    (item: DisplayMessage) => {
      const isSending = item.sendStatus === 'sending';
      const isFailed = item.sendStatus === 'failed';

      // Check if message contains an invite link
      const hasInviteLink = containsInviteLink(item.content);
      const inviteLink = hasInviteLink ? extractInviteLink(item.content) : null;

      // Check if message contains a Farcaster link
      const hasFarcasterLink = containsFarcasterLink(item.content);
      const farcasterLink = hasFarcasterLink ? extractFarcasterLink(item.content) : null;

      // Strip special links from message text for display
      let messageTextWithoutLink: string | null = item.content;
      if (hasInviteLink) {
        messageTextWithoutLink = stripInviteLink(messageTextWithoutLink) ?? '';
      }
      if (hasFarcasterLink && messageTextWithoutLink) {
        messageTextWithoutLink = stripFarcasterLink(messageTextWithoutLink) ?? '';
      }
      // Convert empty string to null for cleaner conditional rendering
      if (messageTextWithoutLink === '') {
        messageTextWithoutLink = null;
      }

      // Show action sheet if reply is available, otherwise go straight to emoji picker
      const handleLongPress = () => {
        if (onReply) {
          setActionSheetMessageId(item.id);
        } else {
          setReactionPickerMessageId(item.id);
        }
      };

      return (
        <Pressable
          onLongPress={handleLongPress}
          delayLongPress={300}
        >
          <View style={[styles.message, isSending && styles.messageSending]}>
            {renderAvatar(item)}
            <View style={styles.messageContent}>
              <View style={styles.messageHeader}>
                <Text style={styles.messageUser}>{item.userName}</Text>
                <Text style={styles.messageTime}>{item.timeString}</Text>
                {item.isEdited && (
                  <Text style={styles.editedIndicator}>(edited)</Text>
                )}
                {isSending && (
                  <ActivityIndicator
                    size="small"
                    color={theme.colors.textMuted}
                    style={styles.sendingIndicator}
                  />
                )}
              </View>
              {/* Reply indicator - tap to scroll to original message */}
              {item.isReply && item.replyToAuthor && item.replyToMessageId && (
                <TouchableOpacity
                  style={styles.replyIndicator}
                  onPress={() => {
                    // Find the index in the inverted array and scroll to it
                    const index = invertedMessages.findIndex((m) => m.id === item.replyToMessageId);
                    if (index !== -1) {
                      flatListRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 });
                    }
                  }}
                  activeOpacity={0.7}
                >
                  <IconSymbol
                    name="arrowshape.turn.up.left.fill"
                    size={12}
                    color={theme.colors.textMuted}
                  />
                  <Text style={styles.replyIndicatorText}>
                    Replying to {item.replyToAuthor}
                  </Text>
                </TouchableOpacity>
              )}
              {item.hasLink && item.link ? (
                <View style={styles.messageWithLink}>
                  <Text style={styles.messageText}>{item.content}</Text>
                  <BrowserLink url={item.link} textStyle={styles.linkText}>
                    {item.linkText}
                  </BrowserLink>
                </View>
              ) : messageTextWithoutLink ? (
                <Text style={styles.messageText}>{messageTextWithoutLink}</Text>
              ) : null}
              {/* Render invite link card if detected */}
              {inviteLink && (
                <InviteLinkCard
                  inviteLink={inviteLink}
                  messageSenderId={item.userId}
                  onJoinSuccess={onJoinSpace}
                />
              )}
              {/* Render Farcaster cast card if detected */}
              {farcasterLink && (
                <FarcasterCastCard url={farcasterLink} onPress={onOpenFarcasterCast} />
              )}
              {/* Render reactions */}
              {renderReactions(item.reactions || [], item.id)}
              {isFailed && (
                <View style={styles.failedRow}>
                  <IconSymbol
                    name="exclamationmark.circle.fill"
                    size={14}
                    color={theme.colors.error ?? '#ef4444'}
                  />
                  <Text style={styles.failedText}>
                    {item.sendError || 'Failed to send'}
                  </Text>
                  {onRetryMessage && (
                    <TouchableOpacity
                      onPress={() => onRetryMessage(item.id)}
                      style={styles.retryButton}
                    >
                      <Text style={styles.retryText}>Retry</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>
          </View>
        </Pressable>
      );
    },
    [styles, theme, onRetryMessage, onJoinSpace, onOpenFarcasterCast, renderReactions, renderAvatar, invertedMessages]
  );

  const renderItem = useCallback(
    ({ item }: { item: DisplayMessage }) => {
      // Route to appropriate renderer based on message type
      switch (item.renderType) {
        case 'system':
          return renderSystemMessage(item);
        case 'deleted':
          return renderDeletedMessage(item);
        case 'embed':
          return renderEmbedMessage(item);
        case 'sticker':
          return renderStickerMessage(item);
        case 'post':
        default:
          return renderPostMessage(item);
      }
    },
    [renderSystemMessage, renderDeletedMessage, renderEmbedMessage, renderStickerMessage, renderPostMessage]
  );

  // Loading state
  if (isLoading && messages.length === 0) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>Loading messages...</Text>
      </View>
    );
  }

  // Error state
  if (error && messages.length === 0) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <Text style={styles.errorText}>Failed to load messages</Text>
        <Text style={styles.errorDetail}>{error.message}</Text>
      </View>
    );
  }

  // Empty state
  if (!isLoading && messages.length === 0) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <Text style={styles.emptyText}>No messages yet</Text>
        <Text style={styles.emptySubtext}>Be the first to say something!</Text>
      </View>
    );
  }

  return (
    <>
    <FlatList
      ref={flatListRef}
      data={invertedMessages}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      style={styles.container}
      inverted={true}
      onEndReached={handleEndReached}
      onEndReachedThreshold={0.5}
      ListFooterComponent={
        isLoadingMore ? (
          <View style={styles.loadingMore}>
            <ActivityIndicator size="small" color={theme.colors.primary} />
          </View>
        ) : null
      }
    />
    <ImageViewer
      visible={!!viewerImage}
      imageUrl={viewerImage}
      onClose={() => setViewerImage(null)}
    />
    <EmojiPicker
      visible={!!reactionPickerMessageId}
      onClose={() => setReactionPickerMessageId(null)}
      onSelectEmoji={handleSelectReaction}
      theme={theme}
      customEmojis={customEmojis}
    />
    <MessageActionSheet
      visible={!!actionSheetMessageId}
      onClose={() => setActionSheetMessageId(null)}
      onReply={handleReplyFromActionSheet}
      onReact={handleReactFromActionSheet}
      theme={theme}
    />
    </>
  );
});

const createStyles = (theme: any) => StyleSheet.create({
  container: {
    flex: 1,
    width: SCREEN_WIDTH,
  },
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  message: {
    flexDirection: 'row',
    padding: 16,
    width: SCREEN_WIDTH,
  },
  messageAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  messageContent: {
    flex: 1,
  },
  messageHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
  },
  messageUser: {
    color: theme.colors.textStrong,
    fontFamily: theme.fonts.medium.fontFamily,
    fontWeight: theme.fonts.medium.fontWeight,
    marginRight: 8,
  },
  messageTime: {
    color: theme.colors.textMuted,
    fontSize: 12,
  },
  messageText: {
    color: theme.colors.textMain,
    marginTop: 4,
    fontFamily: theme.fonts.regular.fontFamily,
  },
  messageWithLink: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 4,
    flexWrap: 'wrap',
  },
  linkText: {
    color: theme.colors.primary,
    textDecorationLine: 'underline',
    fontFamily: theme.fonts.regular.fontFamily,
  },
  loadingText: {
    marginTop: 12,
    color: theme.colors.textMuted,
    fontSize: 14,
    fontFamily: theme.fonts.regular.fontFamily,
  },
  errorText: {
    color: theme.colors.error ?? theme.colors.accent,
    fontSize: 16,
    fontFamily: theme.fonts.medium.fontFamily,
    fontWeight: theme.fonts.medium.fontWeight,
    textAlign: 'center',
  },
  errorDetail: {
    marginTop: 8,
    color: theme.colors.textMuted,
    fontSize: 14,
    fontFamily: theme.fonts.regular.fontFamily,
    textAlign: 'center',
  },
  emptyText: {
    color: theme.colors.textMain,
    fontSize: 18,
    fontFamily: theme.fonts.medium.fontFamily,
    fontWeight: theme.fonts.medium.fontWeight,
    textAlign: 'center',
  },
  emptySubtext: {
    marginTop: 8,
    color: theme.colors.textMuted,
    fontSize: 14,
    fontFamily: theme.fonts.regular.fontFamily,
    textAlign: 'center',
  },
  loadingMore: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  messageSending: {
    opacity: 0.6,
  },
  sendingIndicator: {
    marginLeft: 8,
  },
  failedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  failedText: {
    color: theme.colors.error ?? '#ef4444',
    fontSize: 12,
    fontFamily: theme.fonts.regular.fontFamily,
    marginLeft: 4,
  },
  retryButton: {
    marginLeft: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: theme.colors.surface5 ?? theme.colors.surface3,
    borderRadius: 4,
  },
  retryText: {
    color: theme.colors.primary,
    fontSize: 12,
    fontFamily: theme.fonts.medium.fontFamily,
  },
  // System message styles
  systemMessage: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  systemMessageText: {
    color: theme.colors.textMuted,
    fontSize: 13,
    fontFamily: theme.fonts.regular.fontFamily,
    marginHorizontal: 8,
    fontStyle: 'italic',
  },
  systemMessageTime: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontFamily: theme.fonts.regular.fontFamily,
  },
  // Deleted message styles
  deletedMessage: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    opacity: 0.6,
  },
  deletedMessageText: {
    color: theme.colors.textMuted,
    fontSize: 14,
    fontFamily: theme.fonts.regular.fontFamily,
    fontStyle: 'italic',
    marginLeft: 8,
  },
  // Edited indicator
  editedIndicator: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontFamily: theme.fonts.regular.fontFamily,
    marginLeft: 6,
  },
  // Reply indicator
  replyIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  replyIndicatorText: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontFamily: theme.fonts.regular.fontFamily,
    marginLeft: 4,
  },
  // Reactions styles
  reactionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 6,
    gap: 6,
  },
  reactionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface3 ?? theme.colors.surface2,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  reactionBadgeActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.surface4 ?? theme.colors.surface3,
  },
  reactionEmoji: {
    fontSize: 14,
  },
  reactionCustomEmoji: {
    width: 16,
    height: 16,
    borderRadius: 2,
  },
  reactionCount: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontFamily: theme.fonts.medium.fontFamily,
    marginLeft: 4,
  },
  reactionCountActive: {
    color: theme.colors.primary,
  },
  // Embed/media styles
  embedImageContainer: {
    marginTop: 8,
    borderRadius: 8,
    overflow: 'hidden',
  },
  embedImage: {
    borderRadius: 8,
  },
  videoPlaceholder: {
    width: '100%',
    maxWidth: 300,
    height: 180,
    borderRadius: 8,
    marginTop: 8,
    backgroundColor: theme.colors.surface3 ?? '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoPlaceholderText: {
    color: '#fff',
    fontSize: 12,
    fontFamily: theme.fonts.regular.fontFamily,
    marginTop: 8,
  },
  // Sticker styles
  stickerContainer: {
    marginTop: 8,
  },
  stickerImage: {
    width: 128,
    height: 128,
    borderRadius: 8,
  },
  stickerPlaceholder: {
    width: 128,
    height: 128,
    marginTop: 8,
    borderRadius: 8,
    backgroundColor: theme.colors.surface3 ?? '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stickerPlaceholderText: {
    color: theme.colors.textMuted,
    fontSize: 14,
    fontFamily: theme.fonts.regular.fontFamily,
  },
});

export default MessagesList;
