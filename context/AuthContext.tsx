/**
 * AuthContext - Manages user authentication state
 *
 * Provides:
 * - User address and profile info
 * - Authentication state (logged in, onboarding, etc.)
 * - Sign message capability for API requests (ed448)
 */

import { logger } from '@quilibrium/quorum-shared';
import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useEffect,
} from 'react';
import { mmkvStorage, clearAllMMKVStorage } from '../services/offline/storage';
import { getPrivateKey, getDeviceKeyset, clearAllSecureStorage, getFarcasterAuthToken, getFarcasterCustodyKey, storeFarcasterAuthToken } from '../services/onboarding/secureStorage';
import { refreshFarcasterAuthToken } from '../services/onboarding/farcasterService';
import { initializeEncryptionKeys, uploadUserRegistration } from '../services/onboarding/keyService';
import { NativeSigningProvider } from '../services/crypto';
import { getConfig, saveConfig } from '../services/config';

// Auth state types
export type AuthState = 'loading' | 'unauthenticated' | 'onboarding' | 'authenticated';

export type PrivacyLevel = 'maximum' | 'enhanced' | 'standard';

export interface FarcasterInfo {
  fid: number;
  username: string;
  signerPublicKey: string;
  custodyAddress?: string;  // Ethereum address for Farcaster custody
  pfpUrl?: string;  // Original Farcaster profile image URL (not data URI)
}

export interface UserInfo {
  address: string;
  publicKey: string;
  displayName?: string;
  username?: string;
  bio?: string;
  profileImage?: string;
  privacyLevel: PrivacyLevel;
  farcaster?: FarcasterInfo;
}

interface AuthContextValue {
  // State
  authState: AuthState;
  user: UserInfo | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  farcasterAuthToken: string | null;  // Auth token for Farcaster API calls

  // Actions
  signIn: (userInfo: UserInfo) => Promise<void>;
  signOut: () => Promise<void>;
  updateProfile: (updates: Partial<UserInfo>) => void;
  signMessage: (message: string) => Promise<string>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const STORAGE_KEYS = {
  USER: 'auth:user',
  AUTH_STATE: 'auth:state',
} as const;

interface AuthProviderProps {
  children: React.ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [authState, setAuthState] = useState<AuthState>('loading');
  const [user, setUser] = useState<UserInfo | null>(null);
  const [farcasterAuthToken, setFarcasterAuthToken] = useState<string | null>(null);

  // Load persisted auth state on mount
  useEffect(() => {
    const loadAuthState = async () => {
      try {
        const storedUser = mmkvStorage.getItem(STORAGE_KEYS.USER);
        const storedState = mmkvStorage.getItem(STORAGE_KEYS.AUTH_STATE);

        if (storedUser && storedState === 'authenticated') {
          const parsedUser = JSON.parse(storedUser) as UserInfo;
          setUser(parsedUser);
          setAuthState('authenticated');

          // Ensure encryption keys exist and registration is uploaded
          // (for users who onboarded before E2E or registration upload was added)
          const keyset = await getDeviceKeyset();
          const privateKey = await getPrivateKey();

          if (!keyset && parsedUser.publicKey) {
            logger.log('[Auth] Initializing missing encryption keys...');
            try {
              const deviceKeyset = await initializeEncryptionKeys(parsedUser.publicKey);
              logger.log('[Auth] Encryption keys initialized successfully');

              // Upload registration to server
              if (privateKey) {
                try {
                  await uploadUserRegistration(
                    parsedUser.address,
                    parsedUser.publicKey,
                    privateKey,
                    deviceKeyset
                  );
                  logger.log('[Auth] Registration uploaded successfully');
                } catch (uploadError) {
                  console.error('[Auth] Failed to upload registration:', uploadError);
                }
              }
            } catch (keyError) {
              console.error('[Auth] Failed to initialize encryption keys:', keyError);
            }
          } else if (keyset && privateKey && parsedUser.publicKey) {
            // Keys exist but registration may not be uploaded yet
            // Try to upload registration (server will handle duplicates)
            logger.log('[Auth] Checking registration upload for existing keyset...');
            try {
              await uploadUserRegistration(
                parsedUser.address,
                parsedUser.publicKey,
                privateKey,
                keyset
              );
              logger.log('[Auth] Registration uploaded/verified successfully');
            } catch (uploadError) {
              // Don't log error as 409 Conflict is expected if already registered
              const errorMsg = uploadError instanceof Error ? uploadError.message : String(uploadError);
              if (!errorMsg.includes('409') && !errorMsg.includes('conflict')) {
                console.error('[Auth] Failed to upload registration:', uploadError);
              }
            }
          }

          // Sync user config from server (profile name, settings, etc.)
          try {
            const config = await getConfig(parsedUser.address);
            logger.log('[Auth] Config synced:', {
              hasName: !!config.name,
              hasProfileImage: !!config.profile_image,
              allowSync: config.allowSync,
            });

            // Update local user info with synced profile data
            if (config.name || config.profile_image) {
              const updatedUser = {
                ...parsedUser,
                displayName: config.name || parsedUser.displayName,
                profileImage: config.profile_image || parsedUser.profileImage,
              };
              setUser(updatedUser);
              mmkvStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(updatedUser));
            }
          } catch (configError) {
            logger.log('[Auth] Config sync failed (non-fatal):', configError);
          }

          // Load Farcaster auth token if available
          try {
            let farcasterToken = await getFarcasterAuthToken();
            if (farcasterToken) {
              setFarcasterAuthToken(farcasterToken);
              logger.log('[Auth] Farcaster auth token loaded');
            } else {
              logger.log('[Auth] No Farcaster auth token found in storage, attempting refresh...');
              // Try to refresh using stored custody key
              const custodyKey = await getFarcasterCustodyKey();
              if (custodyKey) {
                logger.log('[Auth] Custody key found, refreshing auth token...');
                farcasterToken = await refreshFarcasterAuthToken(custodyKey);
                if (farcasterToken) {
                  await storeFarcasterAuthToken(farcasterToken);
                  setFarcasterAuthToken(farcasterToken);
                  logger.log('[Auth] Farcaster auth token refreshed and stored');
                } else {
                  logger.log('[Auth] Failed to refresh Farcaster auth token');
                }
              } else {
                logger.log('[Auth] No custody key available, cannot refresh auth token');
              }
            }
          } catch (tokenError) {
            logger.log('[Auth] Failed to load Farcaster auth token (non-fatal):', tokenError);
          }
        } else {
          setAuthState('unauthenticated');
        }
      } catch (error) {
        console.error('Failed to load auth state:', error);
        setAuthState('unauthenticated');
      }
    };

    loadAuthState();
  }, []);

  const signIn = useCallback(async (userInfo: UserInfo) => {
    try {
      // Persist user info
      mmkvStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(userInfo));
      mmkvStorage.setItem(STORAGE_KEYS.AUTH_STATE, 'authenticated');

      setUser(userInfo);
      setAuthState('authenticated');
    } catch (error) {
      console.error('Failed to sign in:', error);
      throw error;
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      // Clear all MMKV storage (spaces, channels, messages, conversations, auth state)
      clearAllMMKVStorage();

      // Clear secure storage (private keys, mnemonics, onboarding state)
      await clearAllSecureStorage();

      setUser(null);
      setAuthState('unauthenticated');
    } catch (error) {
      console.error('Failed to sign out:', error);
      throw error;
    }
  }, []);

  const updateProfile = useCallback((updates: Partial<UserInfo>) => {
    setUser((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, ...updates };
      mmkvStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(updated));

      // Sync profile changes to server config (if allowSync is enabled)
      // This runs async in background - no need to await
      (async () => {
        try {
          const config = await getConfig(prev.address);
          if (config.allowSync) {
            const configUpdates: { name?: string; profile_image?: string } = {};
            if (updates.displayName !== undefined) {
              configUpdates.name = updates.displayName;
            }
            if (updates.profileImage !== undefined) {
              configUpdates.profile_image = updates.profileImage;
            }

            if (Object.keys(configUpdates).length > 0) {
              await saveConfig({
                ...config,
                ...configUpdates,
              });
              logger.log('[Auth] Profile changes synced to server');
            }
          }
        } catch (error) {
          console.error('[Auth] Failed to sync profile changes:', error);
        }
      })();

      return updated;
    });
  }, []);

  // Sign message for API authentication using ed448 (native Rust implementation)
  // Note: We use a ref to avoid re-creating this callback when user changes,
  // which would cause cascading re-renders in ApiClientProvider
  const userRef = React.useRef(user);
  userRef.current = user;

  // Singleton signing provider instance
  const signingProvider = React.useMemo(() => new NativeSigningProvider(), []);

  const signMessage = useCallback(async (message: string): Promise<string> => {
    if (!userRef.current) {
      throw new Error('User not authenticated');
    }

    const privateKey = await getPrivateKey();
    if (!privateKey) {
      throw new Error('Private key not found');
    }

    // Sign with ed448 using native module
    return signingProvider.signEd448(privateKey, message);
  }, [signingProvider]);

  const value = useMemo<AuthContextValue>(
    () => ({
      authState,
      user,
      isAuthenticated: authState === 'authenticated',
      isLoading: authState === 'loading',
      farcasterAuthToken,
      signIn,
      signOut,
      updateProfile,
      signMessage,
    }),
    [authState, user, farcasterAuthToken, signIn, signOut, updateProfile, signMessage]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export function useUser(): UserInfo | null {
  const { user } = useAuth();
  return user;
}

export function useIsAuthenticated(): boolean {
  const { isAuthenticated } = useAuth();
  return isAuthenticated;
}

export default AuthContext;
