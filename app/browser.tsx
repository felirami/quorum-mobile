import { logger } from '@quilibrium/quorum-shared';
import TransactionWarningModal from '@/components/TransactionWarningModal';
import { IconSymbol } from '@/components/ui/IconSymbol';
import { useTheme } from '@/theme';
import { useMiniAppBridge } from '@/services/miniapp';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import WebView from 'react-native-webview';

export default function BrowserScreen() {
  const { url, isQNative, name } = useLocalSearchParams<{
    url: string;
    isQNative?: string;
    name?: string;
  }>();
  const router = useRouter();
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const webViewRef = useRef<WebView>(null);

  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [currentUrl, setCurrentUrl] = useState(url || '');
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState(name || '');
  const [showTransactionWarning, setShowTransactionWarning] = useState(false);
  const [warningType, setWarningType] = useState<'simulation-failed' | 'no-entitlements' | 'not-declared' | 'ok'>('simulation-failed');
  const [showSplash, setShowSplash] = useState(true);

  const isQNativeMode = isQNative === 'true';

  // Extract domain from URL
  const domain = useMemo(() => {
    try {
      return new URL(url || '').hostname;
    } catch {
      return url || '';
    }
  }, [url]);

  // Handle mini app close
  const handleMiniAppClose = useCallback(() => {
    router.back();
  }, [router]);

  // Handle mini app ready
  const handleMiniAppReady = useCallback(() => {
    logger.log('[Browser] Mini app ready');
    setShowSplash(false);
  }, []);

  // MiniApp bridge - uses Comlink to expose SDK to mini apps
  logger.log('[Browser] Setting up MiniApp bridge for domain:', domain);
  const {
    onMessage,
    primaryButton,
    isReady,
    backEnabled,
    triggerBack,
    emit,
  } = useMiniAppBridge({
    webViewRef,
    domain,
    url: currentUrl,
    onReady: handleMiniAppReady,
    onClose: handleMiniAppClose,
  });
  logger.log('[Browser] MiniApp bridge setup complete');

  const handleNavigationStateChange = (navState: any) => {
    setCanGoBack(navState.canGoBack);
    setCanGoForward(navState.canGoForward);
    setCurrentUrl(navState.url);
    if (navState.title && !name) {
      setTitle(navState.title);
    }
    setLoading(navState.loading);
  };

  const handleGoBack = () => {
    // If mini app has back enabled, trigger that first
    if (backEnabled) {
      triggerBack();
      return;
    }
    if (webViewRef.current && canGoBack) {
      webViewRef.current.goBack();
    }
  };

  const handleGoForward = () => {
    if (webViewRef.current && canGoForward) {
      webViewRef.current.goForward();
    }
  };

  const handleRefresh = () => {
    if (webViewRef.current) {
      webViewRef.current.reload();
    }
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: currentUrl,
        title: title,
      });
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  const handleOpenInBrowser = () => {
    // In a real app, you would use Linking.openURL(currentUrl)
    // For now, we'll just go back
    router.back();
  };

  // Handle primary button press
  const handlePrimaryButtonPress = useCallback(() => {
    emit('primary_button_clicked');
  }, [emit]);

  const styles = createStyles(theme, isDark, insets, isQNativeMode);

  // Extract domain from URL for display
  const getDomain = (url: string, isQNative: boolean) => {
    try {
      const domain = new URL(url).hostname;
      return domain.replace('www.', '');
    } catch {
      return url;
    }
  };

  if (!url) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>No URL provided</Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Browser Header */}
      <View style={[styles.header, isQNativeMode && styles.headerQNative]}>
        <View style={styles.urlContainer}>
          <TouchableOpacity onPress={() => router.back()} style={styles.closeButton}>
            <IconSymbol name="xmark" size={20} color={theme.colors.textMain} />
          </TouchableOpacity>

          <View style={styles.secureIndicator}>
            <IconSymbol
              name="lock.fill"
              size={12}
              color={isQNativeMode ? theme.colors.info : (currentUrl.startsWith('https') ? theme.colors.success : theme.colors.textMuted)}
            />
          </View>
          <View style={styles.urlTextContainer}>
            <Text style={styles.domainText} numberOfLines={1}>
              {name || getDomain(currentUrl, isQNativeMode)}
            </Text>
            {title && title !== name && (
              <Text style={styles.pageTitle} numberOfLines={1}>
                {getDomain(currentUrl, isQNativeMode)}
              </Text>
            )}
          </View>

          <TouchableOpacity onPress={handleRefresh} style={styles.headerButton}>
            <IconSymbol name="arrow.clockwise" size={18} color={theme.colors.textMuted} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Loading indicator */}
      {loading && !showSplash && (
        <View style={styles.loadingBar}>
          <View style={styles.loadingProgress} />
        </View>
      )}

      {/* WebView */}
      <View style={styles.webViewContainer}>
        <WebView
          ref={webViewRef}
          source={{ uri: currentUrl }}
          onNavigationStateChange={handleNavigationStateChange}
          onMessage={(e) => {
            onMessage(e);
          }}
          startInLoadingState
          renderLoading={() => (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={theme.colors.primary} />
            </View>
          )}
          style={styles.webView}
          // Enable back/forward gestures based on mini app state
          allowsBackForwardNavigationGestures={!backEnabled}
          // Security settings
          javaScriptEnabled
          domStorageEnabled
          mixedContentMode="compatibility"
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          // Performance
          cacheEnabled
          decelerationRate={0.998}
          nestedScrollEnabled
          bounces={false}
          overScrollMode="never"
          // Set user agent for mini app detection
          userAgent="quorum-mobile"
        />

        {/* Splash Screen Overlay */}
        {showSplash && (
          <View style={styles.splashOverlay}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
            <Text style={styles.splashText}>Loading {name || 'app'}...</Text>
          </View>
        )}
      </View>

      {/* Primary Button (if set by mini app) */}
      {primaryButton && !primaryButton.hidden && (
        <View style={styles.primaryButtonContainer}>
          <TouchableOpacity
            style={[
              styles.primaryButton,
              primaryButton.disabled && styles.primaryButtonDisabled,
            ]}
            onPress={handlePrimaryButtonPress}
            disabled={primaryButton.disabled || primaryButton.loading}
          >
            {primaryButton.loading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.primaryButtonText}>{primaryButton.text}</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Navigation Bar */}
      <View style={styles.navigationBar}>
        <TouchableOpacity
          onPress={handleGoBack}
          disabled={!canGoBack && !backEnabled}
          style={styles.navButton}
        >
          <IconSymbol
            name="chevron.left"
            size={24}
            color={(canGoBack || backEnabled) ? theme.colors.textMain : theme.colors.textMuted}
          />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleGoForward}
          disabled={!canGoForward}
          style={styles.navButton}
        >
          <IconSymbol
            name="chevron.right"
            size={24}
            color={canGoForward ? theme.colors.textMain : theme.colors.textMuted}
          />
        </TouchableOpacity>

        <TouchableOpacity onPress={handleShare} style={styles.navButton}>
          <IconSymbol name="square.and.arrow.up" size={20} color={theme.colors.textMain} />
        </TouchableOpacity>

        <TouchableOpacity onPress={handleOpenInBrowser} style={styles.navButton}>
          <IconSymbol name="safari" size={20} color={theme.colors.textMain} />
        </TouchableOpacity>
      </View>

    </View>
  );
}

const createStyles = (theme: any, isDark: boolean, insets: any, isQNative: boolean) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
      paddingTop: insets.top,
    },
    errorContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: theme.colors.background,
    },
    errorText: {
      fontSize: 16,
      color: theme.colors.textMain,
      marginBottom: 20,
    },
    header: {
      paddingHorizontal: 16,
      paddingBottom: 12,
      paddingTop: 8,
    },
    headerQNative: {
      backgroundColor: theme.colors.info,
    },
    urlContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.colors.surface2,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    closeButton: {
      marginRight: 12,
      padding: 4,
    },
    headerButton: {
      padding: 4,
    },
    backButton: {
      marginRight: 12,
      padding: 4,
    },
    backButtonText: {
      color: theme.colors.primary,
      fontSize: 16,
    },
    secureIndicator: {
      marginRight: 8,
    },
    urlTextContainer: {
      flex: 1,
    },
    domainText: {
      fontSize: 14,
      fontFamily: theme.fonts.medium.fontFamily,
      fontWeight: theme.fonts.medium.fontWeight,
      color: theme.colors.textMain,
    },
    pageTitle: {
      fontSize: 11,
      color: theme.colors.textMuted,
      marginTop: 2,
    },
    loadingBar: {
      height: 2,
      backgroundColor: theme.colors.surface3,
      overflow: 'hidden',
    },
    loadingProgress: {
      height: '100%',
      width: '30%',
      backgroundColor: theme.colors.primary,
    },
    webViewContainer: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    webView: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    loadingContainer: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.background,
    },
    splashOverlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.background,
      zIndex: 10,
    },
    splashText: {
      marginTop: 16,
      fontSize: 16,
      color: theme.colors.textMuted,
    },
    primaryButtonContainer: {
      padding: 16,
      paddingBottom: 8,
      backgroundColor: theme.colors.background,
    },
    primaryButton: {
      backgroundColor: theme.colors.primary,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryButtonDisabled: {
      opacity: 0.5,
    },
    primaryButtonText: {
      color: '#fff',
      fontSize: 16,
      fontFamily: theme.fonts.medium.fontFamily,
      fontWeight: theme.fonts.medium.fontWeight,
    },
    navigationBar: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      alignItems: 'center',
      paddingVertical: 12,
      paddingBottom: Math.max(12, insets.bottom),
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
      backgroundColor: theme.colors.background,
    },
    navButton: {
      padding: 8,
    },
  });
