/**
 * useInviteManagement - Hooks for managing space invites
 *
 * Provides:
 * - useGenerateInvite: Create an invite link for a space
 * - useCopyInviteLink: Copy invite link to clipboard
 * - useShareInvite: Share invite via system share sheet
 */

import { logger } from '@quilibrium/quorum-shared';
import { useMutation } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { Share, Platform } from 'react-native';
import {
  generatePrivateInviteLink,
  parseInviteLink,
  isValidInviteLink,
  getShortenedInviteLink,
  type InviteParams,
} from '@/services/space/inviteService';
import { getSpace } from '@/services/config/spaceStorage';

interface GenerateInviteParams {
  spaceId: string;
}

interface GenerateInviteResult {
  inviteLink: string;
  isOneTimeUse: boolean;
  spaceName: string;
}

/**
 * Generate an invite link for a space
 */
export function useGenerateInvite() {
  return useMutation({
    mutationFn: async (params: GenerateInviteParams): Promise<GenerateInviteResult> => {
      const space = getSpace(params.spaceId);
      if (!space) {
        throw new Error('Space not found');
      }

      const result = await generatePrivateInviteLink(params.spaceId);

      return {
        inviteLink: result.inviteLink,
        isOneTimeUse: result.isOneTimeUse,
        spaceName: space.spaceName,
      };
    },
  });
}

/**
 * Copy invite link to clipboard
 */
export function useCopyInviteLink() {
  return useMutation({
    mutationFn: async (inviteLink: string): Promise<void> => {
      await Clipboard.setStringAsync(inviteLink);
    },
  });
}

interface ShareInviteParams {
  inviteLink: string;
  spaceName: string;
}

/**
 * Share invite via system share sheet
 */
export function useShareInvite() {
  return useMutation({
    mutationFn: async (params: ShareInviteParams): Promise<void> => {
      const message = `Join "${params.spaceName}" on Quorum!\n\n${params.inviteLink}`;

      try {
        const result = await Share.share(
          Platform.OS === 'ios'
            ? { message, url: params.inviteLink }
            : { message }
        );

        if (result.action === Share.dismissedAction) {
          logger.log('[useShareInvite] Share dismissed');
        } else if (result.action === Share.sharedAction) {
          logger.log('[useShareInvite] Shared successfully');
        }
      } catch (error) {
        console.error('[useShareInvite] Share failed:', error);
        throw error;
      }
    },
  });
}

/**
 * Validate and parse an invite link
 */
export function useParseInviteLink() {
  return useMutation({
    mutationFn: async (inviteLink: string): Promise<InviteParams> => {
      const params = parseInviteLink(inviteLink);
      if (!params) {
        throw new Error('Invalid invite link');
      }
      return params;
    },
  });
}

// Re-export utility functions for direct use
export { isValidInviteLink, getShortenedInviteLink, parseInviteLink };
