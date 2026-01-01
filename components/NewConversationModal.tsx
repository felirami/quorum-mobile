/**
 * NewConversationModal - Modal for starting a new DM conversation
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BaseModal } from '@/components/shared';
import { IconSymbol } from '@/components/ui/IconSymbol';
import { useTheme } from '@/theme';
import { useConversations } from '@/hooks/chat/useConversations';
import { useStorageAdapter } from '@/context/StorageContext';

interface NewConversationModalProps {
  visible: boolean;
  onClose: () => void;
  onConversationCreated: (conversationId: string) => void;
}

// Validate address format: Base58 multihash (Qm...) or username (@...)
function isValidAddress(address: string): boolean {
  if (!address) return false;
  const trimmed = address.trim();

  // Username format: @username (alphanumeric, underscores, min 2 chars after @)
  if (trimmed.startsWith('@')) {
    const username = trimmed.slice(1);
    return /^[a-zA-Z0-9_]{2,}$/.test(username);
  }

  // Base58 multihash format (starts with Qm, 46 chars total for CIDv0)
  // Also accept other valid Base58 characters for flexibility
  const base58Regex = /^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{32,}$/;
  return base58Regex.test(trimmed);
}

// Check if input is a username
function isUsername(address: string): boolean {
  return address.trim().startsWith('@');
}

export default function NewConversationModal({
  visible,
  onClose,
  onConversationCreated,
}: NewConversationModalProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const storage = useStorageAdapter();
  const styles = createStyles(theme, insets);

  const [address, setAddress] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get existing conversations to check for duplicates
  const { data: conversationsPages } = useConversations({ type: 'direct' });
  const existingConversations = useMemo(() => {
    if (!conversationsPages?.pages) return [];
    return conversationsPages.pages.flatMap(page => page.conversations);
  }, [conversationsPages]);

  // Normalize address for comparison and storage
  const normalizedAddress = useMemo(() => {
    const trimmed = address.trim();
    // Keep usernames as-is (with @), addresses as-is
    return trimmed;
  }, [address]);

  // Check if conversation already exists
  const existingConversation = useMemo(() => {
    if (!normalizedAddress) return undefined;
    const searchAddress = normalizedAddress.toLowerCase();
    return existingConversations.find(
      c => c.address?.toLowerCase() === searchAddress
    );
  }, [existingConversations, normalizedAddress]);

  // Validation state
  const isValid = isValidAddress(address);
  const canCreate = isValid && !existingConversation && !isCreating;

  const handleCreate = useCallback(async () => {
    if (!canCreate) return;

    setIsCreating(true);
    setError(null);

    try {
      // Generate conversation ID (format: address/address)
      const conversationId = `${normalizedAddress}/${normalizedAddress}`;

      // Save conversation to storage
      await storage.saveConversation({
        conversationId,
        address: normalizedAddress,
        type: 'direct',
        timestamp: Date.now(),
        displayName: undefined,
        icon: undefined,
        lastReadTimestamp: undefined,
      });

      // Close modal and navigate to conversation
      onClose();
      onConversationCreated(conversationId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create conversation');
    } finally {
      setIsCreating(false);
    }
  }, [canCreate, normalizedAddress, storage, onClose, onConversationCreated]);

  const handleOpenExisting = useCallback(() => {
    if (existingConversation) {
      onClose();
      onConversationCreated(existingConversation.conversationId);
    }
  }, [existingConversation, onClose, onConversationCreated]);

  const handleClose = useCallback(() => {
    setAddress('');
    setError(null);
    onClose();
  }, [onClose]);

  return (
    <BaseModal visible={visible} onClose={handleClose} height={0.6} avoidKeyboard>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>New Message</Text>
        </View>

        {/* Address Input */}
        <View style={styles.inputSection}>
          <Text style={styles.label}>Recipient</Text>
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              value={address}
              onChangeText={setAddress}
              placeholder="Address (Qm...) or username (@...)"
              placeholderTextColor={theme.colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="off"
              editable={!isCreating}
            />
            {address.length > 0 && (
              <TouchableOpacity
                style={styles.clearButton}
                onPress={() => setAddress('')}
              >
                <IconSymbol name="xmark.circle.fill" size={20} color={theme.colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>

          {/* Validation feedback */}
          {address.length > 0 && !isValid && (
            <Text style={styles.errorText}>
              Enter a valid address (Qm...) or username (@...)
            </Text>
          )}
          {existingConversation && (
            <TouchableOpacity style={styles.existingBanner} onPress={handleOpenExisting}>
              <IconSymbol name="info.circle" size={16} color={theme.colors.primary} />
              <Text style={styles.existingText}>
                Conversation exists. Tap to open.
              </Text>
            </TouchableOpacity>
          )}
          {error && <Text style={styles.errorText}>{error}</Text>}
        </View>

        {/* Action Buttons */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={handleClose}
            disabled={isCreating}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.createButton, !canCreate && styles.createButtonDisabled]}
            onPress={handleCreate}
            disabled={!canCreate}
          >
            {isCreating ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <IconSymbol name="paperplane.fill" size={18} color="#fff" />
                <Text style={styles.createButtonText}>Start Chat</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </BaseModal>
  );
}

const createStyles = (theme: any, insets: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      paddingHorizontal: 20,
    },
    header: {
      paddingVertical: 16,
      alignItems: 'center',
    },
    title: {
      fontSize: 20,
      fontFamily: theme.fonts.bold.fontFamily,
      fontWeight: theme.fonts.bold.fontWeight,
      color: theme.colors.textStrong,
    },
    inputSection: {
      marginTop: 8,
    },
    label: {
      fontSize: 14,
      fontFamily: theme.fonts.medium.fontFamily,
      fontWeight: theme.fonts.medium.fontWeight,
      color: theme.colors.textMain,
      marginBottom: 8,
    },
    inputContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.colors.surface3,
      borderRadius: 12,
      paddingHorizontal: 16,
    },
    input: {
      flex: 1,
      paddingVertical: 14,
      fontSize: 16,
      fontFamily: theme.fonts.regular.fontFamily,
      color: theme.colors.textMain,
    },
    clearButton: {
      padding: 4,
    },
    errorText: {
      marginTop: 8,
      fontSize: 13,
      fontFamily: theme.fonts.regular.fontFamily,
      color: theme.colors.error ?? '#ef4444',
    },
    existingBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 12,
      padding: 12,
      backgroundColor: theme.colors.primary + '15',
      borderRadius: 8,
      gap: 8,
    },
    existingText: {
      fontSize: 14,
      fontFamily: theme.fonts.regular.fontFamily,
      color: theme.colors.primary,
    },
    actions: {
      flexDirection: 'row',
      marginTop: 24,
      gap: 12,
    },
    cancelButton: {
      flex: 1,
      paddingVertical: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surface3,
      borderRadius: 12,
    },
    cancelButtonText: {
      fontSize: 16,
      fontFamily: theme.fonts.medium.fontFamily,
      fontWeight: theme.fonts.medium.fontWeight,
      color: theme.colors.textMain,
    },
    createButton: {
      flex: 1,
      flexDirection: 'row',
      paddingVertical: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.primary,
      borderRadius: 12,
      gap: 8,
    },
    createButtonDisabled: {
      opacity: 0.5,
    },
    createButtonText: {
      fontSize: 16,
      fontFamily: theme.fonts.medium.fontFamily,
      fontWeight: theme.fonts.medium.fontWeight,
      color: '#fff',
    },
  });
