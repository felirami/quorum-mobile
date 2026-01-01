import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/theme';
import { IconSymbol } from './IconSymbol';
import { useNetworkState } from '@/hooks/useNetworkState';

interface OfflineBannerProps {
  /** Optional pending mutation count to display */
  pendingCount?: number;
}

/**
 * Banner displayed when the device is offline.
 * Shows pending mutation count if available.
 */
export function OfflineBanner({ pendingCount }: OfflineBannerProps) {
  const { theme } = useTheme();
  const { isConnected } = useNetworkState();

  if (isConnected) {
    return null;
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.warning }]}>
      <IconSymbol name="wifi.slash" color="#000" size={14} />
      <Text style={styles.text}>
        You're offline
        {pendingCount && pendingCount > 0 ? ` • ${pendingCount} pending` : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    gap: 6,
  },
  text: {
    color: '#000',
    fontSize: 12,
    fontWeight: '600',
  },
});

export default OfflineBanner;
