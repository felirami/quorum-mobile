/**
 * KickUserModal - Modal for kicking a user from a space
 *
 * Features:
 * - Two-step confirmation to prevent accidental kicks
 * - Shows user avatar and truncated address
 * - 5-second timeout between confirmation steps
 * - Minimum 3-second overlay display during operation
 * - Modal locked during operation (can't close)
 */

import { truncateAddress } from '@/utils/formatAddress';
import React, { useEffect, useCallback, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Image,
} from 'react-native';
import { BaseModal } from '@/components/shared/BaseModal';
import { DefaultAvatar } from '@/components/ui/DefaultAvatar';
import { useTheme, type AppTheme } from '@/theme';
import { useUserKicking } from '@/hooks/chat/useUserKicking';

interface KickUserModalProps {
  visible: boolean;
  onClose: () => void;
  spaceId: string;
  userName: string;
  userIcon?: string;
  userAddress: string;
}

export function KickUserModal({
  visible,
  onClose,
  spaceId,
  userName,
  userIcon,
  userAddress,
}: KickUserModalProps) {
  const { theme } = useTheme();
  const [isSaving, setIsSaving] = useState(false);

  const {
    kicking,
    confirmationStep,
    handleKickClick,
    kickUserFromSpace,
    resetConfirmation,
  } = useUserKicking({ spaceId });

  // Reset confirmation when modal closes
  useEffect(() => {
    if (!visible) {
      resetConfirmation();
      setIsSaving(false);
    }
  }, [visible, resetConfirmation]);

  const handleKickWithOverlay = useCallback(async () => {
    if (confirmationStep === 0) {
      // First click - just advance to confirmation step
      handleKickClick(userAddress, () => {});
    } else {
      // Second click - execute kick with overlay
      if (!userAddress) return;

      setIsSaving(true);

      // Ensure minimum 3 second overlay display time
      const startTime = Date.now();
      const minDisplayTime = 3000;

      try {
        await kickUserFromSpace(userAddress);

        // If operation completed too quickly, wait for minimum display time
        const elapsed = Date.now() - startTime;
        if (elapsed < minDisplayTime) {
          await new Promise(resolve => setTimeout(resolve, minDisplayTime - elapsed));
        }

        onClose();
      } catch (error) {
        setIsSaving(false);
      }
    }
  }, [confirmationStep, handleKickClick, kickUserFromSpace, userAddress, onClose]);

  const styles = createStyles(theme);

  return (
    <BaseModal
      visible={visible}
      onClose={isSaving ? () => {} : onClose}
      height={0.35}
      testID="kick-user-modal"
    >
      <View style={styles.container}>
        {/* Saving overlay */}
        {isSaving && (
          <View style={styles.overlay}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
            <Text style={styles.overlayText}>Kicking...</Text>
          </View>
        )}

        {/* Title */}
        <Text style={styles.title}>Kick User</Text>

        {/* User info */}
        <View style={styles.userRow}>
          {userIcon ? (
            <Image source={{ uri: userIcon }} style={styles.avatar} />
          ) : (
            <DefaultAvatar address={userAddress} size={40} />
          )}
          <View style={styles.userInfo}>
            <Text style={styles.userName} numberOfLines={1}>
              {userName}
            </Text>
            <Text style={styles.userAddress}>
              {truncateAddress(userAddress)}
            </Text>
          </View>
        </View>

        {/* Description */}
        <Text style={styles.description}>
          This user will be removed from the Space.
        </Text>

        {/* Buttons */}
        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={[styles.button, styles.cancelButton]}
            onPress={onClose}
            disabled={isSaving}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.button,
              styles.kickButton,
              (isSaving || kicking) && styles.buttonDisabled,
            ]}
            onPress={handleKickWithOverlay}
            disabled={isSaving || kicking}
          >
            <Text style={styles.kickButtonText}>
              {confirmationStep === 0 ? 'Kick' : 'Click again to confirm'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </BaseModal>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      padding: 20,
    },
    overlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 10,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
    },
    overlayText: {
      color: '#fff',
      fontSize: 16,
      marginTop: 12,
      fontFamily: theme.fonts.medium.fontFamily,
    },
    title: {
      fontSize: 20,
      color: theme.colors.textMain,
      fontFamily: theme.fonts.bold.fontFamily,
      fontWeight: theme.fonts.bold.fontWeight,
      marginBottom: 20,
      textAlign: 'center',
    },
    userRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.colors.surface3,
      borderRadius: 12,
      padding: 12,
      marginBottom: 16,
    },
    avatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      marginRight: 12,
    },
    userInfo: {
      flex: 1,
      minWidth: 0,
    },
    userName: {
      fontSize: 16,
      color: theme.colors.textMain,
      fontFamily: theme.fonts.bold.fontFamily,
      fontWeight: theme.fonts.bold.fontWeight,
    },
    userAddress: {
      fontSize: 13,
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.regular.fontFamily,
      marginTop: 2,
    },
    description: {
      fontSize: 14,
      color: theme.colors.textSubtle,
      fontFamily: theme.fonts.regular.fontFamily,
      textAlign: 'center',
      marginBottom: 24,
    },
    buttonRow: {
      flexDirection: 'row',
      gap: 12,
    },
    button: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cancelButton: {
      backgroundColor: theme.colors.surface4,
    },
    cancelButtonText: {
      color: theme.colors.textMain,
      fontSize: 16,
      fontFamily: theme.fonts.medium.fontFamily,
    },
    kickButton: {
      backgroundColor: theme.colors.danger ?? '#ef4444',
    },
    kickButtonText: {
      color: '#fff',
      fontSize: 16,
      fontFamily: theme.fonts.medium.fontFamily,
    },
    buttonDisabled: {
      opacity: 0.5,
    },
  });

export default KickUserModal;
