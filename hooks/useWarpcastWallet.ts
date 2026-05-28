/**
 * Hook for managing Warpcast wallet import
 *
 * Provides detection of available Warpcast wallet and import functionality.
 */

import { useCallback, useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context';
import {
  getWarpcastWallet,
  storeWarpcastWallet,
  deleteWarpcastWallet,
  WarpcastWalletData,
  hasWarpcastWallet,
} from '@/services/onboarding/secureStorage';
import {
  checkWarpcastWallet,
  fetchWalletRecoveryKey,
} from '@/services/farcasterClient';
import { logger } from '@quilibrium/quorum-shared';

// Query keys
export const warpcastWalletKeys = {
  all: ['warpcastWallet'] as const,
  imported: () => [...warpcastWalletKeys.all, 'imported'] as const,
  available: () => [...warpcastWalletKeys.all, 'available'] as const,
  recoveryKey: () => [...warpcastWalletKeys.all, 'recoveryKey'] as const,
};

export interface WarpcastWalletState {
  /** Whether a Warpcast wallet has been imported to Quorum */
  isImported: boolean;
  /** The imported wallet data (if imported) */
  importedWallet: WarpcastWalletData | null;
  /** Whether a Warpcast wallet is available to import (user has one in Warpcast) */
  isAvailable: boolean;
  /** The address of the available wallet (from Warpcast) */
  availableAddress: string | null;
  /** Loading state */
  isLoading: boolean;
  /** Whether the user should be prompted to import */
  shouldPromptImport: boolean;
}

/**
 * Check if an imported Warpcast wallet exists
 */
export function useImportedWarpcastWallet() {
  return useQuery({
    queryKey: warpcastWalletKeys.imported(),
    queryFn: async () => {
      const wallet = await getWarpcastWallet();
      logger.debug('[useWarpcastWallet] getWarpcastWallet result:', {
        hasWallet: !!wallet,
        address: wallet?.address?.slice(0, 10),
      });
      return wallet;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Check if user has a Warpcast wallet available to import
 */
export function useAvailableWarpcastWallet() {
  const { farcasterAuthToken, user } = useAuth();
  const fid = user?.farcaster?.fid;

  // Debug log
  useEffect(() => {
    logger.debug('[useAvailableWarpcastWallet] Auth state:', {
      hasToken: !!farcasterAuthToken,
      fid,
      hasFarcaster: !!user?.farcaster,
    });
  }, [farcasterAuthToken, fid, user?.farcaster]);

  const query = useQuery({
    queryKey: warpcastWalletKeys.available(),
    queryFn: async () => {
      logger.debug('[useAvailableWarpcastWallet] queryFn called');
      if (!farcasterAuthToken || !fid) return { hasWallet: false, address: undefined };
      const fidNum = typeof fid === 'string' ? parseInt(fid, 10) : fid;
      const result = await checkWarpcastWallet(farcasterAuthToken, fidNum);
      logger.debug('[useAvailableWarpcastWallet] checkWarpcastWallet result:', result);
      return result;
    },
    enabled: !!farcasterAuthToken && !!fid,
    staleTime: 0, // Always refetch to debug
    gcTime: 0, // Don't cache for now
  });

  // Debug query state
  useEffect(() => {
    logger.debug('[useAvailableWarpcastWallet] Query state:', {
      isLoading: query.isLoading,
      isFetching: query.isFetching,
      data: query.data,
      error: query.error,
    });
  }, [query.isLoading, query.isFetching, query.data, query.error]);

  return query;
}

/**
 * Fetch the recovery key needed for wallet export
 */
export function useWarpcastRecoveryKey() {
  const { farcasterAuthToken } = useAuth();

  return useQuery({
    queryKey: warpcastWalletKeys.recoveryKey(),
    queryFn: async () => {
      if (!farcasterAuthToken) return null;
      return fetchWalletRecoveryKey(farcasterAuthToken);
    },
    enabled: false, // Only fetch when explicitly requested
    staleTime: 0, // Always fetch fresh (sensitive data)
    gcTime: 0, // Don't cache
  });
}

/**
 * Main hook for Warpcast wallet state
 */
export function useWarpcastWallet(): WarpcastWalletState & {
  importWallet: (data: Omit<WarpcastWalletData, 'importedAt'>) => Promise<WarpcastWalletData>;
  removeWallet: () => Promise<void>;
  refetch: () => void;
} {
  const queryClient = useQueryClient();

  const {
    data: importedWallet,
    isLoading: importedLoading,
    refetch: refetchImported,
  } = useImportedWarpcastWallet();

  const {
    data: availableWallet,
    isLoading: availableLoading,
  } = useAvailableWarpcastWallet();

  const importMutation = useMutation({
    mutationFn: async (data: Omit<WarpcastWalletData, 'importedAt'>) => {
      const fullData: WarpcastWalletData = {
        ...data,
        importedAt: new Date().toISOString(),
      };
      await storeWarpcastWallet(fullData);
      return fullData;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: warpcastWalletKeys.imported() });
    },
  });

  const removeMutation = useMutation({
    mutationFn: deleteWarpcastWallet,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: warpcastWalletKeys.imported() });
    },
  });

  const isImported = !!importedWallet;
  const isAvailable = availableWallet?.hasWallet ?? false;
  const availableAddress = availableWallet?.address ?? null;

  // Should prompt import if:
  // 1. User has a Warpcast wallet available
  // 2. They haven't already imported it
  const shouldPromptImport = isAvailable && !isImported;

  const refetch = useCallback(() => {
    refetchImported();
  }, [refetchImported]);

  return {
    isImported,
    importedWallet: importedWallet ?? null,
    isAvailable,
    availableAddress,
    isLoading: importedLoading || availableLoading,
    shouldPromptImport,
    importWallet: importMutation.mutateAsync,
    removeWallet: removeMutation.mutateAsync,
    refetch,
  };
}
