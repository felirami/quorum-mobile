/**
 * WalletSelector - Inline wallet switcher for use in modals
 */

import { IconSymbol } from '@/components/ui/IconSymbol';
import { useWalletSelection, WalletType } from '@/hooks/useWalletSelection';
import { useTheme, type AppTheme } from '@/theme';
import { truncateAddress } from '@/utils/formatAddress';
import React from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

interface WalletSelectorProps {
  /** Only show if multiple wallets are available */
  hideIfSingle?: boolean;
}

export default function WalletSelector({ hideIfSingle = true }: WalletSelectorProps) {
  const { theme } = useTheme();
  const {
    activeWallet,
    activeType,
    availableWallets,
    hasWarpcastWallet,
    switchWallet,
    isSwitching,
  } = useWalletSelection();

  const styles = createStyles(theme);

  // Don't render if only one wallet and hideIfSingle is true
  if (hideIfSingle && availableWallets.length <= 1) {
    return null;
  }

  const handleSwitch = () => {
    // Toggle between wallets
    const newType: WalletType = activeType === 'builtin' ? 'warpcast' : 'builtin';
    if (newType === 'warpcast' && !hasWarpcastWallet) return;
    switchWallet(newType);
  };

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={handleSwitch}
      disabled={isSwitching || availableWallets.length <= 1}
    >
      <View style={styles.walletInfo}>
        <View style={[styles.walletDot, activeType === 'warpcast' && styles.walletDotWarpcast]} />
        <View>
          <Text style={styles.walletLabel}>
            {activeType === 'warpcast' ? 'Warpcast Wallet' : 'Quorum Wallet'}
          </Text>
          <Text style={styles.walletAddress}>
            {truncateAddress(activeWallet?.address || '')}
          </Text>
        </View>
      </View>
      {availableWallets.length > 1 && (
        <View style={styles.switchButton}>
          <IconSymbol name="arrow.triangle.2.circlepath" size={14} color={theme.colors.primary} />
          <Text style={styles.switchText}>Switch</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: theme.colors.surface2,
      borderRadius: 12,
      padding: 12,
      marginBottom: 16,
    },
    walletInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    walletDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: theme.colors.primary,
    },
    walletDotWarpcast: {
      backgroundColor: '#8B5CF6', // Purple for Warpcast
    },
    walletLabel: {
      fontSize: 13,
      fontFamily: theme.fonts.medium.fontFamily,
      fontWeight: theme.fonts.medium.fontWeight,
      color: theme.colors.textMain,
    },
    walletAddress: {
      fontSize: 11,
      color: theme.colors.textMuted,
      marginTop: 1,
    },
    switchButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 6,
      backgroundColor: theme.colors.primary + '15',
      borderRadius: 8,
    },
    switchText: {
      fontSize: 12,
      fontFamily: theme.fonts.medium.fontFamily,
      fontWeight: theme.fonts.medium.fontWeight,
      color: theme.colors.primary,
    },
  });
