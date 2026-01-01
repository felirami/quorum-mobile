import React from 'react';
import { Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { IconSymbol } from '@/components/ui/IconSymbol';
import type { DisplayChannel } from './types';

interface ChannelsSidebarProps {
  serverName: string;
  channels: DisplayChannel[];
  selectedChannel: string | undefined;
  onSelectChannel: (id: string) => void;
  onOpenSettings?: () => void;
  theme: any;
}

export function ChannelsSidebar({
  serverName,
  channels,
  selectedChannel,
  onSelectChannel,
  onOpenSettings,
  theme,
}: ChannelsSidebarProps) {
  const styles = createStyles(theme);

  return (
    <View style={styles.container}>
      <ScrollView>
        {/* Top Navigation Bar */}
        <View style={styles.topNav}>
          <View style={styles.topNavLeft}>
            <Text style={styles.serverTitle}>{serverName}</Text>
          </View>
          <View style={styles.topNavRight}>
            <TouchableOpacity style={styles.iconButton} onPress={onOpenSettings}>
              <IconSymbol name="gearshape" color={theme.colors.textMain} size={20} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.channelSection}>
          <Text style={styles.channelSectionTitle}>TEXT CHANNELS</Text>
          {channels.map((channel) => (
            <TouchableOpacity
              key={channel.id}
              style={[
                styles.channelItem,
                selectedChannel === channel.id && styles.channelItemActive
              ]}
              onPress={() => onSelectChannel(channel.id)}
            >
              <IconSymbol
                name="number"
                color={channel.unread ? theme.colors.accent : theme.colors.textMuted}
                size={16}
              />
              <Text style={[
                styles.channelName,
                channel.unread && styles.channelNameUnread
              ]}>
                {channel.name}
              </Text>
              {channel.unread && <View style={styles.channelUnreadDot} />}
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.channelSection}>
          <Text style={styles.channelSectionTitle}>VOICE CHANNELS</Text>
          <TouchableOpacity style={styles.channelItem}>
            <IconSymbol name="mic.fill" color={theme.colors.textMuted} size={16} />
            <Text style={styles.channelName}>General</Text>
            <View style={styles.voiceChannelUsers}>
              <Text style={styles.voiceUserCount}></Text>
            </View>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const createStyles = (theme: any) => StyleSheet.create({
  container: {
    width: 240,
    backgroundColor: theme.colors.surface2,
    borderTopLeftRadius: 16,
  },
  topNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  topNavLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  topNavRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  serverTitle: {
    color: theme.colors.textMain,
    fontSize: 14,
    fontFamily: theme.fonts.bold.fontFamily,
    fontWeight: theme.fonts.bold.fontWeight,
  },
  iconButton: {},
  channelSection: {
    padding: 16,
  },
  channelSectionTitle: {
    color: theme.colors.textMuted,
    fontSize: 12,
    letterSpacing: 0.5,
    marginBottom: 8,
    fontFamily: theme.fonts.bold.fontFamily,
    fontWeight: theme.fonts.bold.fontWeight,
  },
  channelItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
    marginVertical: 1,
  },
  channelItemActive: {
    backgroundColor: theme.colors.surface4,
  },
  channelName: {
    marginLeft: 8,
    color: theme.colors.textSubtle,
    fontSize: 14,
    fontFamily: theme.fonts.regular.fontFamily,
  },
  channelNameUnread: {
    color: theme.colors.accentLight,
    fontFamily: theme.fonts.medium.fontFamily,
    fontWeight: theme.fonts.medium.fontWeight,
  },
  channelUnreadDot: {
    marginLeft: 'auto',
    width: 8,
    height: 8,
    backgroundColor: theme.colors.accent,
    borderRadius: 4,
  },
  voiceChannelUsers: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
  },
  voiceUserCount: {
    color: theme.colors.textMuted,
    fontSize: 12,
  },
});

export default ChannelsSidebar;
