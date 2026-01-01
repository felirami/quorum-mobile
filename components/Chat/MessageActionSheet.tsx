/**
 * MessageActionSheet - Shows actions available for a message (Reply, React)
 */

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Pressable,
} from 'react-native';
import { IconSymbol } from '@/components/ui/IconSymbol';

interface MessageActionSheetProps {
  visible: boolean;
  onClose: () => void;
  onReply: () => void;
  onReact: () => void;
  theme: any;
}

export function MessageActionSheet({
  visible,
  onClose,
  onReply,
  onReact,
  theme,
}: MessageActionSheetProps) {
  const styles = createStyles(theme);

  if (!visible) return null;

  const handleReply = () => {
    onReply();
    onClose();
  };

  const handleReact = () => {
    onReact();
    // Don't close - the emoji picker will handle closing
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.container}>
          <TouchableOpacity style={styles.actionButton} onPress={handleReply}>
            <IconSymbol
              name="arrowshape.turn.up.left.fill"
              size={20}
              color={theme.colors.textMain}
            />
            <Text style={styles.actionText}>Reply</Text>
          </TouchableOpacity>
          <View style={styles.divider} />
          <TouchableOpacity style={styles.actionButton} onPress={handleReact}>
            <IconSymbol
              name="face.smiling"
              size={20}
              color={theme.colors.textMain}
            />
            <Text style={styles.actionText}>Add Reaction</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (theme: any) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
    },
    container: {
      backgroundColor: theme.colors.surface1 ?? theme.colors.background,
      borderRadius: 12,
      minWidth: 200,
      overflow: 'hidden',
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
    divider: {
      height: 1,
      backgroundColor: theme.colors.border ?? theme.colors.surface3,
    },
  });

export default MessageActionSheet;
