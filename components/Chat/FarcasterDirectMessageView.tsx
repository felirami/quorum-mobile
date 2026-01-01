/**
 * FarcasterDirectMessageView - Shows Farcaster direct cast messages
 * Matches the structure of the regular DM view in index.tsx
 */

import React, { useCallback, useMemo, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  Alert,
} from 'react-native';
import { logger } from '@quilibrium/quorum-shared';
import { DMChatHeader } from './DMChatHeader';
import { MessagesList } from './MessagesList';
import { MessageInput, type MessageInputHandle, type ReplyToMessage } from './MessageInput';
import { directCastToDisplayMessage, type DisplayMessage } from './types';
import type { Conversation } from '@quilibrium/quorum-shared';
import {
  useFarcasterDirectCastMessages,
  useSendFarcasterDirectCast,
  useMarkFarcasterConversationRead,
  useAddFarcasterDirectCastReaction,
  useRemoveFarcasterDirectCastReaction,
} from '@/hooks/chat';
import { useAuth } from '@/context/AuthContext';
import { pickImage, type ProcessedAttachment } from '@/services/media/imageAttachment';
import { uploadFarcasterImage, type DirectCastMessageMetadata } from '@/services/farcasterClient';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Farcaster logo
const FarcasterLogo = require('@/assets/images/farcaster.png');

interface FarcasterDirectMessageViewProps {
  conversation: Conversation;
  onBack: () => void;
  theme: any;
  onOpenFarcasterCast?: (username: string, castHashPrefix: string) => void;
}

export function FarcasterDirectMessageView({
  conversation,
  onBack,
  theme,
  onOpenFarcasterCast,
}: FarcasterDirectMessageViewProps) {
  const { user, farcasterAuthToken } = useAuth();
  const currentUserFid = user?.farcaster?.fid;
  const [messageText, setMessageText] = useState('');
  const [replyTo, setReplyTo] = useState<ReplyToMessage | null>(null);
  const [pendingAttachment, setPendingAttachment] = useState<ProcessedAttachment | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const messageInputRef = useRef<MessageInputHandle>(null);

  // Fetch messages for this Farcaster conversation
  const messagesQuery = useFarcasterDirectCastMessages(conversation.conversationId);
  const sendMutation = useSendFarcasterDirectCast();
  const markReadMutation = useMarkFarcasterConversationRead();
  const addReactionMutation = useAddFarcasterDirectCastReaction();
  const removeReactionMutation = useRemoveFarcasterDirectCastReaction();

  // Convert DirectCastMessages to DisplayMessages
  const displayMessages = useMemo(() => {
    const allMessages = messagesQuery.data?.pages.flatMap((page) => page.messages) ?? [];
    // Farcaster returns messages newest first, we need oldest first for chat display
    const reversed = [...allMessages].reverse();
    return reversed.map((msg) => directCastToDisplayMessage(msg, currentUserFid));
  }, [messagesQuery.data, currentUserFid]);

  // Mark as read when viewing
  React.useEffect(() => {
    if (conversation.unreadCount && conversation.unreadCount > 0) {
      markReadMutation.mutate(conversation.conversationId);
    }
  }, [conversation.conversationId, conversation.unreadCount]);

  const handleAttachmentPress = useCallback(async () => {
    logger.log('[FarcasterDM] Attachment button pressed');
    const result = await pickImage('library');

    if (result.cancelled) {
      logger.log('[FarcasterDM] Image picker cancelled');
      return;
    }

    if (!result.success || !result.attachment) {
      if (result.error) {
        Alert.alert('Error', result.error);
      }
      return;
    }

    logger.log('[FarcasterDM] Image selected:', {
      width: result.attachment.width,
      height: result.attachment.height,
      mimeType: result.attachment.mimeType,
    });

    setPendingAttachment(result.attachment);
  }, []);

  const handleClearAttachment = useCallback(() => {
    setPendingAttachment(null);
  }, []);

  const handleSendMessage = useCallback(async () => {
    // Use farcasterParticipantFids for group chats, fall back to single fid for 1:1
    const recipientFids = conversation.farcasterParticipantFids?.length
      ? conversation.farcasterParticipantFids
      : conversation.farcasterFid
        ? [conversation.farcasterFid]
        : [];

    const hasText = messageText.trim().length > 0;
    const hasAttachment = !!pendingAttachment;

    if ((!hasText && !hasAttachment) || recipientFids.length === 0) return;

    try {
      let finalMessage = messageText.trim();
      let metadata: DirectCastMessageMetadata | undefined;

      // If we have an attachment, upload it first
      if (pendingAttachment && farcasterAuthToken) {
        setIsUploading(true);
        logger.log('[FarcasterDM] Uploading image...');

        try {
          const imageUrl = await uploadFarcasterImage({
            token: farcasterAuthToken,
            uri: pendingAttachment.localUri,
            name: 'direct-cast-image',
            mimeType: pendingAttachment.mimeType,
          });

          if (!imageUrl) {
            throw new Error('Failed to upload image');
          }

          logger.log('[FarcasterDM] Image uploaded:', imageUrl);

          // Build message with image URL (matching Farcaster format)
          finalMessage = hasText ? `${imageUrl} ${finalMessage}` : imageUrl;

          // Build metadata
          metadata = {
            medias: [{
              height: pendingAttachment.height,
              width: pendingAttachment.width,
              staticRaster: imageUrl,
              version: '2',
            }],
          };
        } catch (uploadError) {
          logger.log('[FarcasterDM] Image upload failed:', uploadError);
          Alert.alert('Upload Failed', 'Failed to upload image. Please try again.');
          setIsUploading(false);
          return;
        }
      }

      sendMutation.mutate({
        conversationId: conversation.conversationId,
        recipientFids,
        message: finalMessage,
        inReplyToId: replyTo?.messageId,
        metadata,
      });

      setMessageText('');
      setReplyTo(null);
      setPendingAttachment(null);
    } finally {
      setIsUploading(false);
    }
  }, [conversation, messageText, sendMutation, replyTo, pendingAttachment, farcasterAuthToken]);

  const handleReply = useCallback((message: DisplayMessage) => {
    setReplyTo({
      messageId: message.id,
      senderName: message.userName,
      text: message.content,
    });
    // Focus the input when replying
    messageInputRef.current?.focus();
  }, []);

  const handleDismissReply = useCallback(() => {
    setReplyTo(null);
  }, []);

  const handleRefresh = useCallback(async () => {
    await messagesQuery.refetch();
  }, [messagesQuery]);

  const handleLoadMore = useCallback(() => {
    if (messagesQuery.hasNextPage) {
      messagesQuery.fetchNextPage();
    }
  }, [messagesQuery]);

  const handleAddReaction = useCallback((messageId: string, emoji: string) => {
    addReactionMutation.mutate({
      conversationId: conversation.conversationId,
      messageId,
      reaction: emoji,
    });
  }, [conversation.conversationId, addReactionMutation]);

  const handleRemoveReaction = useCallback((messageId: string, emoji: string) => {
    removeReactionMutation.mutate({
      conversationId: conversation.conversationId,
      messageId,
      reaction: emoji,
    });
  }, [conversation.conversationId, removeReactionMutation]);

  const styles = createStyles(theme);

  const displayName = conversation.displayName ||
    (conversation.farcasterUsername ? `@${conversation.farcasterUsername}` : 'Unknown');

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <DMChatHeader
        conversation={conversation}
        sidebarsVisible={false}
        onShowSidebars={onBack}
        theme={theme}
      />

      {/* Security warning banner */}
      <View style={styles.warningBanner}>
        <Image source={FarcasterLogo} style={styles.warningIcon} />
        <Text style={styles.warningText}>
          Farcaster messages are not end-to-end encrypted
        </Text>
      </View>

      <MessagesList
        messages={displayMessages}
        theme={theme}
        isLoading={messagesQuery.isLoading}
        isRefreshing={messagesQuery.isRefetching}
        isLoadingMore={messagesQuery.isFetchingNextPage}
        error={messagesQuery.error}
        onRefresh={handleRefresh}
        onLoadMore={handleLoadMore}
        hasMore={!!messagesQuery.hasNextPage}
        onReaction={handleAddReaction}
        onRemoveReaction={handleRemoveReaction}
        onReply={handleReply}
        onOpenFarcasterCast={onOpenFarcasterCast}
      />

      <MessageInput
        ref={messageInputRef}
        value={messageText}
        onChangeText={setMessageText}
        onSend={handleSendMessage}
        channelName={displayName}
        theme={theme}
        isSending={sendMutation.isPending || isUploading}
        replyTo={replyTo}
        onDismissReply={handleDismissReply}
        onAttachmentPress={handleAttachmentPress}
        pendingAttachment={pendingAttachment}
        onClearAttachment={handleClearAttachment}
      />
    </KeyboardAvoidingView>
  );
}

const createStyles = (theme: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      width: SCREEN_WIDTH,
    },
    warningBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#8B5CF6' + '20', // Farcaster purple with opacity
      paddingVertical: 6,
      paddingHorizontal: 12,
      gap: 8,
      width: SCREEN_WIDTH,
    },
    warningIcon: {
      width: 14,
      height: 14,
      tintColor: '#8B5CF6',
    },
    warningText: {
      fontSize: 12,
      fontFamily: theme.fonts.regular.fontFamily,
      color: '#8B5CF6',
    },
  });

export default FarcasterDirectMessageView;
