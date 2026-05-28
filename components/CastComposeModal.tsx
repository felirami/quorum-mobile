import { BaseModal } from '@/components/shared';
import { IconSymbol } from '@/components/ui/IconSymbol';
import { postFarcasterCast, uploadImageForCast } from '@/services/farcasterClient';
import { pickImage, type ProcessedAttachment } from '@/services/media/imageAttachment';
import { useTheme, type AppTheme } from '@/theme';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

interface CastComposeModalProps {
  visible: boolean;
  onClose: () => void;
  /** Required token. The modal is gated on a valid Farcaster session. */
  token?: string;
  /** Optional channel target. When set, the modal posts the cast there. */
  channelKey?: string;
  /** Called once the cast has been posted (parent can refetch). */
  onPosted?: () => void;
}

const MAX_LENGTH = 320;

export default function CastComposeModal({
  visible,
  onClose,
  token,
  channelKey,
  onPosted,
}: CastComposeModalProps) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [text, setText] = useState('');
  const [images, setImages] = useState<ProcessedAttachment[]>([]);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state on close
  useEffect(() => {
    if (!visible) {
      setText('');
      setImages([]);
      setPosting(false);
      setError(null);
    }
  }, [visible]);

  const canPost = !posting && Boolean(token) && (text.trim().length > 0 || images.length > 0);

  const handlePickImage = async () => {
    if (images.length >= 2) return;
    const result = await pickImage('library');
    if (result.success && result.attachment) {
      setImages((prev) => [...prev, result.attachment!]);
    }
  };

  const handleRemoveImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handlePost = async () => {
    if (!canPost || !token) return;
    setPosting(true);
    setError(null);
    try {
      const embeds: string[] = [];
      for (const image of images) {
        const uploaded = await uploadImageForCast(token, image.localUri, image.mimeType);
        embeds.push(uploaded.url);
      }
      await postFarcasterCast({
        token,
        text: text.trim(),
        embeds,
        channelKey,
      });
      onPosted?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to post cast');
    } finally {
      setPosting(false);
    }
  };

  return (
    <BaseModal visible={visible} onClose={onClose} height={0.7} avoidKeyboard>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} disabled={posting}>
            <Text style={[styles.cancelText, posting && styles.disabled]}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.title}>{channelKey ? `Cast in /${channelKey}` : 'New cast'}</Text>
          <TouchableOpacity
            onPress={handlePost}
            disabled={!canPost}
            style={[styles.postButton, !canPost && styles.postButtonDisabled]}
          >
            {posting ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.postText}>Post</Text>
            )}
          </TouchableOpacity>
        </View>

        <TextInput
          autoFocus
          multiline
          maxLength={MAX_LENGTH}
          value={text}
          onChangeText={setText}
          placeholder={channelKey ? `What's on your mind in /${channelKey}?` : "What's happening?"}
          placeholderTextColor={theme.colors.textMuted}
          style={styles.input}
          editable={!posting}
        />

        {images.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.imageRow} contentContainerStyle={{ gap: 8 }}>
            {images.map((image, index) => (
              <View key={index} style={styles.imageWrap}>
                <Image source={{ uri: image.localUri }} style={styles.image} />
                <TouchableOpacity onPress={() => handleRemoveImage(index)} style={styles.removeImage}>
                  <IconSymbol name="xmark.circle.fill" size={18} color="#fff" />
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        )}

        <View style={styles.footer}>
          <TouchableOpacity onPress={handlePickImage} style={styles.iconButton} disabled={posting || images.length >= 2}>
            <IconSymbol name="photo.fill" size={20} color={images.length >= 2 ? theme.colors.textMuted : theme.colors.accent} />
          </TouchableOpacity>
          <View style={{ flex: 1 }} />
          <Text style={styles.charCount}>
            {text.length}/{MAX_LENGTH}
          </Text>
        </View>

        {error && <Text style={styles.errorText}>{error}</Text>}
      </ScrollView>
    </BaseModal>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    container: {
      paddingHorizontal: 20,
      paddingBottom: 40,
      gap: 12,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: 4,
      paddingBottom: 6,
    },
    title: {
      fontSize: 15,
      fontWeight: '600',
      color: theme.colors.textStrong,
      flex: 1,
      textAlign: 'center',
      marginHorizontal: 12,
    },
    cancelText: {
      color: theme.colors.textMuted,
      fontSize: 15,
    },
    disabled: {
      opacity: 0.5,
    },
    postButton: {
      backgroundColor: theme.colors.accent,
      paddingHorizontal: 14,
      paddingVertical: 6,
      borderRadius: 14,
      minWidth: 56,
      alignItems: 'center',
    },
    postButtonDisabled: {
      opacity: 0.4,
    },
    postText: {
      color: '#fff',
      fontWeight: '600',
      fontSize: 14,
    },
    input: {
      minHeight: 100,
      maxHeight: 240,
      fontSize: 16,
      color: theme.colors.textMain,
      textAlignVertical: 'top',
      padding: 0,
    },
    imageRow: {
      maxHeight: 110,
    },
    imageWrap: {
      position: 'relative',
    },
    image: {
      width: 100,
      height: 100,
      borderRadius: 8,
      backgroundColor: theme.colors.surface3,
    },
    removeImage: {
      position: 'absolute',
      top: 4,
      right: 4,
    },
    footer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingTop: 4,
    },
    iconButton: {
      padding: 4,
    },
    charCount: {
      fontSize: 12,
      color: theme.colors.textMuted,
    },
    errorText: {
      color: theme.colors.danger,
      fontSize: 12,
      marginTop: 4,
    },
  });
}
