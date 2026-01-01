/**
 * InviteModal - Modal for generating and sharing space invite links
 *
 * Provides:
 * - Generate invite link button
 * - Copy to clipboard
 * - Share via system share sheet
 */

import { logger } from '@quilibrium/quorum-shared';
import { BaseModal } from '@/components/shared';
import { IconSymbol } from '@/components/ui/IconSymbol';
import {
  useCopyInviteLink,
  useGenerateInvite,
  useShareInvite,
} from '@/hooks/chat/useInviteManagement';
import { useTheme } from '@/theme';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface InviteModalProps {
  visible: boolean;
  onClose: () => void;
  spaceId: string;
  spaceName: string;
}

export default function InviteModal({
  visible,
  onClose,
  spaceId,
  spaceName,
}: InviteModalProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = createStyles(theme, insets);

  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const generateInviteMutation = useGenerateInvite();
  const copyLinkMutation = useCopyInviteLink();
  const shareInviteMutation = useShareInvite();

  const handleGenerateInvite = useCallback(async () => {
    try {
      const result = await generateInviteMutation.mutateAsync({ spaceId });
      setInviteLink(result.inviteLink);
    } catch (error) {
      logger.log('[InviteModal] Failed to generate invite:', error);
    }
  }, [spaceId, generateInviteMutation]);

  const handleCopyLink = useCallback(async () => {
    if (!inviteLink) return;

    try {
      await copyLinkMutation.mutateAsync(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      logger.log('[InviteModal] Failed to copy link:', error);
    }
  }, [inviteLink, copyLinkMutation]);

  const handleShare = useCallback(async () => {
    if (!inviteLink) return;

    try {
      await shareInviteMutation.mutateAsync({
        inviteLink,
        spaceName,
      });
    } catch (error) {
      logger.log('[InviteModal] Failed to share:', error);
    }
  }, [inviteLink, spaceName, shareInviteMutation]);

  const handleClose = useCallback(() => {
    setInviteLink(null);
    setCopied(false);
    onClose();
  }, [onClose]);

  const isGenerating = generateInviteMutation.isPending;
  const hasError = generateInviteMutation.error;

  return (
    <BaseModal visible={visible} onClose={handleClose} height={0.5} avoidKeyboard>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Invite to {spaceName}</Text>
          <Text style={styles.subtitle}>
            Generate a link to invite others to this space
          </Text>
        </View>

        {/* Content */}
        <View style={styles.content}>
          {!inviteLink ? (
            // Generate button
            <View style={styles.generateSection}>
              <View style={styles.iconContainer}>
                <IconSymbol name="link" size={48} color={theme.colors.primary} />
              </View>

              <Text style={styles.infoText}>
                This will generate a one-time use invite link that you can share
                with someone to join this space.
              </Text>

              {hasError && (
                <View style={styles.errorBanner}>
                  <IconSymbol name="exclamationmark.triangle.fill" size={16} color={theme.colors.danger} />
                  <Text style={styles.errorBannerText}>
                    {hasError instanceof Error ? hasError.message : 'Failed to generate invite'}
                  </Text>
                </View>
              )}

              <TouchableOpacity
                style={[styles.primaryButton, isGenerating && styles.primaryButtonDisabled]}
                onPress={handleGenerateInvite}
                disabled={isGenerating}
              >
                {isGenerating ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <IconSymbol name="link.badge.plus" size={20} color="#fff" />
                    <Text style={styles.primaryButtonText}>Generate Invite Link</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          ) : (
            // Invite link display and actions
            <View style={styles.linkSection}>
              <Text style={styles.linkLabel}>Invite Link</Text>

              <View style={styles.linkContainer}>
                <ScrollView
                  style={styles.linkScroll}
                  nestedScrollEnabled
                  showsVerticalScrollIndicator
                >
                  <TextInput
                    style={styles.linkInput}
                    value={inviteLink}
                    editable={false}
                    selectTextOnFocus
                    multiline
                  />
                </ScrollView>
              </View>

              <View style={styles.linkActions}>
                <TouchableOpacity
                  style={[styles.actionButton, copied && styles.actionButtonSuccess]}
                  onPress={handleCopyLink}
                  disabled={copyLinkMutation.isPending}
                >
                  <IconSymbol
                    name={copied ? 'checkmark' : 'doc.on.doc'}
                    size={18}
                    color={copied ? '#fff' : theme.colors.textMain}
                  />
                  <Text style={[styles.actionButtonText, copied && styles.actionButtonTextSuccess]}>
                    {copied ? 'Copied!' : 'Copy'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={handleShare}
                  disabled={shareInviteMutation.isPending}
                >
                  {shareInviteMutation.isPending ? (
                    <ActivityIndicator size="small" color={theme.colors.textMain} />
                  ) : (
                    <>
                      <IconSymbol name="square.and.arrow.up" size={18} color={theme.colors.textMain} />
                      <Text style={styles.actionButtonText}>Share</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>

              <View style={styles.warningBanner}>
                <IconSymbol name="exclamationmark.circle" size={16} color={theme.colors.warning ?? '#f59e0b'} />
                <Text style={styles.warningText}>
                  This link can only be used once. Generate a new link for each person you want to invite.
                </Text>
              </View>

              <TouchableOpacity
                style={styles.regenerateButton}
                onPress={handleGenerateInvite}
                disabled={isGenerating}
              >
                {isGenerating ? (
                  <ActivityIndicator size="small" color={theme.colors.primary} />
                ) : (
                  <>
                    <IconSymbol name="arrow.clockwise" size={16} color={theme.colors.primary} />
                    <Text style={styles.regenerateButtonText}>Generate New Link</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}
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
      textAlign: 'center',
    },
    subtitle: {
      fontSize: 14,
      fontFamily: theme.fonts.regular.fontFamily,
      color: theme.colors.textMuted,
      textAlign: 'center',
      marginTop: 4,
    },
    content: {
      flex: 1,
    },
    generateSection: {
      alignItems: 'center',
      paddingVertical: 24,
    },
    iconContainer: {
      width: 96,
      height: 96,
      borderRadius: 48,
      backgroundColor: theme.colors.primary + '15',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 24,
    },
    infoText: {
      fontSize: 14,
      fontFamily: theme.fonts.regular.fontFamily,
      color: theme.colors.textMuted,
      textAlign: 'center',
      lineHeight: 20,
      marginBottom: 24,
      paddingHorizontal: 16,
    },
    primaryButton: {
      flexDirection: 'row',
      paddingVertical: 14,
      paddingHorizontal: 24,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.primary,
      borderRadius: 12,
      gap: 8,
    },
    primaryButtonDisabled: {
      opacity: 0.5,
    },
    primaryButtonText: {
      fontSize: 16,
      fontFamily: theme.fonts.medium.fontFamily,
      fontWeight: theme.fonts.medium.fontWeight,
      color: '#fff',
    },
    errorBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 12,
      backgroundColor: theme.colors.danger + '15',
      borderRadius: 8,
      marginBottom: 16,
      gap: 8,
    },
    errorBannerText: {
      flex: 1,
      fontSize: 14,
      fontFamily: theme.fonts.regular.fontFamily,
      color: theme.colors.danger,
    },
    linkSection: {
      flex: 1,
    },
    linkLabel: {
      fontSize: 14,
      fontFamily: theme.fonts.medium.fontFamily,
      fontWeight: theme.fonts.medium.fontWeight,
      color: theme.colors.textMain,
      marginBottom: 8,
    },
    linkContainer: {
      backgroundColor: theme.colors.surface3,
      borderRadius: 12,
      padding: 12,
      marginBottom: 12,
      maxHeight: 120,
    },
    linkScroll: {
      maxHeight: 96,
    },
    linkInput: {
      fontSize: 13,
      fontFamily: theme.fonts.regular.fontFamily,
      color: theme.colors.textMain,
      lineHeight: 18,
    },
    linkActions: {
      flexDirection: 'row',
      gap: 12,
      marginBottom: 16,
    },
    actionButton: {
      flex: 1,
      flexDirection: 'row',
      paddingVertical: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surface3,
      borderRadius: 12,
      gap: 8,
    },
    actionButtonSuccess: {
      backgroundColor: theme.colors.success ?? '#22c55e',
    },
    actionButtonText: {
      fontSize: 15,
      fontFamily: theme.fonts.medium.fontFamily,
      fontWeight: theme.fonts.medium.fontWeight,
      color: theme.colors.textMain,
    },
    actionButtonTextSuccess: {
      color: '#fff',
    },
    warningBanner: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      padding: 12,
      backgroundColor: (theme.colors.warning ?? '#f59e0b') + '15',
      borderRadius: 8,
      marginBottom: 16,
      gap: 8,
    },
    warningText: {
      flex: 1,
      fontSize: 13,
      fontFamily: theme.fonts.regular.fontFamily,
      color: theme.colors.warning ?? '#f59e0b',
      lineHeight: 18,
    },
    regenerateButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 12,
      gap: 8,
    },
    regenerateButtonText: {
      fontSize: 15,
      fontFamily: theme.fonts.medium.fontFamily,
      fontWeight: theme.fonts.medium.fontWeight,
      color: theme.colors.primary,
    },
  });
