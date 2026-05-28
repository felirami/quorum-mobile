/**
 * Context exports for Quorum mobile app
 */

// Storage
export { StorageProvider, useStorageAdapter } from './StorageContext';

// API Client
export {
  ApiClientProvider,
  useApiClient,
  useApiClientContext,
} from './ApiClientContext';

// Auth
export {
  AuthProvider,
  useAuth,
  useUser,
  useIsAuthenticated,
} from './AuthContext';
export type {
  AuthState,
  PrivacyLevel,
  FarcasterInfo,
  UserInfo,
} from './AuthContext';

// Onboarding
export {
  OnboardingProvider,
  useOnboarding,
  useOnboardingState,
} from './OnboardingContext';
export type {
  OnboardingStep,
  QuorumKeys,
  FarcasterAccount,
  ProfileData,
  OnboardingState,
} from './OnboardingContext';

// WebSocket (E2E Encrypted Messaging)
export {
  WebSocketProvider,
  useWebSocket,
  useWebSocketConnection,
} from './WebSocketContext';

// Calling (Voice/Video)
export {
  CallProvider,
  useCall,
} from './CallContext';
export type {
  CallState,
  ActiveCall,
  IncomingCallInfo,
  CallContextValue,
} from './CallContext';

// Space Calls (SFU-based group calls)
export {
  SpaceCallProvider,
  useSpaceCall,
} from './SpaceCallContext';
export type {
  SpaceCallState,
  SpaceCallContextValue,
} from './SpaceCallContext';
