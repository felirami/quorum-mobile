/**
 * MessageActionSheet - Modal with actions available for a message
 * Actions: Reply, Edit, Pin/Unpin, Bookmark, Copy Text, React, Delete
 * Includes quick emoji reactions from frecency list
 */

import type { AppTheme } from '@/theme';
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Pressable,
  Alert,
  Dimensions,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { IconSymbol } from '@/components/ui/IconSymbol';
import { getRecentEmojis } from '@/services/emojiFrecency';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Default quick reactions if no frecency data
const DEFAULT_QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥'];

interface MessageActionSheetProps {
  visible: boolean;
  onClose: () => void;
  onReply?: () => void;
  onReact: () => void;
  onQuickReact?: (emoji: string) => void;
  onDelete?: () => void;
  canDelete?: boolean;
  onEdit?: () => void;
  canEdit?: boolean;
  onPin?: () => void;
  onUnpin?: () => void;
  isPinned?: boolean;
  canPin?: boolean;
  onBookmark?: () => void;
  isBookmarked?: boolean;
  onViewEditHistory?: () => void;
  hasEditHistory?: boolean;
  messageText?: string;
  // Reporting. Only shown when caller wires both `onReport` and the
  // current user is NOT the message's author (canReport handled by the
  // parent — we only render the action when the prop is provided).
  onReport?: () => void;
  theme: AppTheme;
}

export function MessageActionSheet({
  visible,
  onClose,
  onReply,
  onReact,
  onQuickReact,
  onDelete,
  canDelete = false,
  onEdit,
  canEdit = false,
  onPin,
  onUnpin,
  isPinned = false,
  canPin = false,
  onBookmark,
  isBookmarked = false,
  onViewEditHistory,
  hasEditHistory = false,
  messageText,
  onReport,
  theme,
}: MessageActionSheetProps) {
  const styles = createStyles(theme);
  const [quickEmojis, setQuickEmojis] = useState<string[]>(DEFAULT_QUICK_REACTIONS);

  // Load frecency emojis when modal opens
  useEffect(() => {
    if (visible) {
      loadQuickEmojis();
    }
  }, [visible]);

  const loadQuickEmojis = async () => {
    const recent = await getRecentEmojis(6);
    if (recent.length > 0) {
      setQuickEmojis(recent);
    } else {
      setQuickEmojis(DEFAULT_QUICK_REACTIONS);
    }
  };

  if (!visible) return null;

  const handleReply = () => {
    onReply?.();
    onClose();
  };

  const handleReact = () => {
    onReact();
    // Don't close - the emoji picker will handle closing
  };

  const handleQuickReact = (emoji: string) => {
    onQuickReact?.(emoji);
    onClose();
  };

  const handleEdit = () => {
    onEdit?.();
    onClose();
  };

  const handlePin = () => {
    if (isPinned) {
      onUnpin?.();
    } else {
      onPin?.();
    }
    onClose();
  };

  const handleBookmark = () => {
    onBookmark?.();
    onClose();
  };

  const handleViewEditHistory = () => {
    onViewEditHistory?.();
    onClose();
  };

  const handleCopyText = async () => {
    if (messageText) {
      await Clipboard.setStringAsync(messageText);
    }
    onClose();
  };

  const handleReport = () => {
    onReport?.();
    onClose();
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Message',
      'Are you sure you want to delete this message?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            onDelete?.();
            onClose();
          },
        },
      ]
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.container}>
          {/* Drag handle */}
          <View style={styles.handleContainer}>
            <View style={styles.handle} />
          </View>

          {/* Quick Emoji Reactions */}
          {onQuickReact && (
            <View style={styles.quickReactionsContainer}>
              <View style={styles.quickReactionsContent}>
                {quickEmojis.map((emoji, index) => (
                  <TouchableOpacity
                    key={`${emoji}-${index}`}
                    style={styles.quickReactionButton}
                    onPress={() => handleQuickReact(emoji)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.quickReactionEmoji}>{emoji}</Text>
                  </TouchableOpacity>
                ))}
                {/* More button to open full picker */}
                <TouchableOpacity
                  style={styles.quickReactionButton}
                  onPress={handleReact}
                  activeOpacity={0.7}
                >
                  <IconSymbol
                    name="plus"
                    size={20}
                    color={theme.colors.textMuted}
                  />
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Action Buttons */}
          <View style={styles.actionsContainer}>
            {onReply && (
              <>
                <TouchableOpacity style={styles.actionButton} onPress={handleReply}>
                  <IconSymbol
                    name="arrowshape.turn.up.left.fill"
                    size={20}
                    color={theme.colors.textMain}
                  />
                  <Text style={styles.actionText}>Reply</Text>
                </TouchableOpacity>
                <View style={styles.divider} />
              </>
            )}
            {canEdit && onEdit && (
              <>
                <TouchableOpacity style={styles.actionButton} onPress={handleEdit}>
                  <IconSymbol
                    name="pencil"
                    size={20}
                    color={theme.colors.textMain}
                  />
                  <Text style={styles.actionText}>Edit Message</Text>
                </TouchableOpacity>
                <View style={styles.divider} />
              </>
            )}
            {hasEditHistory && onViewEditHistory && (
              <>
                <TouchableOpacity style={styles.actionButton} onPress={handleViewEditHistory}>
                  <IconSymbol
                    name="clock.arrow.circlepath"
                    size={20}
                    color={theme.colors.textMain}
                  />
                  <Text style={styles.actionText}>View Edit History</Text>
                </TouchableOpacity>
                <View style={styles.divider} />
              </>
            )}
            {canPin && (onPin || onUnpin) && (
              <>
                <TouchableOpacity style={styles.actionButton} onPress={handlePin}>
                  <IconSymbol
                    name={isPinned ? 'pin.slash' : 'pin.fill'}
                    size={20}
                    color={theme.colors.textMain}
                  />
                  <Text style={styles.actionText}>{isPinned ? 'Unpin Message' : 'Pin Message'}</Text>
                </TouchableOpacity>
                <View style={styles.divider} />
              </>
            )}
            {onBookmark && (
              <>
                <TouchableOpacity style={styles.actionButton} onPress={handleBookmark}>
                  <IconSymbol
                    name={isBookmarked ? 'bookmark.slash.fill' : 'bookmark'}
                    size={20}
                    color={theme.colors.textMain}
                  />
                  <Text style={styles.actionText}>
                    {isBookmarked ? 'Remove Bookmark' : 'Bookmark'}
                  </Text>
                </TouchableOpacity>
                <View style={styles.divider} />
              </>
            )}
            {messageText && (
              <>
                <TouchableOpacity style={styles.actionButton} onPress={handleCopyText}>
                  <IconSymbol
                    name="doc.on.doc"
                    size={20}
                    color={theme.colors.textMain}
                  />
                  <Text style={styles.actionText}>Copy Text</Text>
                </TouchableOpacity>
                <View style={styles.divider} />
              </>
            )}
            <TouchableOpacity style={styles.actionButton} onPress={handleReact}>
              <IconSymbol
                name="face.smiling"
                size={20}
                color={theme.colors.textMain}
              />
              <Text style={styles.actionText}>Add Reaction</Text>
            </TouchableOpacity>
            {onReport && (
              <>
                <View style={styles.divider} />
                <TouchableOpacity style={styles.actionButton} onPress={handleReport}>
                  <IconSymbol
                    name="flag"
                    size={20}
                    color={theme.colors.danger}
                  />
                  <Text style={[styles.actionText, styles.dangerText]}>Report</Text>
                </TouchableOpacity>
              </>
            )}
            {canDelete && onDelete && (
              <>
                <View style={styles.divider} />
                <TouchableOpacity style={styles.actionButton} onPress={handleDelete}>
                  <IconSymbol
                    name="trash"
                    size={20}
                    color={theme.colors.danger}
                  />
                  <Text style={[styles.actionText, styles.dangerText]}>Delete</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
    },
    container: {
      backgroundColor: theme.colors.surface1 ?? theme.colors.background,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      width: SCREEN_WIDTH,
      paddingBottom: 34, // Safe area for home indicator
    },
    handleContainer: {
      alignItems: 'center',
      paddingVertical: 10,
    },
    handle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: theme.colors.border ?? theme.colors.surface3,
    },
    quickReactionsContainer: {
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border ?? theme.colors.surface3,
    },
    quickReactionsContent: {
      flexDirection: 'row',
      justifyContent: 'space-around',
    },
    quickReactionButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: theme.colors.surface3 ?? theme.colors.surface2,
      justifyContent: 'center',
      alignItems: 'center',
    },
    quickReactionEmoji: {
      fontSize: 22,
    },
    actionsContainer: {
      paddingVertical: 4,
    },
    actionButton: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 14,
      paddingHorizontal: 20,
      gap: 12,
    },
    actionText: {
      fontSize: 16,
      color: theme.colors.textMain,
      fontFamily: theme.fonts.regular.fontFamily,
    },
    dangerText: {
      color: theme.colors.danger,
    },
    divider: {
      height: 1,
      backgroundColor: theme.colors.border ?? theme.colors.surface3,
      marginHorizontal: 16,
    },
  });

export default MessageActionSheet;
