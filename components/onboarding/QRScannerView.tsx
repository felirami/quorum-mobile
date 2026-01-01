/**
 * QRScannerView - Scan QR code to import private key
 *
 * Uses expo-camera to scan QR codes containing hex private keys.
 * The QR code should contain just the hex string (no prefix).
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useTheme } from '@/theme';
import { IconSymbol } from '@/components/ui/IconSymbol';

interface QRScannerViewProps {
  onScan: (data: string) => void;
  onBack: () => void;
  isLoading?: boolean;
  error?: string | null;
}

export default function QRScannerView({
  onScan,
  onBack,
  isLoading = false,
  error,
}: QRScannerViewProps) {
  const { theme } = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const styles = createStyles(theme);

  const handleBarCodeScanned = useCallback(
    ({ data }: { data: string }) => {
      if (scanned || isLoading) return;

      // Validate that the scanned data looks like a hex private key
      // Ed448 private key is 57 bytes = 114 hex characters
      const cleanData = data.trim().toLowerCase();
      if (!/^[0-9a-f]+$/i.test(cleanData)) {
        // Not a hex string - ignore
        return;
      }

      if (cleanData.length < 100 || cleanData.length > 120) {
        // Wrong length for Ed448 key - ignore
        return;
      }

      setScanned(true);
      onScan(cleanData);
    },
    [scanned, isLoading, onScan]
  );

  // Reset scanned state when error occurs so user can try again
  useEffect(() => {
    if (error) {
      setScanned(false);
    }
  }, [error]);

  if (!permission) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.statusText}>Checking camera permissions...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={onBack}>
            <IconSymbol name="chevron.left" size={20} color={theme.colors.textMain} />
            <Text style={styles.backButtonText}>Back</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.permissionContainer}>
          <IconSymbol name="camera.fill" size={48} color={theme.colors.textMuted} />
          <Text style={styles.permissionTitle}>Camera Access Required</Text>
          <Text style={styles.permissionText}>
            To scan a QR code, Quorum needs access to your camera.
          </Text>
          <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
            <Text style={styles.permissionButtonText}>Grant Permission</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <IconSymbol name="chevron.left" size={20} color="#fff" />
          <Text style={[styles.backButtonText, { color: '#fff' }]}>Back</Text>
        </TouchableOpacity>
      </View>

      <CameraView
        style={styles.camera}
        facing="back"
        barcodeScannerSettings={{
          barcodeTypes: ['qr'],
        }}
        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
      >
        <View style={styles.overlay}>
          <View style={styles.scanArea}>
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />
          </View>
        </View>

        <View style={styles.instructions}>
          <Text style={styles.instructionTitle}>Scan Private Key QR Code</Text>
          <Text style={styles.instructionText}>
            Point your camera at the QR code displayed in your desktop Quorum settings.
          </Text>

          {isLoading && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color="#fff" />
              <Text style={styles.loadingText}>Importing account...</Text>
            </View>
          )}

          {error && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity onPress={() => setScanned(false)}>
                <Text style={styles.retryText}>Tap to try again</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </CameraView>
    </View>
  );
}

const createStyles = (theme: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: '#000',
    },
    header: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 10,
      paddingTop: 20,
      paddingHorizontal: 16,
    },
    backButton: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 8,
    },
    backButtonText: {
      fontSize: 16,
      color: theme.colors.textMain,
      fontFamily: theme.fonts.medium.fontFamily,
      marginLeft: 4,
    },
    camera: {
      flex: 1,
    },
    overlay: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    scanArea: {
      width: 250,
      height: 250,
      position: 'relative',
    },
    corner: {
      position: 'absolute',
      width: 30,
      height: 30,
      borderColor: '#fff',
    },
    cornerTL: {
      top: 0,
      left: 0,
      borderTopWidth: 3,
      borderLeftWidth: 3,
    },
    cornerTR: {
      top: 0,
      right: 0,
      borderTopWidth: 3,
      borderRightWidth: 3,
    },
    cornerBL: {
      bottom: 0,
      left: 0,
      borderBottomWidth: 3,
      borderLeftWidth: 3,
    },
    cornerBR: {
      bottom: 0,
      right: 0,
      borderBottomWidth: 3,
      borderRightWidth: 3,
    },
    instructions: {
      position: 'absolute',
      bottom: 80,
      left: 24,
      right: 24,
      alignItems: 'center',
    },
    instructionTitle: {
      fontSize: 20,
      color: '#fff',
      fontFamily: theme.fonts.bold.fontFamily,
      fontWeight: theme.fonts.bold.fontWeight,
      textAlign: 'center',
      marginBottom: 8,
    },
    instructionText: {
      fontSize: 14,
      color: 'rgba(255, 255, 255, 0.7)',
      fontFamily: theme.fonts.regular.fontFamily,
      textAlign: 'center',
      lineHeight: 20,
    },
    loadingContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 16,
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 8,
    },
    loadingText: {
      fontSize: 14,
      color: '#fff',
      fontFamily: theme.fonts.medium.fontFamily,
      marginLeft: 8,
    },
    errorContainer: {
      marginTop: 16,
      backgroundColor: 'rgba(239, 68, 68, 0.9)',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderRadius: 8,
      alignItems: 'center',
    },
    errorText: {
      fontSize: 14,
      color: '#fff',
      fontFamily: theme.fonts.regular.fontFamily,
      textAlign: 'center',
    },
    retryText: {
      fontSize: 14,
      color: '#fff',
      fontFamily: theme.fonts.medium.fontFamily,
      marginTop: 8,
      textDecorationLine: 'underline',
    },
    permissionContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 32,
      backgroundColor: theme.colors.background,
    },
    permissionTitle: {
      fontSize: 20,
      color: theme.colors.textStrong,
      fontFamily: theme.fonts.bold.fontFamily,
      fontWeight: theme.fonts.bold.fontWeight,
      marginTop: 16,
      marginBottom: 8,
      textAlign: 'center',
    },
    permissionText: {
      fontSize: 14,
      color: theme.colors.textSubtle,
      fontFamily: theme.fonts.regular.fontFamily,
      textAlign: 'center',
      lineHeight: 20,
      marginBottom: 24,
    },
    permissionButton: {
      backgroundColor: theme.colors.primary,
      paddingHorizontal: 24,
      paddingVertical: 12,
      borderRadius: 8,
    },
    permissionButtonText: {
      fontSize: 16,
      color: '#fff',
      fontFamily: theme.fonts.medium.fontFamily,
    },
    statusText: {
      fontSize: 14,
      color: theme.colors.textSubtle,
      fontFamily: theme.fonts.regular.fontFamily,
      marginTop: 16,
    },
  });
