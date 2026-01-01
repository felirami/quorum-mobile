import { BaseModal } from '@/components/shared';
import { Button } from '@/components/ui/Button';
import { IconSymbol } from '@/components/ui/IconSymbol';
import { useMiniAppBridge } from '@/services/miniapp';
import { useTheme } from '@/theme';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Modal,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import WebView from 'react-native-webview';

interface BrowserModalProps {
  visible: boolean;
  url: string;
  onClose: () => void;
  isQNative?: boolean;
  onShowTransactionWarning?: (warningType: 'simulation-failed' | 'no-entitlements' | 'not-declared' | 'ok') => void;
  /** Timestamp for cache busting - pass Date.now() when launching to force refresh */
  timestamp?: number;
}

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function BrowserModal({ visible, url, onClose, isQNative = false, onShowTransactionWarning, timestamp = 0 }: BrowserModalProps) {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const webViewRef = useRef<WebView>(null);

  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [currentUrl, setCurrentUrl] = useState(url);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [warningType, setWarningType] = useState<'simulation-failed' | 'no-entitlements' | 'not-declared' | 'ok'>('ok');
  const [showSplash, setShowSplash] = useState(true);
  const [showFarcasterPrompt, setShowFarcasterPrompt] = useState(false);

  // Cache busting: increment revision when same URL is launched again with new timestamp
  const [revision, setRevision] = useState(0);
  const prevLaunch = useRef({ url, timestamp });

  useEffect(() => {
    const isSameUrl = prevLaunch.current.url === url;
    const isNewLaunch = prevLaunch.current.timestamp !== timestamp && timestamp > 0;

    if (isSameUrl && isNewLaunch) {
      setRevision((r) => r + 1);
    }

    prevLaunch.current = { url, timestamp };
  }, [timestamp, url]);

  // Update URL when prop changes - use useLayoutEffect to ensure URL is set before render
  useLayoutEffect(() => {
    if (visible && url) {
      setCurrentUrl(url);
      setShowSplash(true); // Reset splash when opening new URL
      setShowFarcasterPrompt(false); // Reset prompt when opening new URL
    }
  }, [visible, url]);

  // Extract domain from URL for MiniApp bridge
  const domain = useMemo(() => {
    try {
      return new URL(url || '').hostname;
    } catch {
      return url || '';
    }
  }, [url]);

  // Handle mini app close
  const handleMiniAppClose = useCallback(() => {
    onClose();
  }, [onClose]);

  // Handle mini app ready
  const handleMiniAppReady = useCallback(() => {
    setShowSplash(false);
  }, []);

  // Handle Farcaster required
  const handleFarcasterRequired = useCallback(() => {
    setShowFarcasterPrompt(true);
  }, []);

  // MiniApp bridge - uses Comlink to expose SDK to mini apps
  const {
    onMessage,
    primaryButton,
    isReady,
    backEnabled,
    triggerBack,
    emit,
    farcasterRequired,
    bridgeReady,
  } = useMiniAppBridge({
    webViewRef,
    domain,
    url: currentUrl,
    onReady: handleMiniAppReady,
    onClose: handleMiniAppClose,
    onFarcasterRequired: handleFarcasterRequired,
  });

  // Fallback timeout: hide splash after 2 seconds if ready() hasn't been called
  useEffect(() => {
    if (!showSplash || !visible) return;

    const timeout = setTimeout(() => {
      if (showSplash) {
        setShowSplash(false);
      }
    }, 2000);

    return () => clearTimeout(timeout);
  }, [showSplash, visible]);

  // Handle primary button press
  const handlePrimaryButtonPress = useCallback(() => {
    emit('primary_button_clicked');
  }, [emit]);

  // Handle WebView messages (Comlink)
  const handleWebViewMessage = useCallback((e: any) => {
    try {
      const data = JSON.parse(e.nativeEvent.data);
      if (data.type === '__CONSOLE__') {
        // Ignore console messages from WebView
        return;
      }
    } catch (e) {
      // Not JSON or not a console message, pass through
    }
    // Forward to Comlink handler
    onMessage(e);
  }, [onMessage]);

  const handleNavigationStateChange = (navState: any) => {
    setCanGoBack(navState.canGoBack);
    setCanGoForward(navState.canGoForward);
    setCurrentUrl(navState.url);
    setTitle(navState.title);
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
    onClose();
  };

  const styles = createStyles(theme, isDark, insets, isQNative);

  const getDomain = (url: string, isQNative: boolean) => {
    try {
      const domain = new URL(url).hostname;
      return isQNative ? domain.replace('www.', '').replace('swap.cow.fi', 'cowswap.q') : domain.replace('www.', '');
    } catch {
      return url;
    }
  };

  return (
    <BaseModal
      visible={visible}
      onClose={onClose}
      height={0.95}
      showHandle={true}
      handleContainerStyle={isQNative ? styles.handleQNative : undefined}
      fillHeight={true}
    >
      {/* Browser Header */}
      <View style={[styles.header, isQNative && styles.headerQNative]}>
        <View style={styles.urlContainer}>
          <View style={styles.secureIndicator}>
            <IconSymbol
              name="lock.fill"
              size={12}
              color={isQNative ? theme.colors.info : (currentUrl.startsWith('https') ? theme.colors.success : theme.colors.textMuted)}
            />
          </View>
          <View style={styles.urlTextContainer}>
            <Text style={styles.domainText} numberOfLines={1}>
              {getDomain(currentUrl, isQNative)}
            </Text>
            {title && (
              <Text style={styles.pageTitle} numberOfLines={1}>
                {title}
              </Text>
            )}
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <IconSymbol name="xmark.circle.fill" size={24} color={theme.colors.textMuted} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Loading indicator */}
      {loading && !showSplash && (
        <View style={styles.loadingBar}>
          <View style={styles.loadingProgress} />
        </View>
      )}

      {/* WebView - only render when bridge is ready to ensure SDK is exposed before page loads */}
      <View style={styles.webViewContainer}>
        {bridgeReady && (
          <WebView
            key={revision}
            ref={webViewRef}
            source={{ uri: currentUrl }}
            onNavigationStateChange={handleNavigationStateChange}
            onMessage={handleWebViewMessage}
            startInLoadingState
            renderLoading={() => (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
              </View>
            )}
            style={styles.webView}
            // User agent - use "warpcast" for Farcaster mini app compatibility
            userAgent="warpcast"
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
            // Disable zoom controls (matching Farcaster)
            setBuiltInZoomControls={false}
            setDisplayZoomControls={false}
            textZoom={100}
          />
        )}

        {/* Splash Screen Overlay */}
        {showSplash && (
          <View style={styles.splashOverlay}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
            <Text style={styles.splashText}>Loading app...</Text>
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

        <TouchableOpacity onPress={handleRefresh} style={styles.navButton}>
          <IconSymbol name="arrow.clockwise" size={20} color={theme.colors.textMain} />
        </TouchableOpacity>

        <TouchableOpacity onPress={handleShare} style={styles.navButton}>
          <IconSymbol name="square.and.arrow.up" size={20} color={theme.colors.textMain} />
        </TouchableOpacity>

        <TouchableOpacity onPress={handleOpenInBrowser} style={styles.navButton}>
          <IconSymbol name="safari" size={20} color={theme.colors.textMain} />
        </TouchableOpacity>
      </View>

      {/* Farcaster Required Modal */}
      <Modal
        visible={showFarcasterPrompt}
        transparent
        animationType="fade"
        onRequestClose={() => setShowFarcasterPrompt(false)}
      >
        <TouchableOpacity
          style={styles.farcasterModalOverlay}
          activeOpacity={1}
          onPress={() => setShowFarcasterPrompt(false)}
        >
          <View style={styles.farcasterModalContent} onStartShouldSetResponder={() => true}>
              <View style={styles.farcasterModalIcon}>
                <IconSymbol name="person.crop.circle.badge.exclamationmark" size={48} color={theme.colors.warning} />
              </View>
              <Text style={styles.farcasterModalTitle}>Farcaster Account Required</Text>
              <Text style={styles.farcasterModalMessage}>
                This app requires a Farcaster account to function properly. You can import your Farcaster account in Settings, or continue with limited functionality.
              </Text>
              <View style={styles.farcasterModalButtons}>
                <Button
                  variant="secondary"
                  onPress={() => {
                    setShowFarcasterPrompt(false);
                    // Delay close to let modal animation complete
                    setTimeout(onClose, 100);
                  }}
                  style={styles.farcasterModalButton}
                >
                  Close App
                </Button>
                <Button
                  variant="primary"
                  onPress={() => {
                    setShowFarcasterPrompt(false);
                    // TODO: Navigate to settings to import Farcaster
                    setTimeout(onClose, 100);
                  }}
                  style={styles.farcasterModalButton}
                >
                  Go to Settings
                </Button>
              </View>
              <TouchableOpacity
                onPress={() => {
                  setShowFarcasterPrompt(false);
                  setShowSplash(false); // Also dismiss splash to show the app
                }}
                style={styles.continueAnywayButton}
              >
                <Text style={styles.continueAnywayText}>Continue Anyway</Text>
              </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </BaseModal>
  );
}

const createStyles = (theme: any, isDark: boolean, insets: any, isQNative: boolean) =>
  StyleSheet.create({
    handleQNative: {
      backgroundColor: theme.colors.info,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
    },
    header: {
      paddingHorizontal: 16,
      paddingBottom: 12,
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
    closeButton: {
      marginLeft: 8,
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
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
      backgroundColor: theme.colors.background,
    },
    navButton: {
      padding: 8,
    },
    farcasterModalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.85)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    },
    farcasterModalContent: {
      backgroundColor: theme.colors.surface,
      borderRadius: 16,
      padding: 24,
      width: '100%',
      maxWidth: 340,
      alignItems: 'center',
    },
    farcasterModalIcon: {
      marginBottom: 16,
    },
    farcasterModalTitle: {
      fontSize: 18,
      fontFamily: theme.fonts.medium.fontFamily,
      fontWeight: theme.fonts.medium.fontWeight,
      color: theme.colors.textMain,
      textAlign: 'center',
      marginBottom: 12,
    },
    farcasterModalMessage: {
      fontSize: 14,
      color: theme.colors.textMuted,
      textAlign: 'center',
      lineHeight: 20,
      marginBottom: 24,
    },
    farcasterModalButtons: {
      flexDirection: 'row',
      gap: 12,
      width: '100%',
    },
    farcasterModalButton: {
      flex: 1,
    },
    continueAnywayButton: {
      marginTop: 16,
      paddingVertical: 8,
    },
    continueAnywayText: {
      fontSize: 14,
      color: theme.colors.textMuted,
      textDecorationLine: 'underline',
    },
  });
