/**
 * useUserKicking - Hook for kicking users from a space
 *
 * Implements a two-step confirmation pattern to prevent accidental kicks.
 * The actual kick operation involves:
 * 1. Generating new config keypair
 * 2. Updating space registration with new config key
 * 3. Removing user from all roles
 * 4. Re-encrypting and posting space manifest
 * 5. Sending rekey messages to remaining members
 * 6. Sending kick notification to kicked user
 * 7. Marking user as kicked locally
 */

import { logger } from '@quilibrium/quorum-shared';
import { useState, useCallback, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context';
import { useWebSocket } from '@/context/WebSocketContext';
import { kickUser as kickUserService } from '@/services/space/spaceService';

interface UseUserKickingOptions {
  spaceId: string | undefined;
}

export function useUserKicking(options: UseUserKickingOptions) {
  const { spaceId } = options;
  const [kicking, setKicking] = useState(false);
  const [confirmationStep, setConfirmationStep] = useState(0); // 0: initial, 1: awaiting confirmation
  const [confirmationTimeout, setConfirmationTimeout] = useState<ReturnType<typeof setTimeout> | null>(null);

  const queryClient = useQueryClient();
  const { enqueueOutbound } = useWebSocket();
  const { user } = useAuth();

  // Clean up timeout on unmount
  useEffect(() => {
    return () => {
      if (confirmationTimeout) {
        clearTimeout(confirmationTimeout);
      }
    };
  }, [confirmationTimeout]);

  /**
   * Execute the kick operation with full cryptographic rekey
   */
  const kickUserFromSpace = useCallback(
    async (userAddress: string, onSuccess?: () => void) => {
      if (!spaceId || !userAddress || !user?.address) return;

      setKicking(true);
      try {
        // Call the full kick service which handles:
        // - New config key generation
        // - Space registration update
        // - Role removal
        // - Manifest update
        // - Rekey messages to remaining members
        // - Kick notification to kicked user
        // - Local state update
        const result = await kickUserService({
          spaceId,
          userAddress,
          selfAddress: user.address,
        });

        if (!result.success) {
          throw new Error('Kick operation failed');
        }

        // Send all WebSocket envelopes
        if (result.wsEnvelopes.length > 0) {
          enqueueOutbound(async () => result.wsEnvelopes);
        }

        logger.log('[useUserKicking] User kicked:', userAddress);

        // Invalidate queries to refresh UI
        await queryClient.invalidateQueries({
          queryKey: ['spaceMembers', spaceId],
        });
        await queryClient.invalidateQueries({
          queryKey: ['roles', spaceId],
        });
        await queryClient.invalidateQueries({
          queryKey: ['spaces'],
        });

        if (onSuccess) {
          onSuccess();
        }
      } catch (error) {
        console.error('[useUserKicking] Failed to kick user:', error);
        throw error;
      } finally {
        setKicking(false);
      }
    },
    [spaceId, user?.address, queryClient, enqueueOutbound]
  );

  /**
   * Handle kick button click with two-step confirmation
   */
  const handleKickClick = useCallback(
    (userAddress: string, onSuccess?: () => void) => {
      if (confirmationStep === 0) {
        setConfirmationStep(1);
        // Reset confirmation after 5 seconds
        const timeout = setTimeout(() => setConfirmationStep(0), 5000);
        setConfirmationTimeout(timeout);
      } else {
        // Clear the timeout since we're confirming
        if (confirmationTimeout) {
          clearTimeout(confirmationTimeout);
          setConfirmationTimeout(null);
        }
        kickUserFromSpace(userAddress, onSuccess);
      }
    },
    [confirmationStep, confirmationTimeout, kickUserFromSpace]
  );

  /**
   * Reset the confirmation state
   */
  const resetConfirmation = useCallback(() => {
    setConfirmationStep(0);
    if (confirmationTimeout) {
      clearTimeout(confirmationTimeout);
      setConfirmationTimeout(null);
    }
  }, [confirmationTimeout]);

  return {
    kicking,
    confirmationStep,
    handleKickClick,
    kickUserFromSpace,
    resetConfirmation,
  };
}
