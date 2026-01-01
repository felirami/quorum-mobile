/**
 * DMChatHeader - Header for DM conversation chat view
 */

import { DefaultAvatar } from '@/components/ui/DefaultAvatar';
import { IconSymbol } from '@/components/ui/IconSymbol';
import type { Conversation } from '@/hooks/chat/useConversations';
import React, { useMemo } from 'react';
import { Dimensions, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface DMChatHeaderProps {
  conversation: Conversation;
  sidebarsVisible: boolean;
  onShowSidebars: () => void;
  theme: any;
}

export function DMChatHeader({
  conversation,
  sidebarsVisible,
  onShowSidebars,
  theme,
}: DMChatHeaderProps) {
  const styles = createStyles(theme);

  // Format display name
  const displayName = useMemo(() => {
    if (conversation.displayName) return conversation.displayName;
    const addr = conversation.address;
    if (!addr) return 'Unknown';
    if (addr.startsWith('@')) return addr;
    if (addr.length > 16) return `${addr.slice(0, 8)}...${addr.slice(-4)}`;
    return addr;
  }, [conversation.displayName, conversation.address]);

  return (
    <View style={styles.container}>
      <View style={styles.left}>
        {!sidebarsVisible && (
          <TouchableOpacity onPress={onShowSidebars} style={styles.menuButton}>
            <IconSymbol name="line.3.horizontal" color={theme.colors.textMuted} size={20} />
          </TouchableOpacity>
        )}
        {conversation.icon ? (
          <Image source={{ uri: conversation.icon }} style={styles.avatar} />
        ) : (
          <DefaultAvatar address={conversation.address || ''} size={32} />
        )}
        <Text style={styles.title} numberOfLines={1}>{displayName}</Text>
      </View>
      <View style={styles.right}>
        <TouchableOpacity style={styles.headerIconButton}>
          <IconSymbol name="info.circle" color={theme.colors.textMuted} size={18} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const createStyles = (theme: any) => StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.surface3,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    width: SCREEN_WIDTH,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  menuButton: {
    marginRight: 12,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.colors.surface5,
  },
  title: {
    color: theme.colors.textMain,
    fontFamily: theme.fonts.medium.fontFamily,
    fontWeight: theme.fonts.medium.fontWeight,
    marginLeft: 10,
    flex: 1,
  },
  headerIconButton: {
    marginLeft: 16,
  },
});

export default DMChatHeader;
