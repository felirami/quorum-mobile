import { BaseModal } from '@/components/shared';
import { IconSymbol } from '@/components/ui/IconSymbol';
import { DefaultAvatar } from '@/components/ui/DefaultAvatar';
import { useTheme } from '@/theme';
import React from 'react';
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export interface UserProfileInfo {
  userId: string;
  userName: string;
  userAvatar?: string;
  bio?: string;
}

interface UserProfileModalProps {
  visible: boolean;
  onClose: () => void;
  user: UserProfileInfo | null;
  onStartDM?: (userId: string) => void;
}

export default function UserProfileModal({
  visible,
  onClose,
  user,
  onStartDM,
}: UserProfileModalProps) {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  const styles = createStyles(theme, isDark, insets);

  // Format address for display (truncate middle)
  const formatAddress = (address: string) => {
    if (!address) return '';
    if (address.length <= 16) return address;
    return `${address.slice(0, 8)}...${address.slice(-6)}`;
  };

  // Check if avatar is a valid data URI
  const hasValidAvatar = user?.userAvatar?.startsWith('data:');

  if (!user) return null;

  return (
    <BaseModal
      visible={visible}
      onClose={onClose}
      height={0.5}
    >
      <ScrollView showsVerticalScrollIndicator={false} style={styles.scrollContent}>
        {/* Profile Header */}
        <View style={styles.profileHeader}>
          <View style={styles.avatarContainer}>
            {hasValidAvatar ? (
              <Image source={{ uri: user.userAvatar }} style={styles.avatar} />
            ) : (
              <DefaultAvatar address={user.userId} size={100} style={styles.avatar} />
            )}
          </View>
          <Text style={styles.displayName}>{user.userName}</Text>
          <Text style={styles.userId}>{formatAddress(user.userId)}</Text>
        </View>

        {/* Bio Section */}
        {user.bio && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Bio</Text>
            <View style={styles.bioContainer}>
              <Text style={styles.bioText}>{user.bio}</Text>
            </View>
          </View>
        )}

        {/* Actions */}
        <View style={styles.actionsContainer}>
          {onStartDM && (
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => {
                onStartDM(user.userId);
                onClose();
              }}
            >
              <IconSymbol name="bubble.left.fill" size={20} color="#fff" />
              <Text style={styles.actionButtonText}>Message</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </BaseModal>
  );
}

const createStyles = (theme: any, isDark: boolean, insets: any) =>
  StyleSheet.create({
    scrollContent: {
      paddingHorizontal: 20,
      paddingTop: 8,
    },
    profileHeader: {
      alignItems: 'center',
      marginBottom: 24,
    },
    avatarContainer: {
      marginBottom: 16,
    },
    avatar: {
      width: 100,
      height: 100,
      borderRadius: 50,
    },
    displayName: {
      fontSize: 24,
      fontFamily: theme.fonts.bold.fontFamily,
      fontWeight: theme.fonts.bold.fontWeight,
      color: theme.colors.textMain,
      marginBottom: 4,
      textAlign: 'center',
    },
    userId: {
      fontSize: 14,
      color: theme.colors.textMuted,
      textAlign: 'center',
    },
    section: {
      marginBottom: 24,
    },
    sectionTitle: {
      fontSize: 16,
      fontFamily: theme.fonts.bold.fontFamily,
      fontWeight: theme.fonts.bold.fontWeight,
      color: theme.colors.textMain,
      marginBottom: 12,
    },
    bioContainer: {
      backgroundColor: theme.colors.surface2,
      padding: 12,
      borderRadius: 8,
    },
    bioText: {
      fontSize: 14,
      color: theme.colors.textMain,
      lineHeight: 20,
    },
    actionsContainer: {
      marginBottom: 24,
    },
    actionButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.primary,
      paddingVertical: 14,
      paddingHorizontal: 24,
      borderRadius: 12,
      gap: 8,
    },
    actionButtonText: {
      fontSize: 16,
      color: '#fff',
      fontFamily: theme.fonts.medium.fontFamily,
      fontWeight: theme.fonts.medium.fontWeight,
    },
  });
