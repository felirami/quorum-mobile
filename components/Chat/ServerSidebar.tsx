import React from 'react';
import { Image, TouchableOpacity, View, StyleSheet, ImageSourcePropType, Text } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { IconSymbol } from '@/components/ui/IconSymbol';
import { DefaultAvatar } from '@/components/ui/DefaultAvatar';
import type { DisplayServer } from './types';

// Special ID for DMs view
export const DM_VIEW_ID = '__direct_messages__';

interface ServerSidebarProps {
  servers: DisplayServer[];
  selectedServer: string | undefined;
  onSelectServer: (id: string) => void;
  onSelectDMs: () => void;
  onAddSpace?: () => void;
  isDMsSelected: boolean;
  theme: any;
  isDark: boolean;
  topInset: number;
  unreadDMCount?: number;
}

// Get icon source from server - only accept data URIs
function getIconSource(server: DisplayServer): ImageSourcePropType | undefined {
  if (typeof server.icon === 'string') {
    // Only accept data URIs, not local paths or remote URLs
    if (server.icon.startsWith('data:')) {
      return { uri: server.icon };
    }
    return undefined;
  }
  return server.icon as ImageSourcePropType;
}

export function ServerSidebar({
  servers,
  selectedServer,
  onSelectServer,
  onSelectDMs,
  onAddSpace,
  isDMsSelected,
  theme,
  isDark,
  topInset,
  unreadDMCount = 0,
}: ServerSidebarProps) {
  const styles = createStyles(theme, isDark, topInset);

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* DMs / Home Button */}
        <View style={styles.serverIconContainer}>
          <TouchableOpacity
            style={[
              styles.serverIcon,
              styles.dmIcon,
              isDMsSelected && styles.serverIconActive,
            ]}
            onPress={onSelectDMs}
          >
            <IconSymbol
              name="bubble.left.and.bubble.right.fill"
              size={24}
              color={isDMsSelected ? '#fff' : theme.colors.textMain}
            />
            {unreadDMCount > 0 && (
              <View style={styles.dmBadge}>
                <Text style={styles.dmBadgeText}>
                  {unreadDMCount > 99 ? '99+' : unreadDMCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.serverDivider} />

        {servers.map((server) => {
          const iconSource = getIconSource(server);
          const isActive = selectedServer === server.id;
          return (
            <TouchableOpacity
              key={server.id}
              style={[
                styles.serverIcon,
                isActive && styles.serverIconActive
              ]}
              onPress={() => onSelectServer(server.id)}
            >
              {iconSource ? (
                <Image
                  source={iconSource}
                  style={[
                    styles.serverIconImage,
                    isActive && styles.serverIconImageActive
                  ]}
                />
              ) : (
                <DefaultAvatar
                  address={server.name}
                  size={48}
                  style={isActive && styles.serverIconImageActive}
                />
              )}
              {server.unread && <View style={styles.unreadIndicator} />}
            </TouchableOpacity>
          );
        })}

        <TouchableOpacity
          style={[styles.serverIcon, styles.addServerIcon]}
          onPress={onAddSpace}
        >
          <IconSymbol name="plus" color={theme.colors.textMain} size={24} />
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const createStyles = (theme: any, isDark: boolean, topInset: number) => StyleSheet.create({
  container: {
    width: 64,
    backgroundColor: isDark ? '#0a0a0b' : theme.colors.surface00,
    paddingTop: topInset,
  },
  serverIconContainer: {
    alignItems: 'center',
    marginBottom: 8,
  },
  serverIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: theme.colors.surface4,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 4,
    marginHorizontal: 8,
  },
  serverIconActive: {
    backgroundColor: theme.colors.primary,
    borderRadius: 16,
  },
  homeServerIcon: {
    backgroundColor: theme.colors.primary,
  },
  dmIcon: {
    backgroundColor: theme.colors.surface4,
  },
  dmBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: theme.colors.error ?? '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: isDark ? '#0a0a0b' : theme.colors.surface00,
  },
  dmBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  serverIconImage: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  serverIconImageActive: {
    borderRadius: 12,
  },
  unreadIndicator: {
    position: 'absolute',
    right: -2,
    top: 0,
    width: 12,
    height: 12,
    backgroundColor: 'white',
    borderRadius: 6,
  },
  serverDivider: {
    height: 2,
    backgroundColor: theme.colors.border,
    marginVertical: 8,
    marginHorizontal: 8,
  },
  addServerIcon: {
    backgroundColor: theme.colors.surface4,
  },
});

export default ServerSidebar;
