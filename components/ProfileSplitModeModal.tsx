import { BaseModal } from '@/components/shared';
import { IconSymbol } from '@/components/ui/IconSymbol';
import { setProfileSplitMode } from '@/services/profile/profilePrefs';
import { useTheme, type AppTheme } from '@/theme';
import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface ProfileSplitModeModalProps {
  visible: boolean;
  onClose: () => void;
  /** Called after the user makes a choice (after the flag is persisted). */
  onDecision?: (split: boolean) => void;
}

export default function ProfileSplitModeModal({
  visible,
  onClose,
  onDecision,
}: ProfileSplitModeModalProps) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const choose = (split: boolean) => {
    setProfileSplitMode(split);
    onDecision?.(split);
    onClose();
  };

  return (
    <BaseModal visible={visible} onClose={onClose} height={0.6} showHandle>
      <View style={styles.container}>
        <Text style={styles.title}>Keep profiles separate?</Text>
        <Text style={styles.subtitle}>
          You can manage your Quorum and Farcaster profiles independently, or
          treat them as one. Fname and QNS usernames always stay in their own
          system.
        </Text>

        <TouchableOpacity style={styles.option} onPress={() => choose(true)} activeOpacity={0.7}>
          <View style={styles.optionIcon}>
            <IconSymbol name="rectangle.grid.2x2" size={22} color={theme.colors.accent} />
          </View>
          <View style={styles.optionTextWrap}>
            <Text style={styles.optionTitle}>Keep separate</Text>
            <Text style={styles.optionDesc}>
              Different display name, avatar, and bio per system. You pick which
              one you're editing each time.
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={styles.option} onPress={() => choose(false)} activeOpacity={0.7}>
          <View style={styles.optionIcon}>
            <IconSymbol name="link" size={22} color={theme.colors.accent} />
          </View>
          <View style={styles.optionTextWrap}>
            <Text style={styles.optionTitle}>Merge</Text>
            <Text style={styles.optionDesc}>
              Edit display name, avatar, and bio once — changes are applied to
              both Quorum and Farcaster.
            </Text>
          </View>
        </TouchableOpacity>

        <Text style={styles.footer}>You can change this any time in Settings.</Text>
      </View>
    </BaseModal>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    container: {
      paddingHorizontal: 20,
      paddingBottom: 24,
      gap: 16,
    },
    title: {
      fontSize: 22,
      fontWeight: '700',
      color: theme.colors.textStrong,
      textAlign: 'center',
      marginTop: 8,
    },
    subtitle: {
      fontSize: 14,
      color: theme.colors.textMuted,
      textAlign: 'center',
      lineHeight: 20,
    },
    option: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      padding: 14,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.colors.surface3,
      backgroundColor: theme.colors.surface1,
    },
    optionIcon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surface2,
    },
    optionTextWrap: {
      flex: 1,
      gap: 2,
    },
    optionTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: theme.colors.textStrong,
    },
    optionDesc: {
      fontSize: 13,
      color: theme.colors.textMuted,
      lineHeight: 18,
    },
    footer: {
      fontSize: 12,
      color: theme.colors.textMuted,
      textAlign: 'center',
      marginTop: 4,
    },
  });
}
