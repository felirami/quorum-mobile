export interface MiniAppUser {
  address: string;
  displayName?: string;
  username?: string;
  pfpUrl?: string;
  bio?: string;
  fid?: number;
}

export interface MiniAppClient {
  platformType: 'mobile' | 'web';
  clientId: string;
  added: boolean;
  safeAreaInsets: {
    top: number;
    left: number;
    right: number;
    bottom: number;
  };
}

export interface MiniAppContext {
  user: MiniAppUser;
  client: MiniAppClient;
  features: {
    haptics: boolean;
    wallet: boolean;
    notifications: boolean;
  };
}

export interface ReadyOptions {
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
  address?: string;
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


export interface EthProviderRequest {
  method: string;
  params?: unknown[];
}


export type MiniAppClientEvent =
  | { event: 'primary_button_clicked' }
  | { event: 'back_navigation_triggered' }
  | { event: 'frame_added'; notificationDetails?: unknown }
  | { event: 'frame_add_rejected'; reason: string }
  | { event: 'notifications_enabled'; notificationDetails?: unknown }
  | { event: 'notifications_disabled' };

// Native SDK exposed to mini apps via RPC.
export interface MiniAppHost {
  context: MiniAppContext;
  ready: (options?: ReadyOptions) => Promise<void>;
  close: () => void;
  openUrl: (url: string) => void;
  setPrimaryButton: (options: SetPrimaryButtonOptions) => void;
  signIn: (options: SignInOptions) => Promise<SignInResult>;
  viewProfile: (options: ViewProfileOptions) => void;
  updateBackState: (state: BackState) => void;
  getCapabilities: () => Promise<string[]>;
  impactOccurred: (type: 'light' | 'medium' | 'heavy' | 'soft' | 'rigid') => void;
  notificationOccurred: (type: 'success' | 'warning' | 'error') => void;
  selectionChanged: () => void;
}

// Farcaster-specific extensions, only available if the user has connected Farcaster.
export interface FarcasterMiniAppHost extends MiniAppHost {
  composeCast: (options: ComposeCastOptions) => Promise<{ cast: unknown } | undefined>;
  viewCast: (options: { hash: string; close?: boolean }) => void;
  followChannel: (options: { key: string }) => Promise<void>;
  addMiniApp: () => Promise<{ notificationDetails?: unknown }>;
  ethProviderRequest: (params: EthProviderRequest) => Promise<unknown>;
}


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
