import BrowserModal from '@/components/BrowserModal';
import UnifiedProfileScreen from '@/components/UnifiedProfileScreen';
import WarpcastWalletImportModal from '@/components/WarpcastWalletImportModal';
import { useTheme } from '@/theme';
import { Stack } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';

export default function ProfileAccountScreen() {
  const { theme } = useTheme();
  const [warpcastImportVisible, setWarpcastImportVisible] = useState(false);
  const [selectedMiniApp, setSelectedMiniApp] = useState<{
    url: string;
    isQNative: boolean;
    timestamp: number;
  } | null>(null);

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Profile',
          // Override layout-level transparent header on iOS — see the
          // comment in profile/index.tsx for the rationale.
          headerTransparent: false,
          headerShadowVisible: false,
          // Match body background so the header reads as a continuous
          // surface (UnifiedProfileScreen renders against
          // theme.colors.background).
          headerStyle: { backgroundColor: theme.colors.background },
          headerBlurEffect: undefined,
        }}
      />
      <UnifiedProfileScreen
        onOpenWarpcastImport={() => setWarpcastImportVisible(true)}
      />

      <BrowserModal
        visible={selectedMiniApp !== null}
        url={selectedMiniApp?.url ?? ''}
        isQNative={selectedMiniApp?.isQNative ?? false}
        timestamp={selectedMiniApp?.timestamp ?? 0}
        onClose={() => setSelectedMiniApp(null)}
      />

      <WarpcastWalletImportModal
        visible={warpcastImportVisible}
        onClose={() => setWarpcastImportVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
