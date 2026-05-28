/**
 * MarketplaceModal - Browse and search QNS marketplace listings
 */

import { BaseModal } from '@/components/shared';
import { IconSymbol } from '@/components/ui/IconSymbol';
import { useResaleListings, useResaleInfo } from '@/hooks/useQNSMarketplace';
import type { ResaleListing } from '@/services/api/qnsClient';
import { useTheme, type AppTheme } from '@/theme';
import type { EdgeInsets } from 'react-native-safe-area-context';
import React from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BuyNameModal from './BuyNameModal';

interface MarketplaceModalProps {
  visible: boolean;
  onClose: () => void;
  onPurchaseSuccess?: () => void;
  /** When provided, listing taps are delegated to the parent which renders the
   *  buy modal. Avoids stacking RN Modals (which iOS handles unreliably). */
  onPickListing?: (listing: ResaleListing) => void;
}

type SortOption = 'newest' | 'price_low' | 'price_high';

function getChainColor(chain: string): string {
  switch (chain) {
    case 'ethereum': return '#627EEA';
    case 'base': return '#0052FF';
    case 'arbitrum': return '#28A0F0';
    case 'optimism': return '#FF0420';
    case 'polygon': return '#8247E5';
    default: return '#666';
  }
}

export default function MarketplaceModal({
  visible,
  onClose,
  onPurchaseSuccess,
  onPickListing,
}: MarketplaceModalProps) {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = createStyles(theme, isDark, insets);

  const [searchQuery, setSearchQuery] = React.useState('');
  const [debouncedSearch, setDebouncedSearch] = React.useState('');
  const [sortBy, setSortBy] = React.useState<SortOption>('newest');
  const [selectedListing, setSelectedListing] = React.useState<ResaleListing | null>(null);
  const [buyModalVisible, setBuyModalVisible] = React.useState(false);

  // Debounce search
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const { data: listings, isLoading, refetch, isRefetching } = useResaleListings(
    {
      limit: 50,
      search: debouncedSearch || undefined,
    },
    { enabled: visible }
  );

  const { data: resaleInfo } = useResaleInfo({ enabled: visible });

  // Sort listings client-side
  const sortedListings = React.useMemo(() => {
    const arr = Array.isArray(listings) ? listings : listings?.listings;
    if (!arr) return [];
    const items = [...arr];
    switch (sortBy) {
      case 'price_low':
        return items.sort((a, b) => parseFloat(a.price_amount) - parseFloat(b.price_amount));
      case 'price_high':
        return items.sort((a, b) => parseFloat(b.price_amount) - parseFloat(a.price_amount));
      case 'newest':
      default:
        return items.sort((a, b) => {
          const aTime = typeof a.created_at === 'string' ? new Date(a.created_at).getTime() : (a.created_at ?? 0);
          const bTime = typeof b.created_at === 'string' ? new Date(b.created_at).getTime() : (b.created_at ?? 0);
          return bTime - aTime;
        });
    }
  }, [listings, sortBy]);

  // Reset state when modal opens
  React.useEffect(() => {
    if (visible) {
      setSearchQuery('');
      setDebouncedSearch('');
      setSortBy('newest');
      setSelectedListing(null);
    }
  }, [visible]);

  const handleListingPress = (listing: ResaleListing) => {
    if (onPickListing) {
      onPickListing(listing);
      return;
    }
    setSelectedListing(listing);
    setBuyModalVisible(true);
  };

  const formatDate = (date: string | number | undefined): string => {
    if (!date) return '';
    const d = typeof date === 'string' ? new Date(date) : new Date(date);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const formatSeller = (address: unknown): string => {
    if (typeof address !== 'string' || address.length === 0) return 'unknown';
    if (address.length <= 10) return address;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const renderListing = ({ item }: { item: ResaleListing }) => (
    <TouchableOpacity
      style={styles.listingCard}
      onPress={() => handleListingPress(item)}
      activeOpacity={0.7}
    >
      <View style={styles.listingHeader}>
        <Text style={styles.listingName}>@{item.name}</Text>
        {item.state === 'locked' && (
          <View style={styles.lockedBadge}>
            <IconSymbol name="lock.fill" size={10} color={theme.colors.warning} />
            <Text style={styles.lockedText}>Locked</Text>
          </View>
        )}
      </View>
      <View style={styles.listingDetails}>
        <View style={styles.listingPrice}>
          <Text style={styles.priceAmount}>{item.price_amount}</Text>
          <Text style={styles.priceToken}>{item.price_token}</Text>
        </View>
        <View style={styles.listingMeta}>
          <Text style={styles.sellerText}>{formatSeller(item.seller_address)}</Text>
          {item.created_at && (
            <Text style={styles.dateText}>{formatDate(item.created_at)}</Text>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      {isLoading ? (
        <ActivityIndicator size="large" color={theme.colors.primary} />
      ) : (
        <>
          <IconSymbol name="tag.slash" size={48} color={theme.colors.textMuted} />
          <Text style={styles.emptyTitle}>No Listings Found</Text>
          <Text style={styles.emptySubtitle}>
            {debouncedSearch
              ? `No listings match "${debouncedSearch}"`
              : 'The marketplace is empty'}
          </Text>
        </>
      )}
    </View>
  );

  return (
    <>
      <BaseModal visible={visible} onClose={onClose} height={0.95} fillHeight>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Marketplace</Text>
          <TouchableOpacity onPress={onClose}>
            <IconSymbol name="xmark" size={20} color={theme.colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Search */}
        <View style={styles.searchContainer}>
          <IconSymbol name="magnifyingglass" size={16} color={theme.colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search usernames..."
            placeholderTextColor={theme.colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <IconSymbol name="xmark.circle.fill" size={16} color={theme.colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        {/* Sort Options */}
        <View style={styles.sortContainer}>
          {(['newest', 'price_low', 'price_high'] as SortOption[]).map(option => (
            <TouchableOpacity
              key={option}
              style={[styles.sortChip, sortBy === option && styles.sortChipActive]}
              onPress={() => setSortBy(option)}
            >
              <Text
                style={[styles.sortChipText, sortBy === option && styles.sortChipTextActive]}
              >
                {option === 'newest' ? 'Newest' : option === 'price_low' ? 'Price ↑' : 'Price ↓'}
              </Text>
            </TouchableOpacity>
          ))}
          {resaleInfo && (
            <Text style={styles.feeInfo}>{resaleInfo.platform_fee_percent}% fee</Text>
          )}
        </View>

        {/* Listings */}
        <FlatList
          data={sortedListings}
          renderItem={renderListing}
          keyExtractor={item => item.listing_id || item.id || item.name}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={renderEmpty}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={theme.colors.primary}
            />
          }
          showsVerticalScrollIndicator={false}
        />
      </BaseModal>

      {/* Buy Name Modal */}
      <BuyNameModal
        visible={buyModalVisible}
        onClose={() => {
          setBuyModalVisible(false);
          setSelectedListing(null);
        }}
        listing={selectedListing}
        onSuccess={() => {
          setBuyModalVisible(false);
          setSelectedListing(null);
          refetch();
          onPurchaseSuccess?.();
        }}
      />
    </>
  );
}

const createStyles = (theme: AppTheme, isDark: boolean, insets: EdgeInsets) =>
  StyleSheet.create({
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingBottom: 12,
    },
    title: {
      fontSize: 20,
      fontFamily: theme.fonts.bold.fontFamily,
      fontWeight: theme.fonts.bold.fontWeight,
      color: theme.colors.textMain,
    },
    searchContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.colors.surface2,
      borderRadius: 10,
      paddingHorizontal: 12,
      marginHorizontal: 20,
      marginBottom: 12,
      gap: 8,
    },
    searchInput: {
      flex: 1,
      height: 40,
      fontSize: 15,
      color: theme.colors.textMain,
    },
    sortContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 20,
      marginBottom: 12,
      gap: 8,
    },
    sortChip: {
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 16,
      backgroundColor: theme.colors.surface2,
      borderWidth: 1,
      borderColor: theme.colors.surface3,
    },
    sortChipActive: {
      backgroundColor: theme.colors.primary,
      borderColor: theme.colors.primary,
    },
    sortChipText: {
      fontSize: 12,
      color: theme.colors.textMain,
      fontFamily: theme.fonts.medium.fontFamily,
      fontWeight: theme.fonts.medium.fontWeight,
    },
    sortChipTextActive: {
      color: '#fff',
    },
    feeInfo: {
      fontSize: 11,
      color: theme.colors.textMuted,
      marginLeft: 'auto',
    },
    listContent: {
      paddingHorizontal: 20,
      paddingBottom: insets.bottom + 20,
      flexGrow: 1,
    },
    listingCard: {
      backgroundColor: theme.colors.surface2,
      borderRadius: 12,
      padding: 16,
      marginBottom: 10,
    },
    listingHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },
    listingName: {
      fontSize: 17,
      fontFamily: theme.fonts.bold.fontFamily,
      fontWeight: theme.fonts.bold.fontWeight,
      color: theme.colors.primary,
    },
    lockedBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: isDark ? 'rgba(245, 158, 11, 0.15)' : 'rgba(245, 158, 11, 0.1)',
      paddingVertical: 2,
      paddingHorizontal: 8,
      borderRadius: 10,
    },
    lockedText: {
      fontSize: 11,
      color: theme.colors.warning,
      fontFamily: theme.fonts.medium.fontFamily,
      fontWeight: theme.fonts.medium.fontWeight,
    },
    listingDetails: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-end',
    },
    listingPrice: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: 4,
    },
    priceAmount: {
      fontSize: 16,
      fontFamily: theme.fonts.bold.fontFamily,
      fontWeight: theme.fonts.bold.fontWeight,
      color: theme.colors.textMain,
    },
    priceToken: {
      fontSize: 13,
      color: theme.colors.textMuted,
    },
    listingMeta: {
      alignItems: 'flex-end',
    },
    sellerText: {
      fontSize: 12,
      color: theme.colors.textMuted,
      fontFamily: 'monospace',
    },
    dateText: {
      fontSize: 11,
      color: theme.colors.textMuted,
      marginTop: 2,
    },
    emptyContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 60,
      gap: 12,
    },
    emptyTitle: {
      fontSize: 18,
      fontFamily: theme.fonts.bold.fontFamily,
      fontWeight: theme.fonts.bold.fontWeight,
      color: theme.colors.textMain,
    },
    emptySubtitle: {
      fontSize: 14,
      color: theme.colors.textMuted,
      textAlign: 'center',
    },
  });
