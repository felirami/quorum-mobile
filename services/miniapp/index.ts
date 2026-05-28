/**
 * MiniApp SDK Exports
 *
 * Uses @farcaster/miniapp-host-react-native for compatibility with Farcaster mini apps.
 *
 * SECURITY: The SecureSigningService handles all cryptographic signing operations
 * in isolation. Private keys are never passed to the EthereumProviderService.
 */

export * from './types';
export {
  useMiniAppBridge,
  type UseMiniAppBridgeOptions,
  type MiniAppBridgeResult,
  type ComposeCastOptions,
  type ComposeCastResult,
  type WalletInfo,
} from './useMiniAppBridge';
export {
  signPersonalMessage,
  signTypedData,
  signTransactionOnly,
  signAndSendTransaction,
  getAddressFromPrivateKey,
} from './secureSigningService';
