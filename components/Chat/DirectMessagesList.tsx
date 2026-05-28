/**
 * DirectMessagesList - Shows list of DM conversations
 * Displays both E2EE (Quorum) and Farcaster direct cast conversations
 */

import type { AppTheme } from '@/theme';
import { DefaultAvatar } from '@/components/ui/DefaultAvatar';
import { IconSymbol } from '@/components/ui/IconSymbol';
import type { Conversation } from '@/hooks/chat';
import React, { useCallback, useMemo } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { FlashList } from '@shopify/flash-list';

// Farcaster logo for non-E2EE indicator
const FarcasterLogo = require('@/assets/images/farcaster.png');

type DMFilter = 'all' | 'favorites' | 'unknown' | 'muted';

interface DirectMessagesListProps {
  conversations: Conversation[];
  selectedConversation?: string;
  onSelectConversation: (id: string) => void;
  onNewConversation?: () => void;
  isLoading?: boolean;
  isRefreshing?: boolean;
  isFetchingNextPage?: boolean;
  hasNextPage?: boolean;
  error?: Error | null;
  onRefresh?: () => void;
  onEndReached?: () => void;
  onMarkAllRead?: () => void;
  theme: AppTheme;
  currentUserAddress?: string;
  isFavorite?: (conversationId: string) => boolean;
  isMuted?: (conversationId: string) => boolean;
  onToggleFavorite?: (conversationId: string) => void;
  onToggleMute?: (conversationId: string) => void;
}

// Check if icon is a valid data URI (not a local path or remote URL)
function isValidAvatarUri(icon: string | undefined): boolean {
  if (!icon) return false;
  return icon.startsWith('data:');
}

// Format timestamp for conversation list (Discord-style)
function formatRelativeTime(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const timeStr = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  // Check if same day - show time only
  if (date.toDateString() === now.toDateString()) {
    return timeStr;
  }

  // Check if yesterday
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return `Yesterday at ${timeStr}`;
  }

  // Older - show date and time
  return `${date.toLocaleDateString()} ${timeStr}`;
}

// Truncate sender name for preview
function truncateName(name: string, maxLength: number = 8): string {
  if (name.length <= maxLength) return name;
  return `${name.slice(0, maxLength)}…`;
}

// Extracted conversation item for React.memo optimization
interface DMConversationItemProps {
  item: Conversation;
  isSelected: boolean;
  styles: ReturnType<typeof createStyles>;
  theme: AppTheme;
  isFavorite: boolean;
  isMuted: boolean;
  onSelect: (id: string) => void;
  onToggleFavorite?: (id: string) => void;
  onToggleMute?: (id: string) => void;
}

const DMConversationItem = React.memo(function DMConversationItem({
  item,
  isSelected,
  styles,
  theme,
  isFavorite: favorite,
  isMuted: muted,
  onSelect,
  onToggleFavorite,
  onToggleMute,
}: DMConversationItemProps) {
  const hasUnread = item.lastReadTimestamp ? item.timestamp > item.lastReadTimestamp : false;

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

  const isFarcaster = item.source === 'farcaster';

  const hasValidIcon = isFarcaster
    ? !!item.icon && item.icon.startsWith('http')
    : isValidAvatarUri(item.icon);

  const handleLongPress = useCallback(() => {
    if (isFarcaster) return;
    const actions: { text: string; onPress: () => void; style?: 'cancel' | 'destructive' }[] = [];
    if (onToggleFavorite) {
      actions.push({
        text: favorite ? 'Remove from Favorites' : 'Add to Favorites',
        onPress: () => onToggleFavorite(item.conversationId),
      });
    }
    if (onToggleMute) {
      actions.push({
        text: muted ? 'Unmute' : 'Mute',
        onPress: () => onToggleMute(item.conversationId),
      });
    }
    actions.push({ text: 'Cancel', onPress: () => {}, style: 'cancel' });
    Alert.alert(displayName, undefined, actions);
  }, [isFarcaster, favorite, muted, onToggleFavorite, onToggleMute, item.conversationId, displayName]);

  const handlePress = useCallback(() => {
    onSelect(item.conversationId);
  }, [onSelect, item.conversationId]);

  return (
    <TouchableOpacity
      style={[
        styles.conversationItem,
        isSelected && styles.conversationItemSelected,
      ]}
      onPress={handlePress}
      onLongPress={handleLongPress}
      activeOpacity={0.7}
    >
      <View style={styles.avatarContainer}>
        {hasValidIcon ? (
          <Image source={{ uri: item.icon }} style={styles.avatar} />
        ) : (
          <DefaultAvatar address={item.address || ''} size={48} />
        )}
        {hasUnread && <View style={styles.unreadBadge} />}
        {isFarcaster && (
          <View style={styles.farcasterBadge}>
            <Image source={FarcasterLogo} style={styles.farcasterIcon} />
          </View>
        )}
      </View>

      <View style={styles.conversationContent}>
        <View style={styles.conversationHeader}>
          {favorite && (
            <IconSymbol name="star.fill" size={12} color="#f59e0b" style={{ marginRight: 4 }} />
          )}
          <Text
            style={[styles.userName, hasUnread && !muted && styles.userNameUnread]}
            numberOfLines={1}
          >
            {displayName}
          </Text>
          {muted && (
            <IconSymbol name="bell.slash.fill" size={12} color={theme.colors.textMuted} style={{ marginLeft: 4 }} />
          )}
          <Text style={styles.timestamp}>
            {formatRelativeTime(item.timestamp)}
          </Text>
        </View>
        {item.lastMessagePreview && (
          <Text
            style={[styles.messagePreview, hasUnread && styles.messagePreviewUnread]}
            numberOfLines={1}
          >
            {item.lastMessageSenderName ? (
              <Text style={styles.previewSender}>
                {truncateName(item.lastMessageSenderName)}:{' '}
              </Text>
            ) : null}
            {(() => {
              const preview = item.lastMessagePreview;
              if (typeof preview === 'string') {
                return preview;
              }
              if (typeof preview === 'object' && preview !== null) {
                const obj = preview as any;
                if (obj.type === 'embed') return '📷 Image';
                if (obj.type === 'sticker') return '🎨 Sticker';
                const text = obj.text;
                if (Array.isArray(text)) return text.join('');
                return text || '';
              }
              return '';
            })()}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
});

export function DirectMessagesList({
  conversations,
  selectedConversation,
  onSelectConversation,
  onNewConversation,
  isLoading = false,
  isRefreshing = false,
  isFetchingNextPage = false,
  hasNextPage = false,
  error = null,
  onRefresh,
  onEndReached,
  onMarkAllRead,
  theme,
  isFavorite,
  isMuted,
  onToggleFavorite,
  onToggleMute,
}: DirectMessagesListProps) {
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [activeFilter, setActiveFilter] = React.useState<DMFilter>('all');

  // Sort and filter conversations
  const filteredConversations = useMemo(() => {
    let filtered = conversations;

    // Apply filter
    switch (activeFilter) {
      case 'favorites':
        filtered = conversations.filter(c => isFavorite?.(c.conversationId));
        break;
      case 'muted':
        filtered = conversations.filter(c => isMuted?.(c.conversationId));
        break;
      case 'unknown':
        // Unknown = no display name and not favorited
        filtered = conversations.filter(c => !c.displayName && !isFavorite?.(c.conversationId));
        break;
    }

    // Sort: favorites first, then by timestamp
    return [...filtered].sort((a, b) => {
      const aFav = isFavorite?.(a.conversationId) ? 1 : 0;
      const bFav = isFavorite?.(b.conversationId) ? 1 : 0;
      if (aFav !== bFav) return bFav - aFav;
      return b.timestamp - a.timestamp;
    });
  }, [conversations, activeFilter, isFavorite, isMuted]);

  const renderItem = useCallback(
    ({ item }: { item: Conversation }) => {
      return (
        <DMConversationItem
          item={item}
          isSelected={selectedConversation === item.conversationId}
          styles={styles}
          theme={theme}
          isFavorite={isFavorite?.(item.conversationId) ?? false}
          isMuted={isMuted?.(item.conversationId) ?? false}
          onSelect={onSelectConversation}
          onToggleFavorite={onToggleFavorite}
          onToggleMute={onToggleMute}
        />
      );
    },
    [styles, selectedConversation, onSelectConversation, theme, isFavorite, isMuted, onToggleFavorite, onToggleMute]
  );

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
        <View style={styles.headerActions}>
          {onNewConversation && (
            <TouchableOpacity style={styles.newButton} onPress={onNewConversation}>
              <IconSymbol name="square.and.pencil" size={20} color={theme.colors.primary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Filter chips */}
      {(isFavorite || isMuted) && (
        <View style={styles.filterContainer}>
          {(['all', 'favorites', 'unknown', 'muted'] as DMFilter[]).map((filter) => (
            <TouchableOpacity
              key={filter}
              style={[
                styles.filterChip,
                activeFilter === filter && styles.filterChipActive,
              ]}
              onPress={() => setActiveFilter(filter)}
            >
              <Text
                style={[
                  styles.filterChipText,
                  activeFilter === filter && styles.filterChipTextActive,
                ]}
              >
                {filter === 'all' ? 'All' : filter === 'favorites' ? 'Favorites' : filter === 'unknown' ? 'Unknown' : 'Muted'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <FlashList
        data={filteredConversations}
        keyExtractor={(item) => item.conversationId}
        renderItem={renderItem}
        estimatedItemSize={73}
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
        onEndReached={hasNextPage && !isFetchingNextPage ? onEndReached : undefined}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          isFetchingNextPage ? (
            <View style={styles.loadingFooter}>
              <ActivityIndicator size="small" color={theme.colors.primary} />
            </View>
          ) : null
        }
      />
    </View>
  );
}

const createStyles = (theme: AppTheme) =>
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
    headerActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    headerActionButton: {
      padding: 8,
    },
    newButton: {
      padding: 8,
    },
    filterContainer: {
      flexDirection: 'row',
      paddingHorizontal: 12,
      paddingVertical: 8,
      gap: 8,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.surface3,
    },
    filterChip: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
      backgroundColor: theme.colors.surface3 ?? theme.colors.surface2,
    },
    filterChipActive: {
      backgroundColor: theme.colors.primary,
    },
    filterChipText: {
      fontSize: 13,
      fontFamily: theme.fonts.medium.fontFamily,
      fontWeight: theme.fonts.medium.fontWeight,
      color: theme.colors.textMuted,
    },
    filterChipTextActive: {
      color: '#fff',
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
    previewSender: {
      fontFamily: theme.fonts.medium.fontFamily,
      fontWeight: theme.fonts.medium.fontWeight,
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
    loadingFooter: {
      paddingVertical: 16,
      alignItems: 'center',
    },
  });

export default DirectMessagesList;
