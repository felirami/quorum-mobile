/**
 * InviteLinkCard - Renders an invite link as a card with join button
 *
 * Detects invite links in messages and renders them as rich cards
 * showing space info with a join button.
 */

import { logger } from '@quilibrium/quorum-shared';
import { IconSymbol } from '@/components/ui/IconSymbol';
import { useAuth, useWebSocket } from '@/context';
import { useJoinSpace, useValidateInvite } from '@/hooks/chat/useSpaceActions';
import { getSpace } from '@/services/config/spaceStorage';
import { useSpaces } from '@/hooks/chat/useSpaces';
import { useTheme } from '@/theme';
import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

// Valid invite link prefixes for detection
const VALID_INVITE_PREFIXES = [
  'https://qm.one/',
  'https://qm.one/#',
  'https://quorummessenger.com/i/',
  'https://www.quorummessenger.com/i/',
  'http://localhost:3000/',
  'http://localhost:3000/i/',
  'qm.one/',
];

/**
 * Check if a string contains an invite link
 */
export function containsInviteLink(text: string): boolean {
  return VALID_INVITE_PREFIXES.some(prefix => text.includes(prefix));
}

/**
 * Extract invite link from text
 */
export function extractInviteLink(text: string): string | null {
  for (const prefix of VALID_INVITE_PREFIXES) {
    const startIndex = text.indexOf(prefix);
    if (startIndex !== -1) {
      // Find the end of the URL (space or end of string)
      const restOfText = text.substring(startIndex);
      const endIndex = restOfText.search(/[\s<>"{}|\\^`[\]]/);
      if (endIndex === -1) {
        return restOfText;
      }
      return restOfText.substring(0, endIndex);
    }
  }
  return null;
}

/**
 * Strip invite link from text, returning the remaining content
 * Returns null if the entire message was just the invite link
 */
export function stripInviteLink(text: string): string | null {
  const inviteLink = extractInviteLink(text);
  if (!inviteLink) return text;

  // Remove the invite link from the text
  const stripped = text.replace(inviteLink, '').trim();

  // Return null if nothing left (message was just the link)
  return stripped.length > 0 ? stripped : null;
}

interface InviteLinkCardProps {
  inviteLink: string;
  messageSenderId?: string;
  onJoinSuccess?: (spaceId: string, channelId: string) => void;
}

export function InviteLinkCard({
  inviteLink,
  messageSenderId,
  onJoinSuccess,
}: InviteLinkCardProps) {
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const { user } = useAuth();
  const { subscribe, enqueueOutbound, triggerSyncRequest } = useWebSocket();

  // Validate and fetch space info
  const {
    data: spaceInfo,
    isLoading: isValidating,
    error: validationError,
  } = useValidateInvite(inviteLink);

  // Join space mutation
  const joinMutation = useJoinSpace();

  // Check if user already belongs to this space
  const { data: userSpaces } = useSpaces();
  const isAlreadyMember = useMemo(() => {
    if (!spaceInfo || !userSpaces) return false;
    return userSpaces.some(s => s.spaceId === spaceInfo.spaceId);
  }, [spaceInfo, userSpaces]);

  // Check if current user sent this message
  const isSender = useMemo(() => {
    return messageSenderId && user?.address && messageSenderId === user.address;
  }, [messageSenderId, user?.address]);

  // Button state
  const buttonState = useMemo(() => {
    if (joinMutation.isPending) {
      return { text: 'Joining...', disabled: true };
    }
    if (isAlreadyMember && !isSender) {
      return { text: 'Joined', disabled: true };
    }
    if (isSender) {
      return { text: 'Invite sent', disabled: true };
    }
    return { text: 'Join', disabled: false };
  }, [joinMutation.isPending, isAlreadyMember, isSender]);

  const handleJoin = async () => {
    if (buttonState.disabled) return;

    try {
      const result = await joinMutation.mutateAsync({ inviteLink });
      // Subscribe to the new space inbox immediately
      if (result.inboxAddress) {
        logger.log('[InviteLinkCard] Subscribing to new space inbox:', result.inboxAddress.substring(0, 12));
        await subscribe([result.inboxAddress]);
      }

      // Send join control message to announce ourselves to other participants
      if (result.joinMessageEnvelope) {
        logger.log('[InviteLinkCard] Sending join control message to announce participant');
        enqueueOutbound(async () => [result.joinMessageEnvelope!]);
      }

      // Trigger sync to get existing messages from other members
      // Wait a short moment for subscription to be established
      setTimeout(async () => {
        try {
          logger.log('[InviteLinkCard] Triggering sync request for newly joined space');
          await triggerSyncRequest(result.spaceId, result.channelId);
        } catch (syncError) {
          logger.log('[InviteLinkCard] Sync request failed (non-critical):', syncError);
        }
      }, 1000);

      onJoinSuccess?.(result.spaceId, result.channelId);
    } catch (error) {
      logger.log('[InviteLinkCard] Join failed:', error);
    }
  };

  // Error state
  if (validationError) {
    return (
      <View style={styles.errorContainer}>
        <IconSymbol name="exclamationmark.triangle.fill" size={16} color={theme.colors.warning ?? '#f59e0b'} />
        <Text style={styles.errorText}>
          {validationError instanceof Error && validationError.message.includes('Invalid')
            ? 'Invalid invite link'
            : 'This invite may have expired'}
        </Text>
      </View>
    );
  }

  // Loading state
  if (isValidating || !spaceInfo) {
    return (
      <View style={styles.container}>
        <View style={styles.skeletonIcon} />
        <View style={styles.skeletonContent}>
          <View style={styles.skeletonTitle} />
          <View style={styles.skeletonDescription} />
        </View>
        <View style={styles.skeletonButton} />
      </View>
    );
  }

  // Truncate description
  const description = spaceInfo.description
    ? spaceInfo.description.length > 100
      ? spaceInfo.description.substring(0, 100) + '...'
      : spaceInfo.description
    : null;

  return (
    <View style={styles.container}>
      {/* Space Icon */}
      <View style={styles.iconContainer}>
        {spaceInfo.iconUrl ? (
          <Image source={{ uri: spaceInfo.iconUrl }} style={styles.icon} />
        ) : (
          <View style={styles.iconPlaceholder}>
            <Text style={styles.iconPlaceholderText}>
              {spaceInfo.spaceName.charAt(0).toUpperCase()}
            </Text>
          </View>
        )}
      </View>

      {/* Space Info */}
      <View style={styles.infoContainer}>
        <Text style={styles.spaceName} numberOfLines={1}>
          {spaceInfo.spaceName}
        </Text>
        {description && (
          <Text style={styles.description} numberOfLines={2}>
            {description}
          </Text>
        )}
      </View>

      {/* Join Button */}
      <TouchableOpacity
        style={[
          styles.joinButton,
          buttonState.disabled && styles.joinButtonDisabled,
          isAlreadyMember && styles.joinButtonJoined,
        ]}
        onPress={handleJoin}
        disabled={buttonState.disabled}
      >
        {joinMutation.isPending ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text
            style={[
              styles.joinButtonText,
              buttonState.disabled && styles.joinButtonTextDisabled,
            ]}
          >
            {buttonState.text}
          </Text>
        )}
      </TouchableOpacity>

      {/* Join Error */}
      {joinMutation.error && (
        <View style={styles.joinErrorContainer}>
          <Text style={styles.joinErrorText}>
            {joinMutation.error instanceof Error
              ? joinMutation.error.message
              : 'Failed to join'}
          </Text>
        </View>
      )}
    </View>
  );
}

const createStyles = (theme: any) =>
  StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.colors.surface3,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: 12,
      marginTop: 8,
      maxWidth: 400,
    },
    iconContainer: {
      marginRight: 12,
    },
    icon: {
      width: 44,
      height: 44,
      borderRadius: 8,
    },
    iconPlaceholder: {
      width: 44,
      height: 44,
      borderRadius: 8,
      backgroundColor: theme.colors.primary + '20',
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconPlaceholderText: {
      fontSize: 20,
      fontFamily: theme.fonts.bold.fontFamily,
      fontWeight: theme.fonts.bold.fontWeight,
      color: theme.colors.primary,
    },
    infoContainer: {
      flex: 1,
      marginRight: 12,
    },
    spaceName: {
      fontSize: 15,
      fontFamily: theme.fonts.medium.fontFamily,
      fontWeight: theme.fonts.medium.fontWeight,
      color: theme.colors.textStrong,
    },
    description: {
      fontSize: 13,
      fontFamily: theme.fonts.regular.fontFamily,
      color: theme.colors.textMuted,
      marginTop: 2,
      lineHeight: 18,
    },
    joinButton: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      backgroundColor: theme.colors.primary,
      borderRadius: 8,
      minWidth: 70,
      alignItems: 'center',
    },
    joinButtonDisabled: {
      backgroundColor: theme.colors.surface5 ?? theme.colors.surface3,
    },
    joinButtonJoined: {
      backgroundColor: theme.colors.success ?? '#22c55e',
    },
    joinButtonText: {
      fontSize: 14,
      fontFamily: theme.fonts.medium.fontFamily,
      fontWeight: theme.fonts.medium.fontWeight,
      color: '#fff',
    },
    joinButtonTextDisabled: {
      color: theme.colors.textMuted,
    },
    errorContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: (theme.colors.warning ?? '#f59e0b') + '15',
      borderRadius: 8,
      padding: 10,
      marginTop: 8,
      gap: 8,
    },
    errorText: {
      fontSize: 13,
      fontFamily: theme.fonts.regular.fontFamily,
      color: theme.colors.warning ?? '#f59e0b',
    },
    joinErrorContainer: {
      position: 'absolute',
      bottom: -24,
      left: 0,
      right: 0,
    },
    joinErrorText: {
      fontSize: 12,
      fontFamily: theme.fonts.regular.fontFamily,
      color: theme.colors.danger ?? '#ef4444',
    },
    // Skeleton loading styles
    skeletonIcon: {
      width: 44,
      height: 44,
      borderRadius: 8,
      backgroundColor: theme.colors.surface5 ?? theme.colors.surface3,
      marginRight: 12,
    },
    skeletonContent: {
      flex: 1,
      marginRight: 12,
    },
    skeletonTitle: {
      width: '70%',
      height: 16,
      borderRadius: 4,
      backgroundColor: theme.colors.surface5 ?? theme.colors.surface3,
    },
    skeletonDescription: {
      width: '90%',
      height: 12,
      borderRadius: 4,
      backgroundColor: theme.colors.surface5 ?? theme.colors.surface3,
      marginTop: 6,
    },
    skeletonButton: {
      width: 70,
      height: 32,
      borderRadius: 8,
      backgroundColor: theme.colors.surface5 ?? theme.colors.surface3,
    },
  });

export default InviteLinkCard;
