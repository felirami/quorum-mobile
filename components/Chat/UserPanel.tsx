import { IconSymbol } from '@/components/ui/IconSymbol';
import { useOTAUpdate } from '@/hooks/useOTAUpdate';
import * as Clipboard from 'expo-clipboard';
import React from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface UserPanelProps {
  userName: string;
  userId: string;
  userAvatar: any;
  socialFeedVisible: boolean;
  onToggleSocialFeed: () => void;
  onOpenMiniApps: () => void;
  onOpenWallet: () => void;
  onOpenProfile: () => void;
  theme: any;
  bottomInset: number;
}

export function UserPanel({
  userName,
  userId,
  userAvatar,
  socialFeedVisible,
  onToggleSocialFeed,
  onOpenMiniApps,
  onOpenWallet,
  onOpenProfile,
  theme,
  bottomInset,
}: UserPanelProps) {
  const styles = createStyles(theme, bottomInset);
  const { isUpdateAvailable, isDownloading, downloadAndInstall } = useOTAUpdate();

  return (
    <View style={styles.container}>
      <View style={styles.left} onTouchEnd={async ()=>await Clipboard.setStringAsync(userId)}>
        <View style={styles.avatarContainer}>
          <Image source={userAvatar} style={styles.avatar} />
          <View style={[styles.statusDot, styles.currentUserStatus]} />
        </View>
        <View style={styles.userInfo}>
          <Text style={styles.userName}>{userName}</Text>
          <Text style={styles.userId}>#{userId.slice(-6)}</Text>
        </View>
      </View>
      <View style={styles.actions}>
        {isUpdateAvailable && (
          <TouchableOpacity
            style={styles.updateButton}
            onPress={downloadAndInstall}
            disabled={isDownloading}
            hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
          >
            {isDownloading ? (
              <ActivityIndicator size="small" color={theme.colors.primary} />
            ) : (
              <IconSymbol name="sparkles" color={theme.colors.primary} size={18} />
            )}
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={styles.feedPanelButton}
          onPress={onToggleSocialFeed}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <IconSymbol
            name="waveform.path.ecg"
            color={socialFeedVisible ? theme.colors.textStrong : theme.colors.textMuted}
            size={16}
          />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.panelIconButton}
          onPress={onOpenMiniApps}
          hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
        >
          <IconSymbol name="square.grid.2x2" color={theme.colors.textMuted} size={20} />
        </TouchableOpacity>
        {/* <TouchableOpacity
          style={styles.panelIconButton}
          onPress={onOpenWallet}
          hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
        >
          <IconSymbol name="banknote.fill" color={theme.colors.textMuted} size={18} />
        </TouchableOpacity> */}
        <TouchableOpacity
          style={styles.panelIconButton}
          onPress={onOpenProfile}
          hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
        >
          <IconSymbol name="gearshape.fill" color={theme.colors.textMuted} size={18} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const createStyles = (theme: any, bottomInset: number) => StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.surface2,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: Math.max(8, bottomInset),
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarContainer: {
    position: 'relative',
  },
  avatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  statusDot: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: theme.colors.surface2,
  },
  currentUserStatus: {
    backgroundColor: theme.colors.primary,
  },
  userInfo: {
    marginLeft: 8,
  },
  userName: {
    color: theme.colors.textMain,
    fontSize: 14,
    fontFamily: theme.fonts.medium.fontFamily,
    fontWeight: theme.fonts.medium.fontWeight,
  },
  userId: {
    color: theme.colors.primary,
    fontSize: 12,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  feedPanelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface2,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  panelIconButton: {
    marginHorizontal: 8,
  },
  updateButton: {
    marginRight: 8,
  },
});

export default UserPanel;
