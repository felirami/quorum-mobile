/**
 * DirectMessagesList - Shows list of DM conversations
 * Displays both E2EE (Quorum) and Farcaster direct cast conversations
 */

import React, { useCallback } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { FlatList } from 'react-native-gesture-handler';
import { IconSymbol } from '@/components/ui/IconSymbol';
import { DefaultAvatar } from '@/components/ui/DefaultAvatar';
import type { Conversation } from '@/hooks/chat/useConversations';

// Farcaster logo for non-E2EE indicator
const FarcasterLogo = require('@/assets/images/farcaster.png');

interface DirectMessagesListProps {
  conversations: Conversation[];
  selectedConversation?: string;
  onSelectConversation: (id: string) => void;
  onNewConversation?: () => void;
  isLoading?: boolean;
  isRefreshing?: boolean;
  error?: Error | null;
  onRefresh?: () => void;
  theme: any;
  currentUserAddress?: string;
}

// Check if icon is a valid data URI (not a local path or remote URL)
function isValidAvatarUri(icon: string | undefined): boolean {
  if (!icon) return false;
  return icon.startsWith('data:');
}

// Format timestamp to relative time
function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  if (hours < 24) return `${hours}h`;
  if (days < 7) return `${days}d`;
  return new Date(timestamp).toLocaleDateString();
}

export function DirectMessagesList({
  conversations,
  selectedConversation,
  onSelectConversation,
  onNewConversation,
  isLoading = false,
  isRefreshing = false,
  error = null,
  onRefresh,
  theme,
}: DirectMessagesListProps) {
  const styles = createStyles(theme);

  const renderItem = useCallback(
    ({ item }: { item: Conversation }) => {
      const isSelected = selectedConversation === item.conversationId;
      // Check if there are unread messages by comparing timestamps
      const hasUnread = item.lastReadTimestamp ? item.timestamp > item.lastReadTimestamp : false;

      // Format display name - use displayName, or format address appropriately
      let displayName = item.displayName;
      if (!displayName && item.address) {
        if (item.address.startsWith('@')) {
          displayName = item.address;
        } else if (item.address.length > 12) {
          displayName = `${item.address.slice(0, 8)}...${item.address.slice(-4)}`;
        } else {
          displayName = item.address;
        }
      }
      displayName = displayName || 'Unknown';

      // Check if this is a Farcaster conversation (not E2EE)
      const isFarcaster = item.source === 'farcaster';

      // For Farcaster, use HTTP URL directly; for others check data URI
      const hasValidIcon = isFarcaster
        ? !!item.icon && item.icon.startsWith('http')
        : isValidAvatarUri(item.icon);

      return (
        <TouchableOpacity
          style={[
            styles.conversationItem,
            isSelected && styles.conversationItemSelected,
          ]}
          onPress={() => onSelectConversation(item.conversationId)}
          activeOpacity={0.7}
        >
          <View style={styles.avatarContainer}>
            {hasValidIcon ? (
              <Image source={{ uri: item.icon }} style={styles.avatar} />
            ) : (
              <DefaultAvatar address={item.address || ''} size={48} />
            )}
            {hasUnread && <View style={styles.unreadBadge} />}
            {/* Farcaster indicator badge - shows this is NOT E2EE */}
            {isFarcaster && (
              <View style={styles.farcasterBadge}>
                <Image source={FarcasterLogo} style={styles.farcasterIcon} />
              </View>
            )}
          </View>

          <View style={styles.conversationContent}>
            <View style={styles.conversationHeader}>
              <Text
                style={[styles.userName, hasUnread && styles.userNameUnread]}
                numberOfLines={1}
              >
                {displayName}
              </Text>
              <Text style={styles.timestamp}>
                {formatRelativeTime(item.timestamp)}
              </Text>
            </View>
          </View>
        </TouchableOpacity>
      );
    },
    [styles, selectedConversation, onSelectConversation]
  );

  // Loading state
  if (isLoading && conversations.length === 0) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>Loading conversations...</Text>
      </View>
    );
  }

  // Error state
  if (error && conversations.length === 0) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <IconSymbol name="exclamationmark.circle" size={48} color={theme.colors.textMuted} />
        <Text style={styles.errorText}>Failed to load conversations</Text>
        <Text style={styles.errorDetail}>{error.message}</Text>
      </View>
    );
  }

  // Empty state
  if (!isLoading && conversations.length === 0) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <IconSymbol name="bubble.left.and.bubble.right" size={48} color={theme.colors.textMuted} />
        <Text style={styles.emptyTitle}>No conversations yet</Text>
        <Text style={styles.emptySubtext}>
          Start a conversation to connect with others
        </Text>
        {onNewConversation && (
          <TouchableOpacity style={styles.newConversationButton} onPress={onNewConversation}>
            <IconSymbol name="plus" size={16} color="#fff" />
            <Text style={styles.newConversationButtonText}>New Conversation</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Messages</Text>
        {onNewConversation && (
          <TouchableOpacity style={styles.newButton} onPress={onNewConversation}>
            <IconSymbol name="square.and.pencil" size={20} color={theme.colors.primary} />
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={conversations}
        keyExtractor={(item) => item.conversationId}
        renderItem={renderItem}
        style={styles.list}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={onRefresh}
              tintColor={theme.colors.primary}
              colors={[theme.colors.primary]}
            />
          ) : undefined
        }
      />
    </View>
  );
}

const createStyles = (theme: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.surface1,
    },
    centerContent: {
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 32,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.surface3,
    },
    headerTitle: {
      fontSize: 20,
      fontFamily: theme.fonts.bold.fontFamily,
      fontWeight: theme.fonts.bold.fontWeight,
      color: theme.colors.textStrong,
    },
    newButton: {
      padding: 8,
    },
    list: {
      flex: 1,
    },
    conversationItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.surface3,
    },
    conversationItemSelected: {
      backgroundColor: theme.colors.primary + '15',
    },
    avatarContainer: {
      position: 'relative',
      marginRight: 12,
    },
    avatar: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: theme.colors.surface3,
    },
    unreadBadge: {
      position: 'absolute',
      top: 0,
      right: 0,
      width: 12,
      height: 12,
      borderRadius: 6,
      backgroundColor: theme.colors.primary,
      borderWidth: 2,
      borderColor: theme.colors.surface1,
    },
    farcasterBadge: {
      position: 'absolute',
      bottom: -2,
      right: -2,
      width: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: '#8B5CF6', // Farcaster purple
      borderWidth: 2,
      borderColor: theme.colors.surface1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    farcasterIcon: {
      width: 10,
      height: 10,
      tintColor: '#fff',
    },
    conversationContent: {
      flex: 1,
    },
    conversationHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 4,
    },
    userName: {
      fontSize: 16,
      fontFamily: theme.fonts.medium.fontFamily,
      fontWeight: theme.fonts.medium.fontWeight,
      color: theme.colors.textStrong,
      flex: 1,
    },
    userNameUnread: {
      fontFamily: theme.fonts.bold.fontFamily,
      fontWeight: theme.fonts.bold.fontWeight,
    },
    timestamp: {
      fontSize: 12,
      fontFamily: theme.fonts.regular.fontFamily,
      color: theme.colors.textMuted,
      marginLeft: 8,
    },
    messagePreview: {
      fontSize: 14,
      fontFamily: theme.fonts.regular.fontFamily,
      color: theme.colors.textMuted,
    },
    messagePreviewUnread: {
      color: theme.colors.textMain,
    },
    loadingText: {
      marginTop: 12,
      fontSize: 14,
      fontFamily: theme.fonts.regular.fontFamily,
      color: theme.colors.textMuted,
    },
    errorText: {
      marginTop: 16,
      fontSize: 16,
      fontFamily: theme.fonts.medium.fontFamily,
      fontWeight: theme.fonts.medium.fontWeight,
      color: theme.colors.textMain,
      textAlign: 'center',
    },
    errorDetail: {
      marginTop: 8,
      fontSize: 14,
      fontFamily: theme.fonts.regular.fontFamily,
      color: theme.colors.textMuted,
      textAlign: 'center',
    },
    emptyTitle: {
      marginTop: 16,
      fontSize: 18,
      fontFamily: theme.fonts.medium.fontFamily,
      fontWeight: theme.fonts.medium.fontWeight,
      color: theme.colors.textMain,
      textAlign: 'center',
    },
    emptySubtext: {
      marginTop: 8,
      fontSize: 14,
      fontFamily: theme.fonts.regular.fontFamily,
      color: theme.colors.textMuted,
      textAlign: 'center',
    },
    newConversationButton: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 24,
      paddingHorizontal: 20,
      paddingVertical: 12,
      backgroundColor: theme.colors.primary,
      borderRadius: 24,
      gap: 8,
    },
    newConversationButtonText: {
      fontSize: 14,
      fontFamily: theme.fonts.medium.fontFamily,
      fontWeight: theme.fonts.medium.fontWeight,
      color: '#fff',
    },
  });

export default DirectMessagesList;
