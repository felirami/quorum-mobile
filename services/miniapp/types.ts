/**
 * MiniApp SDK Types
 *
 * Defines the interface between Quorum mobile and mini apps running in WebView.
 * Compatible with Farcaster's MiniApp SDK for cross-platform mini apps.
 */

// ============ Context Types ============

export interface MiniAppUser {
  /** Quorum address (base58 multihash) */
  address: string;
  /** Display name */
  displayName?: string;
  /** Username */
  username?: string;
  /** Profile image URL (data URI or https) */
  pfpUrl?: string;
  /** User bio */
  bio?: string;
  /** Farcaster FID if connected */
  fid?: number;
}

export interface MiniAppClient {
  /** Platform type */
  platformType: 'mobile' | 'web';
  /** Client identifier */
  clientId: string;
  /** Whether the mini app has been added/favorited by user */
  added: boolean;
  /** Safe area insets for the mini app to use */
  safeAreaInsets: {
    top: number;
    left: number;
    right: number;
    bottom: number;
  };
}

export interface MiniAppContext {
  /** Current user info */
  user: MiniAppUser;
  /** Client/platform info */
  client: MiniAppClient;
  /** Available features */
  features: {
    haptics: boolean;
    wallet: boolean;
    notifications: boolean;
  };
}

// ============ Action Types ============

export interface ReadyOptions {
  /** Disable native swipe gestures (for apps with their own gestures) */
  disableNativeGestures?: boolean;
}

export interface OpenUrlOptions {
  url: string;
}

export interface SetPrimaryButtonOptions {
  text: string;
  disabled?: boolean;
  hidden?: boolean;
  loading?: boolean;
}

export interface ViewProfileOptions {
  /** Quorum address to view */
  address?: string;
  /** Farcaster FID to view (if connected) */
  fid?: number;
}

export interface ComposeCastOptions {
  text?: string;
  embeds?: string[];
  parent?: { hash: string };
  channelKey?: string;
  close?: boolean;
}

export interface SignInOptions {
  nonce?: string;
  notBefore?: string;
  expirationTime?: string;
}

export interface SignInResult {
  authMethod: 'custody' | 'delegated';
  message: string;
  signature: string;
}

export interface BackState {
  visible: boolean;
}

// ============ Wallet Types ============

export interface EthProviderRequest {
  method: string;
  params?: unknown[];
}

// ============ Event Types ============

export type MiniAppClientEvent =
  | { event: 'primary_button_clicked' }
  | { event: 'back_navigation_triggered' }
  | { event: 'frame_added'; notificationDetails?: unknown }
  | { event: 'frame_add_rejected'; reason: string }
  | { event: 'notifications_enabled'; notificationDetails?: unknown }
  | { event: 'notifications_disabled' };

// ============ Host SDK Interface ============

/**
 * The SDK that the native app exposes to mini apps.
 * Mini apps call these methods via RPC.
 */
export interface MiniAppHost {
  /** Get the current context (user, client info) */
  context: MiniAppContext;

  /** Signal that the mini app is ready to be shown */
  ready: (options?: ReadyOptions) => Promise<void>;

  /** Close the mini app */
  close: () => void;

  /** Open a URL (internal navigation or external browser) */
  openUrl: (url: string) => void;

  /** Set the primary action button */
  setPrimaryButton: (options: SetPrimaryButtonOptions) => void;

  /** Sign in with SIWE */
  signIn: (options: SignInOptions) => Promise<SignInResult>;

  /** View a user's profile */
  viewProfile: (options: ViewProfileOptions) => void;

  /** Update back button state */
  updateBackState: (state: BackState) => void;

  /** Get supported capabilities */
  getCapabilities: () => Promise<string[]>;

  // Haptic feedback
  impactOccurred: (type: 'light' | 'medium' | 'heavy' | 'soft' | 'rigid') => void;
  notificationOccurred: (type: 'success' | 'warning' | 'error') => void;
  selectionChanged: () => void;
}

// ============ Farcaster Compatibility Types ============

/**
 * Farcaster-specific extensions for cross-platform mini apps.
 * These are only available if the user has connected Farcaster.
 */
export interface FarcasterMiniAppHost extends MiniAppHost {
  /** Compose a cast (Farcaster post) */
  composeCast: (options: ComposeCastOptions) => Promise<{ cast: unknown } | undefined>;

  /** View a cast by hash */
  viewCast: (options: { hash: string; close?: boolean }) => void;

  /** Follow a Farcaster channel */
  followChannel: (options: { key: string }) => Promise<void>;

  /** Add this mini app to favorites */
  addMiniApp: () => Promise<{ notificationDetails?: unknown }>;

  /** Ethereum provider for wallet interactions */
  ethProviderRequest: (params: EthProviderRequest) => Promise<unknown>;
}

// ============ Launch Config Types ============

export interface MiniAppLaunchConfig {
  type: 'standalone' | 'manifest';
  url: string;
  name: string;
  splashImageUrl?: string;
  splashBackgroundColor?: string;
  path?: string;
  queryParams?: Record<string, string>;
}

export interface MiniAppManifest {
  name: string;
  homeUrl: string;
  iconUrl?: string;
  splashImageUrl?: string;
  splashBackgroundColor?: string;
  description?: string;
  author?: {
    address?: string;
    fid?: number;
    username?: string;
  };
}
