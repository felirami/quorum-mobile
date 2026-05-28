/**
 * MiniAppApprovalModal - Approval UI for mini app wallet requests
 *
 * Displays transaction and message signing requests for user approval.
 *
 * SECURITY: This modal only handles user approval. The actual signing is
 * performed in the parent component's resolve callback via SecureSigningService.
 * Private keys are never passed to or handled by this modal.
 */

import { BaseModal } from '@/components/shared';
import { IconSymbol, type IconSymbolName } from '@/components/ui/IconSymbol';
import WalletSelector from '@/components/wallet/WalletSelector';
import { useTheme, type AppTheme } from '@/theme';
import React from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  TransactionForApproval,
  MessageForApproval,
  TypedDataForApproval,
  formatTransactionForDisplay,
  EthereumProviderService,
} from '@/services/miniapp/ethereumProvider';
import { formatEther } from 'viem';

// Request types
export type ApprovalRequestType = 'transaction' | 'message' | 'typedData';

export interface ApprovalRequest {
  type: ApprovalRequestType;
  transaction?: TransactionForApproval;
  message?: MessageForApproval;
  typedData?: TypedDataForApproval;
  appName?: string;
  appIcon?: string;
  /**
   * Called with user's approval decision.
   * The callback may be async (e.g., to perform signing after approval).
   */
  resolve: (approved: boolean) => void | Promise<void>;
}

interface MiniAppApprovalModalProps {
  visible: boolean;
  request: ApprovalRequest | null;
  onClose: () => void;
}

export default function MiniAppApprovalModal({
  visible,
  request,
  onClose,
}: MiniAppApprovalModalProps) {
  const { theme, isDark } = useTheme();
  const [isProcessing, setIsProcessing] = React.useState(false);

  const styles = createStyles(theme, isDark);

  const handleApprove = async () => {
    if (!request) return;
    setIsProcessing(true);
    try {
      // Await the resolve in case it performs async signing
      await request.resolve(true);
    } finally {
      setIsProcessing(false);
      onClose();
    }
  };

  const handleReject = () => {
    if (!request) return;
    request.resolve(false);
    onClose();
  };

  if (!request) return null;

  const renderTransactionDetails = () => {
    if (!request.transaction) return null;
    const tx = request.transaction;
    const formatted = formatTransactionForDisplay(tx);

    return (
      <View style={styles.detailsContainer}>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Network</Text>
          <View style={styles.chainBadge}>
            <Text style={styles.chainBadgeText}>{formatted.chainName}</Text>
          </View>
        </View>

        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>To</Text>
          <Text style={styles.detailValue} numberOfLines={1}>
            {tx.to ? `${tx.to.slice(0, 10)}...${tx.to.slice(-8)}` : 'Contract Creation'}
          </Text>
        </View>

        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Value</Text>
          <Text style={styles.detailValueHighlight}>{formatted.value}</Text>
        </View>

        {tx.data && tx.data !== '0x' && (
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Data</Text>
            <Text style={styles.detailValue} numberOfLines={1}>
              {tx.data.length > 20 ? `${tx.data.slice(0, 20)}...` : tx.data}
            </Text>
          </View>
        )}

        {tx.gas && (
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Gas Limit</Text>
            <Text style={styles.detailValue}>{tx.gas.toString()}</Text>
          </View>
        )}
      </View>
    );
  };

  const renderMessageDetails = () => {
    if (!request.message) return null;
    const msg = request.message;

    return (
      <View style={styles.detailsContainer}>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Account</Text>
          <Text style={styles.detailValue} numberOfLines={1}>
            {`${msg.account.slice(0, 10)}...${msg.account.slice(-8)}`}
          </Text>
        </View>

        <View style={styles.messageContainer}>
          <Text style={styles.detailLabel}>Message</Text>
          <ScrollView style={styles.messageScroll} nestedScrollEnabled>
            <Text style={styles.messageText}>{msg.message}</Text>
          </ScrollView>
        </View>
      </View>
    );
  };

  const renderTypedDataDetails = () => {
    if (!request.typedData) return null;
    const data = request.typedData;

    return (
      <View style={styles.detailsContainer}>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Account</Text>
          <Text style={styles.detailValue} numberOfLines={1}>
            {`${data.account.slice(0, 10)}...${data.account.slice(-8)}`}
          </Text>
        </View>

        {data.domain && 'name' in data.domain && data.domain.name != null && (
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Domain</Text>
            <Text style={styles.detailValue}>{String(data.domain.name)}</Text>
          </View>
        )}

        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Type</Text>
          <Text style={styles.detailValue}>{data.primaryType}</Text>
        </View>

        <View style={styles.messageContainer}>
          <Text style={styles.detailLabel}>Data</Text>
          <ScrollView style={styles.messageScroll} nestedScrollEnabled>
            <Text style={styles.messageText}>
              {JSON.stringify(data.message, null, 2)}
            </Text>
          </ScrollView>
        </View>
      </View>
    );
  };

  const getTitle = () => {
    switch (request.type) {
      case 'transaction':
        return 'Confirm Transaction';
      case 'message':
        return 'Sign Message';
      case 'typedData':
        return 'Sign Typed Data';
      default:
        return 'Approve Request';
    }
  };

  const getIcon = () => {
    switch (request.type) {
      case 'transaction':
        return 'arrow.up.right.circle.fill';
      case 'message':
      case 'typedData':
        return 'signature';
      default:
        return 'checkmark.circle.fill';
    }
  };

  const getWarningText = () => {
    switch (request.type) {
      case 'transaction':
        return 'This will send a transaction from your wallet. Make sure you trust this app.';
      case 'message':
      case 'typedData':
        return 'This app is requesting your signature. Only sign messages from apps you trust.';
      default:
        return '';
    }
  };

  return (
    <BaseModal visible={visible} onClose={handleReject} height={0.75}>
      <View style={styles.container}>
        <ScrollView
          style={styles.scrollContainer}
          showsVerticalScrollIndicator={true}
          contentContainerStyle={styles.scrollContent}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.iconContainer}>
              <IconSymbol
                name={getIcon() as IconSymbolName}
                size={32}
                color={request.type === 'transaction' ? '#F59E0B' : theme.colors.primary}
              />
            </View>
            <Text style={styles.title}>{getTitle()}</Text>
            {request.appName && (
              <Text style={styles.appName}>{request.appName}</Text>
            )}
          </View>

          {/* Warning */}
          <View style={styles.warningContainer}>
            <IconSymbol name="exclamationmark.triangle.fill" size={16} color="#F59E0B" />
            <Text style={styles.warningText}>{getWarningText()}</Text>
          </View>

          {/* Wallet Selector - allows user to choose which wallet to use */}
          <WalletSelector hideIfSingle={false} />

          {/* Details */}
          {request.type === 'transaction' && renderTransactionDetails()}
          {request.type === 'message' && renderMessageDetails()}
          {request.type === 'typedData' && renderTypedDataDetails()}
        </ScrollView>

        {/* Actions - fixed at bottom */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.rejectButton}
            onPress={handleReject}
            disabled={isProcessing}
          >
            <Text style={styles.rejectButtonText}>Reject</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.approveButton, isProcessing && styles.buttonDisabled]}
            onPress={handleApprove}
            disabled={isProcessing}
          >
            {isProcessing ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.approveButtonText}>
                {request.type === 'transaction' ? 'Confirm' : 'Sign'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </BaseModal>
  );
}

const createStyles = (theme: AppTheme, isDark: boolean) =>
  StyleSheet.create({
    container: {
      flex: 1,
      paddingHorizontal: 20,
    },
    header: {
      alignItems: 'center',
      paddingVertical: 16,
    },
    iconContainer: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: theme.colors.surface2,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 12,
    },
    title: {
      fontSize: 20,
      fontFamily: theme.fonts.bold.fontFamily,
      fontWeight: theme.fonts.bold.fontWeight,
      color: theme.colors.textMain,
    },
    appName: {
      fontSize: 14,
      color: theme.colors.textMuted,
      marginTop: 4,
    },
    warningContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#F59E0B15',
      borderRadius: 12,
      padding: 12,
      gap: 8,
      marginBottom: 16,
    },
    warningText: {
      flex: 1,
      fontSize: 13,
      color: '#F59E0B',
      lineHeight: 18,
    },
    scrollContainer: {
      flex: 1,
    },
    scrollContent: {
      paddingBottom: 16,
    },
    detailsContainer: {
      backgroundColor: theme.colors.surface2,
      borderRadius: 12,
      padding: 16,
      gap: 12,
    },
    detailRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    detailLabel: {
      fontSize: 14,
      color: theme.colors.textMuted,
    },
    detailValue: {
      fontSize: 14,
      color: theme.colors.textMain,
      fontFamily: theme.fonts.medium.fontFamily,
      fontWeight: theme.fonts.medium.fontWeight,
      maxWidth: '60%',
      textAlign: 'right',
    },
    detailValueHighlight: {
      fontSize: 16,
      color: theme.colors.textMain,
      fontFamily: theme.fonts.bold.fontFamily,
      fontWeight: theme.fonts.bold.fontWeight,
    },
    chainBadge: {
      backgroundColor: theme.colors.primary + '20',
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
    },
    chainBadgeText: {
      fontSize: 12,
      color: theme.colors.primary,
      fontFamily: theme.fonts.medium.fontFamily,
      fontWeight: theme.fonts.medium.fontWeight,
    },
    messageContainer: {
      gap: 8,
    },
    messageScroll: {
      maxHeight: 200,
      backgroundColor: theme.colors.background,
      borderRadius: 8,
      padding: 12,
    },
    messageText: {
      fontSize: 13,
      color: theme.colors.textMain,
      fontFamily: 'monospace',
      lineHeight: 20,
    },
    actions: {
      flexDirection: 'row',
      gap: 12,
      paddingVertical: 16,
    },
    rejectButton: {
      flex: 1,
      backgroundColor: theme.colors.surface2,
      borderRadius: 12,
      padding: 16,
      alignItems: 'center',
    },
    rejectButtonText: {
      fontSize: 16,
      fontFamily: theme.fonts.bold.fontFamily,
      fontWeight: theme.fonts.bold.fontWeight,
      color: theme.colors.textMain,
    },
    approveButton: {
      flex: 1,
      backgroundColor: theme.colors.primary,
      borderRadius: 12,
      padding: 16,
      alignItems: 'center',
    },
    approveButtonText: {
      fontSize: 16,
      fontFamily: theme.fonts.bold.fontFamily,
      fontWeight: theme.fonts.bold.fontWeight,
      color: '#fff',
    },
    buttonDisabled: {
      opacity: 0.6,
    },
  });
