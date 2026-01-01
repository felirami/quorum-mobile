// Crypto polyfill - must be first import
import { logger } from '@quilibrium/quorum-shared';
import 'react-native-get-random-values';

// Background task registration - must be imported early before any React components
// This registers the background fetch task with the native module
import '../services/notifications/backgroundTask';

// Log environment check at startup - remove after verifying
console.log('[App] __DEV__:', typeof __DEV__ !== 'undefined' ? __DEV__ : 'undefined');
console.log('[App] logger.isEnabled():', logger.isEnabled());

import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { useFonts } from 'expo-font';
import { Slot, router, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';

// Prevent the splash screen from auto-hiding
SplashScreen.preventAutoHideAsync();

import {
  ApiClientProvider,
  AuthProvider,
  StorageProvider,
  WebSocketProvider,
  useAuth,
} from '@/context';
import { queryConfig } from '@/services/api';
import { queryPersister } from '@/services/offline';
import {
  initializeNotifications,
  registerBackgroundFetch,
  setupNotificationResponseListener,
} from '@/services/notifications';
import { CustomThemeProvider, useTheme } from '@/theme';

// Wrapper to inject auth info into ApiClientProvider
function AuthAwareApiProvider({ children }: { children: React.ReactNode }) {
  const { user, signMessage } = useAuth();
  return (
    <ApiClientProvider
      userAddress={user?.address}
      signMessage={signMessage}
    >
      {children}
    </ApiClientProvider>
  );
}

// Auth-based routing component
function AuthRouter() {
  const { authState } = useAuth();
  const segments = useSegments();
  const { isDark, theme } = useTheme();

  // Track if we're currently navigating to prevent duplicate calls
  const isNavigatingRef = React.useRef(false);
  const splashHiddenRef = React.useRef(false);
  const notificationsInitializedRef = React.useRef(false);

  // Check if we're in the onboarding route group
  const inOnboarding = segments[0] === '(onboarding)';

  logger.log('AuthRouter:', { authState, inOnboarding, segments: segments.join('/') });

  // Initialize notifications when user is authenticated
  React.useEffect(() => {
    if (authState !== 'authenticated' || notificationsInitializedRef.current) {
      return;
    }

    notificationsInitializedRef.current = true;

    const initNotifications = async () => {
      try {
        // Request permissions and set up notification channel
        const granted = await initializeNotifications();
        if (granted) {
          logger.log('[App] Notifications initialized');

          // Register background fetch task
          const registered = await registerBackgroundFetch();
          if (registered) {
            logger.log('[App] Background fetch registered');
          }
        }
      } catch (error) {
        logger.log('[App] Failed to initialize notifications:', error);
      }
    };

    initNotifications();

    // Set up notification tap handler
    const subscription = setupNotificationResponseListener();
    return () => {
      subscription.remove();
    };
  }, [authState]);

  // Hide splash screen once auth state is determined
  React.useEffect(() => {
    if (authState !== 'loading' && !splashHiddenRef.current) {
      splashHiddenRef.current = true;
      SplashScreen.hideAsync();
    }
  }, [authState]);

  // Handle navigation based on auth state
  React.useEffect(() => {
    if (authState === 'loading') {
      return;
    }

    // Prevent duplicate navigation
    if (isNavigatingRef.current) {
      return;
    }

    // Navigate to onboarding if unauthenticated and not already there
    if (authState === 'unauthenticated' && !inOnboarding) {
      logger.log('Redirecting to onboarding');
      isNavigatingRef.current = true;
      setTimeout(() => {
        router.replace('/(onboarding)');
        setTimeout(() => {
          isNavigatingRef.current = false;
        }, 500);
      }, 50);
      return;
    }

    // Navigate to home if authenticated and still in onboarding
    if (authState === 'authenticated' && inOnboarding) {
      logger.log('Redirecting to home');
      isNavigatingRef.current = true;
      setTimeout(async () => {
        router.replace('/');
        // Force app reload to cleanly transition from onboarding to main app
        const { reloadAppAsync } = await import('expo');
        await reloadAppAsync();
      }, 50);
      return;
    }
  }, [authState, inOnboarding]);

  // Show loading overlay during auth loading or pending redirects
  // This prevents flash of wrong UI before navigation completes
  const shouldShowLoading =
    authState === 'loading' ||
    (authState === 'unauthenticated' && !inOnboarding) ||
    (authState === 'authenticated' && inOnboarding);

  // Always render Slot (so routes are mounted for navigation), but overlay with loading when needed
  return (
    <View style={{ flex: 1 }}>
      <Slot />
      {shouldShowLoading && (
        <View style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: isDark ? '#0a0a0a' : '#f5f5f5',
        }}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      )}
    </View>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: queryConfig.staleTime.feed,
      gcTime: queryConfig.gcTime,
      retry: queryConfig.retry,
    },
  },
});

function StatusBarWrapper() {
  const { isDark } = useTheme();
  return <StatusBar style={isDark ? 'light' : 'dark'} />;
}

export default function RootLayout() {
  const [loaded] = useFonts({
    AtAero: require('../assets/fonts/AtAeroVARVF.ttf'),
  });

  if (!loaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{
          persister: queryPersister,
          maxAge: 24 * 60 * 60 * 1000, // 24 hours
        }}
      >
        <CustomThemeProvider defaultAccentColor="blue">
          <StorageProvider>
            <AuthProvider>
              <AuthAwareApiProvider>
                <WebSocketProvider>
                  <AuthRouter />
                </WebSocketProvider>
              </AuthAwareApiProvider>
            </AuthProvider>
          </StorageProvider>
          <StatusBarWrapper />
        </CustomThemeProvider>
      </PersistQueryClientProvider>
    </GestureHandlerRootView>
  );
}
