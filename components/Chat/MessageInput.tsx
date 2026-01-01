import { logger } from '@quilibrium/quorum-shared';
import React, { useCallback, useRef, useImperativeHandle, forwardRef } from 'react';
import {
  Dimensions,
  TextInput,
  TouchableOpacity,
  View,
  StyleSheet,
  ActivityIndicator,
  NativeSyntheticEvent,
  TextInputSubmitEditingEventData,
  Image,
  Text,
} from 'react-native';
import { IconSymbol } from '@/components/ui/IconSymbol';
import type { ProcessedAttachment } from '@/services/media/imageAttachment';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export interface ReplyToMessage {
  messageId: string;
  senderName: string;
  text: string;
}

interface MessageInputProps {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  channelName: string;
  theme: any;
  isSending?: boolean;
  disabled?: boolean;
  onAttachmentPress?: () => void;
  onMentionPress?: () => void;
  onEmojiPress?: () => void;
  /** Pending image attachment to preview */
  pendingAttachment?: ProcessedAttachment | null;
  /** Clear the pending attachment */
  onClearAttachment?: () => void;
  /** Message being replied to */
  replyTo?: ReplyToMessage | null;
  /** Dismiss the reply */
  onDismissReply?: () => void;
}

export interface MessageInputHandle {
  focus: () => void;
}

export const MessageInput = forwardRef<MessageInputHandle, MessageInputProps>(function MessageInput({
  value,
  onChangeText,
  onSend,
  channelName,
  theme,
  isSending = false,
  disabled = false,
  onAttachmentPress,
  onMentionPress,
  onEmojiPress,
  pendingAttachment,
  onClearAttachment,
  replyTo,
  onDismissReply,
}, ref) {
  const styles = createStyles(theme);
  const inputRef = useRef<TextInput>(null);

  // Expose focus method to parent
  useImperativeHandle(ref, () => ({
    focus: () => {
      inputRef.current?.focus();
    },
  }));

  // Can send if we have text OR an attachment
  const canSend = (value.trim().length > 0 || !!pendingAttachment) && !isSending && !disabled;

  const handleSend = useCallback(() => {
    logger.log('[MessageInput] handleSend called, canSend:', canSend);
    if (canSend) {
      onSend();
    }
  }, [canSend, onSend]);

  const handleSubmitEditing = useCallback(
    (e: NativeSyntheticEvent<TextInputSubmitEditingEventData>) => {
      if (canSend) {
        onSend();
      }
    },
    [canSend, onSend]
  );

  return (
    <View style={styles.container}>
      {/* Reply-to preview */}
      {replyTo && (
        <View style={styles.replyContainer}>
          <View style={styles.replyBar} />
          <View style={styles.replyContent}>
            <Text style={styles.replySender} numberOfLines={1}>
              Replying to {replyTo.senderName}
            </Text>
            <Text style={styles.replyText} numberOfLines={1}>
              {replyTo.text}
            </Text>
          </View>
          <TouchableOpacity onPress={onDismissReply} style={styles.replyDismiss}>
            <IconSymbol name="xmark" size={16} color={theme.colors.textMuted} />
          </TouchableOpacity>
        </View>
      )}

      {/* Image preview */}
      {pendingAttachment && (
        <View style={styles.previewContainer}>
          <View style={styles.previewWrapper}>
            <TouchableOpacity
              style={styles.previewCloseButton}
              onPress={onClearAttachment}
            >
              <IconSymbol name="xmark.circle.fill" size={24} color={theme.colors.textMain} />
            </TouchableOpacity>
            <Image
              source={{ uri: pendingAttachment.localUri }}
              style={styles.previewImage}
              resizeMode="cover"
            />
            {pendingAttachment.isLargeGif && (
              <View style={styles.gifBadge}>
                <Text style={styles.gifBadgeText}>GIF</Text>
              </View>
            )}
          </View>
        </View>
      )}

      <View style={styles.wrapper}>
        <TouchableOpacity
          style={styles.inputIconButton}
          onPress={onAttachmentPress}
          disabled={disabled}
        >
          <IconSymbol
            name="plus.circle.fill"
            color={disabled ? theme.colors.textMuted : theme.colors.textSubtle}
            size={24}
          />
        </TouchableOpacity>
        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={onChangeText}
          placeholder={`Message #${channelName}`}
          placeholderTextColor={theme.colors.textMuted}
          style={styles.input}
          editable={!disabled && !isSending}
          returnKeyType="send"
          onSubmitEditing={handleSubmitEditing}
          blurOnSubmit={false}
          multiline
        />
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.sendButton]}
            onPress={handleSend}
            disabled={!canSend}
          >
            {isSending ? (
              <ActivityIndicator size="small" color={theme.colors.primary} />
            ) : (
              <IconSymbol
                name="paperplane.fill"
                color={canSend ? theme.colors.primary : theme.colors.textMuted}
                size={24}
              />
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
});

const createStyles = (theme: any) => StyleSheet.create({
  container: {
    backgroundColor: theme.colors.surface3,
    paddingHorizontal: 12,
    paddingVertical: 8,
    width: SCREEN_WIDTH,
  },
  replyContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    backgroundColor: theme.colors.surface5,
    borderRadius: 8,
    paddingVertical: 8,
    paddingRight: 8,
  },
  replyBar: {
    width: 3,
    height: '100%',
    backgroundColor: theme.colors.primary,
    borderRadius: 2,
    marginRight: 8,
  },
  replyContent: {
    flex: 1,
  },
  replySender: {
    fontSize: 12,
    fontFamily: theme.fonts.medium.fontFamily,
    fontWeight: theme.fonts.medium.fontWeight,
    color: theme.colors.primary,
    marginBottom: 2,
  },
  replyText: {
    fontSize: 13,
    fontFamily: theme.fonts.regular.fontFamily,
    color: theme.colors.textSubtle,
  },
  replyDismiss: {
    padding: 4,
  },
  previewContainer: {
    marginBottom: 8,
  },
  previewWrapper: {
    position: 'relative',
    alignSelf: 'flex-start',
  },
  previewImage: {
    width: 100,
    height: 100,
    borderRadius: 8,
  },
  previewCloseButton: {
    position: 'absolute',
    top: -8,
    right: -8,
    zIndex: 1,
    backgroundColor: theme.colors.surface3,
    borderRadius: 12,
  },
  gifBadge: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  gifBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  wrapper: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  input: {
    flex: 1,
    backgroundColor: theme.colors.surface5,
    color: theme.colors.textMain,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    marginHorizontal: 8,
    fontFamily: theme.fonts.regular.fontFamily,
    maxHeight: 100,
    minHeight: 40,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  inputIconButton: {
    padding: 4,
  },
  sendButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default MessageInput;
