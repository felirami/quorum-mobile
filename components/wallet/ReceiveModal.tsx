/**
 * ReceiveModal - Display QR code and addresses for receiving tokens
 */

import { BaseModal } from '@/components/shared';
import { IconSymbol } from '@/components/ui/IconSymbol';
import { useWalletAddresses } from '@/hooks/useWallet';
import { useWalletSelection } from '@/hooks/useWalletSelection';
import { getChainName } from '@/services/wallet/balanceService';
import WalletSelector from './WalletSelector';
import { useTheme, type AppTheme } from '@/theme';
import * as Clipboard from 'expo-clipboard';
import React from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

// Optional QR code - will use placeholder if not installed
let QRCode: any = null;
try {
  QRCode = require('react-native-qrcode-svg').default;
} catch (e) {
  // QR code package not installed
}

interface ReceiveModalProps {
  visible: boolean;
  onClose: () => void;
  defaultChain?: string;
}

type ChainOption = 'ethereum' | 'bitcoin' | 'solana' | 'kaspa' | 'bittensor';

export default function ReceiveModal({ visible, onClose, defaultChain }: ReceiveModalProps) {
  const { theme, isDark } = useTheme();
  const { data: addresses } = useWalletAddresses();
  const { activeWallet, activeType } = useWalletSelection();
  const [selectedChain, setSelectedChain] = React.useState<ChainOption>(
    (defaultChain as ChainOption) || 'ethereum'
  );

  const styles = createStyles(theme, isDark);

  // Get the active EVM address (from selected wallet)
  const activeEvmAddress = activeWallet?.address ?? addresses?.ethereum;

  const getAddress = (): string => {
    if (!addresses && !activeEvmAddress) return '';
    switch (selectedChain) {
      case 'ethereum':
        // Use active wallet address for EVM
        return activeEvmAddress || '';
      case 'bitcoin':
        // Bitcoin only available on builtin wallet
        return addresses?.bitcoin.nativeSegwit || '';
      case 'solana':
        // Solana only available on builtin wallet
        return addresses?.solana || '';
      case 'kaspa':
        return addresses?.kaspa || '';
      case 'bittensor':
        return addresses?.bittensor || '';
      default:
        return activeEvmAddress || '';
    }
  };

  const getChainColor = (chain: ChainOption): string => {
    switch (chain) {
      case 'ethereum':
        return '#627EEA';
      case 'bitcoin':
        return '#F7931A';
      case 'solana':
        return '#9945FF';
      case 'kaspa':
        return '#49EAC2';
      case 'bittensor':
        return '#6366F1';
    }
  };

  const getChainDescription = (chain: ChainOption): string => {
    switch (chain) {
      case 'ethereum':
        return 'ETH & all EVM tokens';
      case 'bitcoin':
        return 'BTC only';
      case 'solana':
        return 'SOL & SPL tokens';
      case 'kaspa':
        return 'KAS only';
      case 'bittensor':
        return 'TAO only';
    }
  };

  const copyAddress = async () => {
    const address = getAddress();
    await Clipboard.setStringAsync(address);
    Alert.alert('Copied', 'Address copied to clipboard');
  };

  const address = getAddress();

  return (
    <BaseModal visible={visible} onClose={onClose} height={0.7}>
      <View style={styles.header}>
        <Text style={styles.title}>Receive</Text>
        <TouchableOpacity onPress={onClose}>
          <IconSymbol name="xmark" size={20} color={theme.colors.textMuted} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Wallet Selector - only show for EVM */}
        {selectedChain === 'ethereum' && <WalletSelector />}

        {/* Chain Selector */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chainSelectorScroll}
          contentContainerStyle={styles.chainSelector}
        >
          {(['ethereum', 'bitcoin', 'solana', 'kaspa', 'bittensor'] as ChainOption[]).map((chain) => (
            <TouchableOpacity
              key={chain}
              style={[
                styles.chainOption,
                selectedChain === chain && styles.chainOptionActive,
                selectedChain === chain && { borderColor: getChainColor(chain) },
              ]}
              onPress={() => setSelectedChain(chain)}
            >
              <Text
                style={[
                  styles.chainOptionText,
                  selectedChain === chain && { color: getChainColor(chain) },
                ]}
              >
                {chain === 'ethereum' ? 'EVM' : chain.charAt(0).toUpperCase() + chain.slice(1)}
              </Text>
              <Text style={styles.chainOptionSubtext}>{getChainDescription(chain)}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* QR Code */}
        {address && (
          <View style={styles.qrContainer}>
            <View style={styles.qrWrapper}>
              {QRCode ? (
                <QRCode
                  value={address}
                  size={200}
                  backgroundColor="white"
                  color="black"
                />
              ) : (
                <View style={styles.qrPlaceholder}>
                  <IconSymbol name="qrcode" size={80} color={theme.colors.textMuted} />
                  <Text style={styles.qrPlaceholderText}>QR Code</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Address Display */}
        <View style={styles.addressContainer}>
          <Text style={styles.addressLabel}>
            {selectedChain === 'ethereum' ? 'EVM Address' : `${getChainName(selectedChain)} Address`}
          </Text>
          <TouchableOpacity style={styles.addressBox} onPress={copyAddress}>
            <Text style={styles.addressText} numberOfLines={2}>
              {address}
            </Text>
            <IconSymbol name="doc.on.doc" size={18} color={theme.colors.primary} />
          </TouchableOpacity>
        </View>

        {/* Info */}
        <View style={styles.infoBox}>
          <IconSymbol name="info.circle.fill" size={18} color={theme.colors.primary} />
          <Text style={styles.infoText}>
            {selectedChain === 'ethereum'
              ? `This address (${activeType === 'warpcast' ? 'Warpcast Wallet' : 'Quorum Wallet'}) works for Ethereum, Base, Arbitrum, Optimism, Polygon, and all EVM-compatible chains.`
              : selectedChain === 'bitcoin'
              ? 'Use this Native SegWit address for lower fees. Compatible with most exchanges.'
              : selectedChain === 'solana'
              ? 'This address is for Solana and SPL tokens only.'
              : selectedChain === 'kaspa'
              ? 'This address is for Kaspa (KAS) only. Uses Schnorr signatures.'
              : 'This address is for Bittensor (TAO) only. Uses Substrate SS58 format.'}
          </Text>
        </View>
      </ScrollView>
    </BaseModal>
  );
}

const createStyles = (theme: AppTheme, isDark: boolean) =>
  StyleSheet.create({
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingBottom: 16,
    },
    title: {
      fontSize: 20,
      fontFamily: theme.fonts.bold.fontFamily,
      fontWeight: theme.fonts.bold.fontWeight,
      color: theme.colors.textMain,
    },
    content: {
      flex: 1,
      paddingHorizontal: 20,
    },
    chainSelectorScroll: {
      marginHorizontal: -20,
      marginBottom: 24,
    },
    chainSelector: {
      flexDirection: 'row',
      gap: 8,
      paddingHorizontal: 20,
    },
    chainOption: {
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: theme.colors.border,
      alignItems: 'center',
      minWidth: 80,
    },
    chainOptionActive: {
      backgroundColor: theme.colors.surface2,
    },
    chainOptionText: {
      fontSize: 14,
      fontFamily: theme.fonts.bold.fontFamily,
      fontWeight: theme.fonts.bold.fontWeight,
      color: theme.colors.textMuted,
    },
    chainOptionSubtext: {
      fontSize: 10,
      color: theme.colors.textMuted,
      marginTop: 2,
    },
    qrContainer: {
      alignItems: 'center',
      marginBottom: 24,
    },
    qrWrapper: {
      padding: 16,
      backgroundColor: 'white',
      borderRadius: 16,
    },
    qrPlaceholder: {
      width: 200,
      height: 200,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surface2,
      borderRadius: 8,
    },
    qrPlaceholderText: {
      marginTop: 8,
      fontSize: 12,
      color: theme.colors.textMuted,
    },
    addressContainer: {
      marginBottom: 16,
    },
    addressLabel: {
      fontSize: 12,
      color: theme.colors.textMuted,
      marginBottom: 8,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    addressBox: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.colors.surface2,
      borderRadius: 12,
      padding: 14,
      gap: 12,
    },
    addressText: {
      flex: 1,
      fontSize: 13,
      color: theme.colors.textMain,
      fontFamily: theme.fonts.regular.fontFamily,
    },
    infoBox: {
      flexDirection: 'row',
      backgroundColor: theme.colors.primary + '15',
      borderRadius: 12,
      padding: 14,
      gap: 10,
      marginBottom: 24,
    },
    infoText: {
      flex: 1,
      fontSize: 13,
      color: theme.colors.textMuted,
      lineHeight: 18,
    },
  });
