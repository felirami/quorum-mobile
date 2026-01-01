/**
 * OnboardingContext - Manages onboarding flow state
 *
 * Handles:
 * - Step navigation
 * - Key generation/import
 * - Farcaster setup
 * - Profile configuration
 * - Privacy preferences
 * - State persistence for resume
 */

import { getConfig } from '@/services/config';
import {
  generateMnemonic,
  initializeEncryptionKeys,
  keyPairFromHex,
  keyPairFromMnemonic,
  uploadUserRegistration
} from '@/services/onboarding/keyService';
import * as secureStorage from '@/services/onboarding/secureStorage';
import { logger } from '@quilibrium/quorum-shared';
import { useRouter } from 'expo-router';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { PrivacyLevel as AuthPrivacyLevel } from './AuthContext';
import { useAuth } from './AuthContext';

// ============ Types ============

export type OnboardingStep =
  | 'account-setup'
  | 'farcaster-setup'
  | 'profile-setup'
  | 'privacy-setup'
  | 'complete';

export type PrivacyLevel = 'maximum' | 'enhanced' | 'standard';

export interface QuorumKeys {
  publicKey: string;
  address: string;
}

export interface FarcasterAccount {
  fid: number;
  username: string;
  signerPublicKey: string;
  custodyAddress?: string;  // Ethereum address for Farcaster custody
  displayName?: string;     // Pre-fill from Farcaster profile
  pfpUrl?: string;          // Pre-fill from Farcaster profile
}

export interface ProfileData {
  username?: string;
  displayName?: string;
  bio?: string;
  profileImageUri?: string;
}

export interface OnboardingState {
  // Progress tracking
  currentStep: OnboardingStep;
  completedSteps: OnboardingStep[];
  isLoading: boolean;
  error: string | null;

  // Step 1: Account
  quorumKeys: QuorumKeys | null;
  generatedMnemonic: string[] | null; // Temporary, shown once then cleared

  // Step 2: Farcaster (optional)
  farcasterEnabled: boolean;
  farcasterAccount: FarcasterAccount | null;

  // Step 3: Profile (optional)
  profile: ProfileData;

  // Step 4: Privacy
  privacyLevel: PrivacyLevel | null;

  // Import state - set when importing an existing account with synced config
  isImportedAccount: boolean;
  syncedConfig: {
    name?: string;
    profileImage?: string;
    allowSync?: boolean;
    spaceCount?: number;
  } | null;
}

export interface OnboardingContextValue {
  state: OnboardingState;

  // Navigation
  goToStep: (step: OnboardingStep, additionalUpdates?: Partial<OnboardingState>) => void;
  goBack: () => void;
  canGoBack: boolean;

  // Step 1: Account actions
  createNewAccount: () => Promise<void>;
  importFromMnemonic: (words: string[]) => Promise<void>;
  importFromHex: (hexKey: string) => Promise<void>;
  confirmMnemonicBackup: () => void;

  // Step 2: Farcaster actions
  skipFarcaster: () => void;
  setFarcasterAccount: (account: FarcasterAccount) => void;

  // Step 3: Profile actions
  updateProfile: (updates: Partial<ProfileData>) => void;
  skipProfile: () => void;

  // Step 4: Privacy actions
  setPrivacyLevel: (level: PrivacyLevel) => void;

  // Completion - returns user info if successful, null if failed
  completeOnboarding: () => Promise<{
    address: string;
    publicKey: string;
    displayName?: string;
    username?: string;
    bio?: string;
    profileImage?: string;
    privacyLevel: AuthPrivacyLevel;
    farcaster?: {
      fid: number;
      username: string;
      signerPublicKey: string;
    };
  } | null>;

  // Error handling
  clearError: () => void;
}

// ============ Context ============

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

const STEP_ORDER: OnboardingStep[] = [
  'account-setup',
  'farcaster-setup',
  'profile-setup',
  // 'privacy-setup', // Temporarily hidden - default to 'standard'
  'complete',
];

const initialState: OnboardingState = {
  currentStep: 'account-setup',
  completedSteps: [],
  isLoading: false,
  error: null,
  quorumKeys: null,
  generatedMnemonic: null,
  farcasterEnabled: false,
  farcasterAccount: null,
  profile: {},
  privacyLevel: 'standard', // Default to standard (privacy step is hidden)
  isImportedAccount: false,
  syncedConfig: null,
};

// ============ Provider ============

interface OnboardingProviderProps {
  children: React.ReactNode;
}

export function OnboardingProvider({ children }: OnboardingProviderProps) {
  const [state, setState] = useState<OnboardingState>(initialState);
  const router = useRouter();
  const isCompletingRef = useRef(false);
  const isMountedRef = useRef(true);

  // Track mount state to prevent updates after unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Load saved state on mount
  useEffect(() => {
    const loadSavedState = async () => {
      try {
        const saved = await secureStorage.loadOnboardingState();
        if (saved && isMountedRef.current && !isCompletingRef.current) {
          // Only restore state if account was set up (has quorum keys)
          // Otherwise, start fresh to avoid skipping steps
          const hasAccount = saved.quorumAddress && saved.quorumPublicKey;

          if (hasAccount) {
            setState(prev => ({
              ...prev,
              currentStep: saved.currentStep as OnboardingStep,
              completedSteps: saved.completedSteps as OnboardingStep[],
              quorumKeys: {
                address: saved.quorumAddress!,
                publicKey: saved.quorumPublicKey!,
              },
              farcasterEnabled: saved.farcasterEnabled ?? false,
              profile: saved.profile ?? {},
              privacyLevel: saved.privacyLevel as PrivacyLevel | null,
            }));
          } else {
            // Clear invalid saved state and start fresh
            await secureStorage.clearOnboardingState();
          }
        }
      } catch (error) {
        console.error('Failed to load onboarding state:', error);
      }
    };

    loadSavedState();
  }, []);

  // Save state on changes (only when we have quorum keys set up and not completing)
  useEffect(() => {
    // Don't save if completing onboarding or unmounted
    if (isCompletingRef.current || !isMountedRef.current) {
      return;
    }

    const saveState = async () => {
      // Don't save if account not created or if onboarding is complete
      if (!state.quorumKeys || state.currentStep === 'complete') {
        return;
      }

      await secureStorage.saveOnboardingState({
        currentStep: state.currentStep,
        completedSteps: state.completedSteps,
        quorumAddress: state.quorumKeys.address,
        quorumPublicKey: state.quorumKeys.publicKey,
        farcasterEnabled: state.farcasterEnabled,
        farcasterUsername: state.farcasterAccount?.username,
        profile: state.profile,
        privacyLevel: state.privacyLevel ?? undefined,
      });
    };

    saveState();
  }, [state.currentStep, state.completedSteps, state.quorumKeys, state.farcasterEnabled, state.profile, state.privacyLevel]);

  // ============ Navigation ============

  const goToStep = useCallback((step: OnboardingStep, additionalUpdates?: Partial<OnboardingState>) => {
    setState(prev => ({ ...prev, ...additionalUpdates, currentStep: step }));
    router.push(`/(onboarding)/${step}`);
  }, [router]);

  const goBack = useCallback(() => {
    const currentIndex = STEP_ORDER.indexOf(state.currentStep);
    if (currentIndex > 0) {
      const prevStep = STEP_ORDER[currentIndex - 1];
      goToStep(prevStep);
    }
  }, [state.currentStep, goToStep]);

  const canGoBack = useMemo(() => {
    return STEP_ORDER.indexOf(state.currentStep) > 0;
  }, [state.currentStep]);

  const markStepComplete = useCallback((step: OnboardingStep) => {
    setState(prev => ({
      ...prev,
      completedSteps: prev.completedSteps.includes(step)
        ? prev.completedSteps
        : [...prev.completedSteps, step],
    }));
  }, []);

  const goToNextStep = useCallback(() => {
    const currentIndex = STEP_ORDER.indexOf(state.currentStep);
    if (currentIndex < STEP_ORDER.length - 1) {
      markStepComplete(state.currentStep);
      goToStep(STEP_ORDER[currentIndex + 1]);
    }
  }, [state.currentStep, goToStep, markStepComplete]);

  // ============ Step 1: Account ============

  const createNewAccount = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const { mnemonic, keyPair } = generateMnemonic();

      // Store private key securely
      await secureStorage.storePrivateKey(keyPair.privateKey);
      await secureStorage.storeMnemonic(mnemonic);

      setState(prev => ({
        ...prev,
        isLoading: false,
        quorumKeys: {
          publicKey: keyPair.publicKey,
          address: keyPair.address,
        },
        generatedMnemonic: mnemonic,
      }));
    } catch (error) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to create account',
      }));
    }
  }, []);

  const importFromMnemonic = useCallback(async (words: string[]) => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const keyPair = keyPairFromMnemonic(words);

      await secureStorage.storePrivateKey(keyPair.privateKey);
      await secureStorage.storeMnemonic(words);

      // Initialize encryption keys and upload registration early
      // This is needed before we can sync config
      logger.log('[Onboarding] Initializing encryption keys for import...');
      const deviceKeyset = await initializeEncryptionKeys(keyPair.publicKey);
      await uploadUserRegistration(
        keyPair.address,
        keyPair.publicKey,
        keyPair.privateKey,
        deviceKeyset
      );
      logger.log('[Onboarding] Registration uploaded');

      // Try to sync config from server to pre-fill profile data
      let syncedConfig: OnboardingState['syncedConfig'] = null;
      let profileFromConfig: ProfileData = {};

      try {
        logger.log('[Onboarding] Syncing config for imported account...');
        const config = await getConfig(keyPair.address);
        logger.log('[Onboarding] Config fetched:', {
          hasName: !!config.name,
          hasProfileImage: !!config.profile_image,
          allowSync: config.allowSync,
          spaceKeyCount: config.spaceKeys?.length ?? 0,
        });

        // Extract profile data if present to pre-fill
        if (config.name || config.profile_image) {
          profileFromConfig = {
            displayName: config.name,
            profileImageUri: config.profile_image,
          };
          logger.log('[Onboarding] Profile data from config:', profileFromConfig);
        }

        // Store synced config info for reference
        if (config.allowSync && (config.name || config.profile_image || (config.spaceKeys && config.spaceKeys.length > 0))) {
          syncedConfig = {
            name: config.name,
            profileImage: config.profile_image,
            allowSync: config.allowSync,
            spaceCount: config.spaceKeys?.length ?? 0,
          };
          logger.log('[Onboarding] Synced config stored:', syncedConfig);
        }
      } catch (configError) {
        logger.log('[Onboarding] No existing config found (new account):', configError);
      }

      setState(prev => ({
        ...prev,
        isLoading: false,
        quorumKeys: {
          publicKey: keyPair.publicKey,
          address: keyPair.address,
        },
        generatedMnemonic: null, // Don't show mnemonic for imports
        isImportedAccount: true,
        syncedConfig,
        // Pre-fill profile from config if we got any data
        profile: {
          ...prev.profile,
          ...profileFromConfig,
        },
      }));

      // Always proceed through normal onboarding flow for imports
      // This allows user to review/update Farcaster and profile settings
      goToNextStep();
    } catch (error) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Invalid mnemonic phrase',
      }));
    }
  }, [goToNextStep]);

  const importFromHex = useCallback(async (hexKey: string) => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const keyPair = keyPairFromHex(hexKey);

      await secureStorage.storePrivateKey(keyPair.privateKey);

      // Initialize encryption keys and upload registration early
      // This is needed before we can sync config
      logger.log('[Onboarding] Initializing encryption keys for hex import...');
      const deviceKeyset = await initializeEncryptionKeys(keyPair.publicKey);
      await uploadUserRegistration(
        keyPair.address,
        keyPair.publicKey,
        keyPair.privateKey,
        deviceKeyset
      );
      logger.log('[Onboarding] Registration uploaded');

      // Try to sync config from server to pre-fill profile data
      let syncedConfig: OnboardingState['syncedConfig'] = null;
      let profileFromConfig: ProfileData = {};

      try {
        logger.log('[Onboarding] Syncing config for imported account...');
        const config = await getConfig(keyPair.address);
        logger.log('[Onboarding] Config fetched:', {
          hasName: !!config.name,
          hasProfileImage: !!config.profile_image,
          allowSync: config.allowSync,
          spaceKeyCount: config.spaceKeys?.length ?? 0,
        });

        // Extract profile data if present to pre-fill
        if (config.name || config.profile_image) {
          profileFromConfig = {
            displayName: config.name,
            profileImageUri: config.profile_image,
          };
          logger.log('[Onboarding] Profile data from config:', profileFromConfig);
        }

        // Store synced config info for reference
        if (config.allowSync && (config.name || config.profile_image || (config.spaceKeys && config.spaceKeys.length > 0))) {
          syncedConfig = {
            name: config.name,
            profileImage: config.profile_image,
            allowSync: config.allowSync,
            spaceCount: config.spaceKeys?.length ?? 0,
          };
          logger.log('[Onboarding] Synced config stored:', syncedConfig);
        }
      } catch (configError) {
        logger.log('[Onboarding] No existing config found (new account):', configError);
      }

      setState(prev => ({
        ...prev,
        isLoading: false,
        quorumKeys: {
          publicKey: keyPair.publicKey,
          address: keyPair.address,
        },
        generatedMnemonic: null,
        isImportedAccount: true,
        syncedConfig,
        // Pre-fill profile from config if we got any data
        profile: {
          ...prev.profile,
          ...profileFromConfig,
        },
      }));

      // Always proceed through normal onboarding flow for imports
      // This allows user to review/update Farcaster and profile settings
      goToNextStep();
    } catch (error) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Invalid private key',
      }));
    }
  }, [goToNextStep]);

  const confirmMnemonicBackup = useCallback(() => {
    // Clear mnemonic from state (user confirmed they saved it)
    setState(prev => ({ ...prev, generatedMnemonic: null }));
    goToNextStep();
  }, [goToNextStep]);

  // ============ Step 2: Farcaster ============

  const skipFarcaster = useCallback(() => {
    setState(prev => ({
      ...prev,
      farcasterEnabled: false,
      farcasterAccount: null,
    }));
    goToNextStep();
  }, [goToNextStep]);

  const setFarcasterAccount = useCallback((account: FarcasterAccount) => {
    setState(prev => {
      // Pre-fill profile from Farcaster data if not already set
      const updatedProfile = { ...prev.profile };

      // Only pre-fill if the profile field is empty
      if (!updatedProfile.displayName && account.displayName) {
        updatedProfile.displayName = account.displayName;
      }
      if (!updatedProfile.profileImageUri && account.pfpUrl) {
        updatedProfile.profileImageUri = account.pfpUrl;
      }
      // Also use Farcaster username if no username is set
      if (!updatedProfile.username && account.username) {
        updatedProfile.username = account.username;
      }

      logger.log('[Onboarding] Setting Farcaster account:', {
        fid: account.fid,
        username: account.username,
        displayName: account.displayName,
        hasPfp: !!account.pfpUrl,
        profileUpdated: updatedProfile,
      });

      return {
        ...prev,
        farcasterEnabled: true,
        farcasterAccount: account,
        profile: updatedProfile,
      };
    });
    goToNextStep();
  }, [goToNextStep]);

  // ============ Step 3: Profile ============

  const updateProfile = useCallback((updates: Partial<ProfileData>) => {
    setState(prev => ({
      ...prev,
      profile: { ...prev.profile, ...updates },
    }));
  }, []);

  const skipProfile = useCallback(() => {
    goToNextStep();
  }, [goToNextStep]);

  // ============ Step 4: Privacy ============

  const setPrivacyLevel = useCallback((level: PrivacyLevel) => {
    setState(prev => ({ ...prev, privacyLevel: level }));
  }, []);

  // ============ Completion ============

  const completeOnboarding = useCallback(async () => {
    // Prevent multiple calls
    if (isCompletingRef.current) {
      return null;
    }

    if (!state.quorumKeys) {
      return null;
    }

    // Set completing flag BEFORE any async work to prevent save effect from running
    isCompletingRef.current = true;

    try {
      // Clear onboarding state from storage
      try {
        await secureStorage.clearOnboardingState();
      } catch (clearError) {
        logger.warn('[Onboarding] Failed to clear state (non-fatal):', clearError);
      }

      // Return user info for the screen to use with signIn
      // This decouples the auth state change from the OnboardingProvider
      // Note: We intentionally don't call setState here to avoid triggering re-renders
      return {
        address: state.quorumKeys.address,
        publicKey: state.quorumKeys.publicKey,
        displayName: state.profile.displayName,
        username: state.profile.username,
        bio: state.profile.bio,
        profileImage: state.profile.profileImageUri,
        privacyLevel: state.privacyLevel || 'standard',
        farcaster: state.farcasterAccount
          ? {
              fid: state.farcasterAccount.fid,
              username: state.farcasterAccount.username,
              signerPublicKey: state.farcasterAccount.signerPublicKey,
              custodyAddress: state.farcasterAccount.custodyAddress,
            }
          : undefined,
      };
    } catch (error) {
      console.error('[Onboarding] Error:', error);
      isCompletingRef.current = false;
      return null;
    }
  }, [state.quorumKeys, state.privacyLevel, state.profile, state.farcasterAccount]);

  // ============ Error Handling ============

  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  // ============ Context Value ============

  const value = useMemo<OnboardingContextValue>(
    () => ({
      state,
      goToStep,
      goBack,
      canGoBack,
      createNewAccount,
      importFromMnemonic,
      importFromHex,
      confirmMnemonicBackup,
      skipFarcaster,
      setFarcasterAccount,
      updateProfile,
      skipProfile,
      setPrivacyLevel,
      completeOnboarding,
      clearError,
    }),
    [
      state,
      goToStep,
      goBack,
      canGoBack,
      createNewAccount,
      importFromMnemonic,
      importFromHex,
      confirmMnemonicBackup,
      skipFarcaster,
      setFarcasterAccount,
      updateProfile,
      skipProfile,
      setPrivacyLevel,
      completeOnboarding,
      clearError,
    ]
  );

  return (
    <OnboardingContext.Provider value={value}>
      {children}
    </OnboardingContext.Provider>
  );
}

// ============ Hooks ============

export function useOnboarding(): OnboardingContextValue {
  const context = useContext(OnboardingContext);
  if (!context) {
    throw new Error('useOnboarding must be used within an OnboardingProvider');
  }
  return context;
}

export function useOnboardingState(): OnboardingState {
  const { state } = useOnboarding();
  return state;
}

export default OnboardingContext;
