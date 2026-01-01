/**
 * useMiniAppBridge Hook
 *
 * Provides the bridge between React Native and mini apps running in WebView.
 * Uses @farcaster/miniapp-host-react-native for compatibility with Farcaster mini apps.
 */

import { RefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import WebView from 'react-native-webview';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  useWebViewRpcEndpoint,
  useExposeWebViewToEndpoint,
} from '@farcaster/miniapp-host-react-native';

import { useAuth } from '@/context';
import { getFarcasterCustodyKey, getFarcasterAuthToken } from '@/services/onboarding/secureStorage';
import { fetchFarcasterProfileByFid } from '@/services/onboarding/farcasterService';
import { Context } from '@farcaster/miniapp-core';
import { Address, Hex, PersonalMessage, Secp256k1, Signature, Siwe } from 'ox';
import type { SetPrimaryButtonOptions } from './types';

// ============ Hook Options ============

export interface UseMiniAppBridgeOptions {
  /** WebView ref */
  webViewRef: RefObject<WebView | null>;
  /** Domain of the mini app */
  domain: string;
  /** Full URL of the mini app */
  url: string;
  /** Called when mini app signals ready */
  onReady?: (options?: { disableNativeGestures?: boolean }) => void;
  /** Called when mini app requests close */
  onClose?: () => void;
  /** Called when primary button state changes */
  onPrimaryButtonChange?: (options: SetPrimaryButtonOptions | null) => void;
  /** Called when mini app requires Farcaster but user hasn't connected one */
  onFarcasterRequired?: () => void;
}

export interface MiniAppBridgeResult {
  /** Handler for WebView messages */
  onMessage: (e: any) => void;
  /** Emit event to mini app */
  emit: (event: string, data?: Record<string, unknown>) => void;
  /** Current primary button state */
  primaryButton: SetPrimaryButtonOptions | null;
  /** Whether the mini app is ready */
  isReady: boolean;
  /** Whether back navigation is enabled */
  backEnabled: boolean;
  /** Trigger back navigation in mini app */
  triggerBack: () => void;
  /** Whether Farcaster account is required but missing */
  farcasterRequired: boolean;
  /** Whether the bridge is ready to receive messages */
  bridgeReady: boolean;
}

// ============ Hook Implementation ============

export function useMiniAppBridge(options: UseMiniAppBridgeOptions): MiniAppBridgeResult {
  const { webViewRef, domain, url, onReady, onClose, onPrimaryButtonChange, onFarcasterRequired } = options;

  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  // State
  const [primaryButton, setPrimaryButton] = useState<SetPrimaryButtonOptions | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [backEnabled, setBackEnabled] = useState(false);
  const [requestedDomain, setRequestedDomain] = useState<'farcaster' | 'quorum'>('farcaster');
  const [farcasterRequired, setFarcasterRequired] = useState(false);
  const [farcasterPfpUrl, setFarcasterPfpUrl] = useState<string | undefined>(undefined);

  // Fetch the actual Farcaster profile pfpUrl (not a data URI)
  useEffect(() => {
    const fid = user?.farcaster?.fid;
    if (fid) {
      fetchFarcasterProfileByFid(fid).then((profile) => {
        if (profile?.pfpUrl) {
          setFarcasterPfpUrl(profile.pfpUrl);
        }
      });
    }
  }, [user?.farcaster?.fid]);

  // Use the official Farcaster RPC endpoint hook
  const { endpoint, onMessage } = useWebViewRpcEndpoint(webViewRef, domain);

  // Build context for mini app based on requested domain
  const context = useMemo<Context.MiniAppContext>(() => {
    const isQuorumDomain = requestedDomain === 'quorum';

    const username = isQuorumDomain
      ? user?.username
      : (user?.farcaster?.username ?? user?.username);

    // FID is required - use 0 as fallback for non-Farcaster contexts
    const fid = isQuorumDomain ? 0 : (user?.farcaster?.fid ?? 0);

    // Use the fetched Farcaster pfpUrl (real URL, not data URI)
    const pfpUrl = isQuorumDomain
      ? user?.profileImage
      : farcasterPfpUrl;

    const miniAppUser: Context.UserContext = {
      fid,
      displayName: user?.displayName,
      username,
      pfpUrl,
    };

    // clientFid is the FID of the client app (Quorum doesn't have one, use 0)
    const miniAppClient: Context.ClientContext = {
      platformType: 'mobile',
      clientFid: 0,
      added: false,
      safeAreaInsets: {
        top: insets.top,
        left: insets.left,
        right: insets.right,
        bottom: insets.bottom,
      },
    };

    return {
      user: miniAppUser,
      client: miniAppClient,
      features: {
        haptics: true,
      },
    };
  }, [user, insets, requestedDomain, farcasterPfpUrl]);

  // Use refs to always have the latest values available for the SDK methods
  const contextRef = useRef(context);
  contextRef.current = context;

  const urlRef = useRef(url);
  urlRef.current = url;

  // Create the SDK object to expose to mini apps
  const sdk = useMemo(() => {
    return {
      // Context - use getter to always return latest context
      get context() {
        return contextRef.current;
      },

      // Capabilities
      getCapabilities: async () => {
        const capabilities = [
          'actions.ready',
          'actions.close',
          'actions.openUrl',
          'actions.setPrimaryButton',
          'actions.signIn',
          'actions.viewProfile',
          'haptics.impactOccurred',
          'haptics.notificationOccurred',
          'haptics.selectionChanged',
          'back',
          'domain.quorum',
        ];

        if (user?.farcaster) {
          capabilities.push(
            'actions.composeCast',
            'actions.viewCast',
            'actions.addMiniApp'
          );
        }

        return capabilities;
      },

      getChains: async () => {
        return [
          { reference: '1', caip2: 'eip155:1' },
        ];
      },

      // Core actions
      ready: async (opts?: { disableNativeGestures?: boolean; domain?: 'farcaster' | 'quorum' }) => {
        if (opts?.domain === 'quorum') {
          setRequestedDomain('quorum');
          setFarcasterRequired(false);
        } else {
          setRequestedDomain('farcaster');
          const hasFarcaster = !!user?.farcaster?.custodyAddress;
          if (!hasFarcaster) {
            setFarcasterRequired(true);
            onFarcasterRequired?.();
          } else {
            setFarcasterRequired(false);
          }
        }

        setIsReady(true);
        onReady?.(opts);
      },

      close: () => {
        onClose?.();
      },

      openUrl: (url: string) => {
        // TODO: Implement URL opening
      },

      setPrimaryButton: (opts: SetPrimaryButtonOptions) => {
        setPrimaryButton(opts);
        onPrimaryButtonChange?.(opts);
      },

      // Navigation
      viewProfile: (opts: { fid?: number; username?: string }) => {
      },

      viewCast: (opts: { hash: string }) => {
      },

      openMiniApp: (opts: { url: string }) => {
      },

      // Authentication
      signIn: async (opts: {
        nonce: string;
        notBefore?: string;
        expirationTime?: string;
        acceptAuthAddress?: boolean;
      }) => {
        const hasFarcaster = !!user?.farcaster?.custodyAddress && !!user?.farcaster?.fid;
        if (!hasFarcaster) {
          setFarcasterRequired(true);
          onFarcasterRequired?.();
          throw new Error('rejected_by_user');
        }

        const custodyPrivateKey = await getFarcasterCustodyKey();
        if (!custodyPrivateKey) {
          setFarcasterRequired(true);
          onFarcasterRequired?.();
          throw new Error('rejected_by_user');
        }

        const custodyAddressRaw = user.farcaster!.custodyAddress!;
        const fid = user.farcaster!.fid;

        // Verify the private key matches the custody address
        const privateKeyHex = `0x${custodyPrivateKey}` as Hex.Hex;
        const publicKey = Secp256k1.getPublicKey({ privateKey: privateKeyHex });

        // Use checksummed address (EIP-55) - this is what ethers.Wallet.address provides
        // and is required for SIWE message verification
        const custodyAddress = Address.checksum(custodyAddressRaw as Address.Address);

        // Build SIWE message data
        // Use urlRef.current to get the latest URL value
        const currentUrl = urlRef.current;
        const data = {
          version: '1',
          address: custodyAddress as Hex.Hex,
          statement: 'Farcaster Auth',
          chainId: 10,
          resources: [`farcaster://fid/${fid}`] as string[],
          domain,
          // ensure valid RFC 3986 resource URI
          uri: new URL(currentUrl).href,
          nonce: opts.nonce,
          notBefore: opts.notBefore ? new Date(opts.notBefore) : undefined,
          expirationTime: opts.expirationTime ? new Date(opts.expirationTime) : undefined,
        } as const satisfies Siwe.Message;

        const message = Siwe.createMessage(data);

        // Sign using ox library (matches ethers.Wallet.signMessage behavior)
        // 1. Get the personal message sign payload (EIP-191 prefixed hash)
        const payload = PersonalMessage.getSignPayload(Hex.fromString(message));
        // 2. Sign with secp256k1 using private key (already declared above)
        const sig = Secp256k1.sign({ payload, privateKey: privateKeyHex });
        // 3. Convert to hex signature string
        const signature = Signature.toHex(sig);

        return {
          authMethod: 'custody',
          message,
          signature,
        };
      },

      // Haptics
      impactOccurred: (style: 'light' | 'medium' | 'heavy' | 'soft' | 'rigid') => {
        switch (style) {
          case 'light':
          case 'soft':
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            break;
          case 'medium':
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            break;
          case 'heavy':
          case 'rigid':
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            break;
        }
      },

      notificationOccurred: (type: 'success' | 'warning' | 'error') => {
        switch (type) {
          case 'success':
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            break;
          case 'warning':
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            break;
          case 'error':
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            break;
        }
      },

      selectionChanged: () => {
        Haptics.selectionAsync();
      },

      // Frame/MiniApp management
      addMiniApp: async () => {
        return { error: { type: 'rejected_by_user' } };
      },

      // Cast composition
      composeCast: async (opts?: {
        text?: string;
        embeds?: string[];
        parent?: { hash: string };
      }) => {
        return {};
      },

      // Back state
      updateBackState: (state: { visible: boolean }) => {
        setBackEnabled(state.visible);
      },

      // Wallet / Provider methods (stubs - not yet implemented)
      signManifest: async () => {
        return { error: { type: 'rejected_by_user', message: 'Not implemented' } };
      },

      ethProviderRequest: async () => {
        throw new Error('Not implemented');
      },

      eip6963RequestProvider: () => {
      },

      viewToken: (opts: { token: string; chain?: string }) => {
      },

      sendToken: (opts: { token: string; chain?: string; amount?: string; recipientFid?: number }) => {
      },

      swapToken: (opts: { sellToken?: string; buyToken?: string; sellAmount?: string; chain?: string }) => {
      },

      requestCameraAndMicrophoneAccess: async () => {
        // TODO: Implement permission request
        return true;
      },
    };
  }, [context, domain, user, onReady, onClose, onPrimaryButtonChange, onFarcasterRequired]);

  // Expose SDK via the official Farcaster hook
  // Cast to any since our SDK has minor type differences but is compatible at runtime
  useExposeWebViewToEndpoint({
    endpoint,
    sdk: sdk as any,
  });

  // Emit function for events
  const emit = useCallback((event: string, data?: Record<string, unknown>) => {
    const eventData = { event, ...data } as any;
    endpoint?.emit(eventData);
  }, [endpoint]);

  // Trigger back navigation
  const triggerBack = useCallback(() => {
    emit('back_navigation_triggered');
  }, [emit]);

  // Bridge is ready when endpoint is available
  const bridgeReady = !!endpoint;

  return {
    onMessage,
    emit,
    primaryButton,
    isReady,
    backEnabled,
    triggerBack,
    farcasterRequired,
    bridgeReady,
  };
}
