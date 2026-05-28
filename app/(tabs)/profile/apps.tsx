import MiniAppsModal from '@/components/MiniAppsModal';
import BrowserModal from '@/components/BrowserModal';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';

export default function AppsScreen() {
  const [selectedMiniApp, setSelectedMiniApp] = useState<{
    url: string;
    isQNative: boolean;
    timestamp: number;
  } | null>(null);

  return (
    <View style={styles.container}>
      <MiniAppsModal
        visible={true}
        onClose={() => router.back()}
        onOpenMiniApp={(url, isQNative) =>
          setSelectedMiniApp({ url, isQNative, timestamp: Date.now() })
        }
        isRouteMode={true}
      />

      <BrowserModal
        visible={selectedMiniApp !== null}
        url={selectedMiniApp?.url ?? ''}
        isQNative={selectedMiniApp?.isQNative ?? false}
        timestamp={selectedMiniApp?.timestamp ?? 0}
        onClose={() => setSelectedMiniApp(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
