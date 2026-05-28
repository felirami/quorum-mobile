/**
 * EthereumProviderService - EIP-1193 compliant provider for mini apps
 *
 * SECURITY: This provider does NOT hold private keys. All signing operations
 * are performed via callbacks that invoke the SecureSigningService.
 * This ensures private keys are never accessible from the WebView context.
 *
 * Architecture:
 * 1. Mini app calls provider.request() with a signing method
 * 2. Provider calls the appropriate approval callback
 * 3. Native UI shows approval modal to user
 * 4. If approved, the callback performs signing via SecureSigningService
 * 5. Signature/hash is returned to mini app
 */

import {
  createPublicClient,
  http,
  formatEther,
  type Hash,
  type Hex,
  type TransactionRequest,
  type Address,
  type Chain,
  type PublicClient,
  hexToString,
  isHex,
} from 'viem';
import {
  mainnet,
  base,
  optimism,
  arbitrum,
  polygon,
  bsc,
  avalanche,
  linea,
  scroll,
  blast,
  zksync,
  gnosis,
  celo,
  zora,
} from 'viem/chains';

// RPC Proxy base URL
const RPC_PROXY_BASE = 'https://rpc-proxy.quorummessenger.com';

// Chain ID to viem chain mapping
const CHAIN_MAP: Record<number, Chain> = {
  1: mainnet,
  10: optimism,
  56: bsc,
  137: polygon,
  324: zksync,
  8453: base,
  42161: arbitrum,
  43114: avalanche,
  59144: linea,
  534352: scroll,
  81457: blast,
  100: gnosis,
  42220: celo,
  7777777: zora,
};

// Supported chain IDs for Alchemy RPC
const SUPPORTED_CHAIN_IDS = new Set([
  1, 10, 56, 137, 324, 8453, 42161, 43114, 59144, 534352, 81457, 100, 42220, 7777777
]);

// Get RPC URL for a chain (via proxy)
// Proxy expects: /api/alchemy/{chainId}/rpc
function getRpcUrl(chainId: number): string {
  if (SUPPORTED_CHAIN_IDS.has(chainId)) {
    return `${RPC_PROXY_BASE}/api/alchemy/${chainId}/rpc`;
  }
  // Fallback to public RPCs for unsupported chains
  throw new Error(`Unsupported chain: ${chainId}`);
}

// EIP-1193 error codes
export const ProviderErrorCode = {
  USER_REJECTED: 4001,
  UNAUTHORIZED: 4100,
  UNSUPPORTED_METHOD: 4200,
  DISCONNECTED: 4900,
  CHAIN_DISCONNECTED: 4901,
  INTERNAL_ERROR: -32603,
  INVALID_PARAMS: -32602,
} as const;

export class ProviderRpcError extends Error {
  code: number;
  data?: unknown;

  constructor(code: number, message: string, data?: unknown) {
    super(message);
    this.code = code;
    this.data = data;
    this.name = 'ProviderRpcError';
  }
}

// Transaction request for approval
export interface TransactionForApproval {
  from: Address;
  to?: Address;
  value?: bigint;
  data?: Hex;
  gas?: bigint;
  gasPrice?: bigint;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
  nonce?: number;
  chainId: number;
}

// Message signing request for approval
export interface MessageForApproval {
  message: string;
  rawMessage: Hex | string;
  account: Address;
  method: 'personal_sign' | 'eth_sign';
}

// Typed data signing request for approval
export interface TypedDataForApproval {
  domain: Record<string, unknown>;
  types: Record<string, unknown>;
  primaryType: string;
  message: Record<string, unknown>;
  account: Address;
}

/**
 * Result from signing callbacks - contains the signature/hash
 * or null if rejected/failed
 */
export interface SigningResult {
  success: boolean;
  signature?: Hex;
  hash?: Hash;
  error?: string;
}

/**
 * Provider configuration
 * SECURITY: No private key is passed here. Only the address for display/verification.
 */
export interface EthereumProviderConfig {
  /** Wallet address (for display and verification only) */
  address: string;
  /** Default chain ID */
  defaultChainId?: number;
  /**
   * Callback for transaction requests.
   * Called with transaction details for user approval.
   * Should show UI, and if approved, sign and send the transaction.
   * Returns SigningResult with the transaction hash.
   */
  onSendTransaction?: (tx: TransactionForApproval) => Promise<SigningResult>;
  /**
   * Callback for transaction signing (without sending).
   * Returns SigningResult with the signed transaction.
   */
  onSignTransaction?: (tx: TransactionForApproval) => Promise<SigningResult>;
  /**
   * Callback for personal message signing.
   * Returns SigningResult with the signature.
   */
  onSignMessage?: (msg: MessageForApproval) => Promise<SigningResult>;
  /**
   * Callback for typed data signing.
   * Returns SigningResult with the signature.
   */
  onSignTypedData?: (data: TypedDataForApproval) => Promise<SigningResult>;
}

// Event types for EIP-1193
type ProviderEventMap = {
  accountsChanged: (accounts: readonly string[]) => void;
  chainChanged: (chainId: string) => void;
  connect: (info: { chainId: string }) => void;
  disconnect: (error: { code: number; message: string }) => void;
  message: (message: { type: string; data: unknown }) => void;
};

type ProviderEventName = keyof ProviderEventMap;

/**
 * EIP-1193 compliant Ethereum provider for mini apps
 *
 * SECURITY: This class does NOT store or have access to private keys.
 * All signing operations are delegated to callbacks that handle
 * user approval and signing in the native context.
 */
export class EthereumProviderService {
  private address: Address;
  private chainId: number;
  private publicClient: PublicClient;
  private config: EthereumProviderConfig;
  private eventListeners: Map<string, Set<(...args: any[]) => void>> = new Map();

  constructor(config: EthereumProviderConfig) {
    this.config = config;
    this.address = config.address as Address;
    this.chainId = config.defaultChainId || 1;

    // Initialize public client for read-only operations
    const chain = CHAIN_MAP[this.chainId] || mainnet;
    const transport = http(getRpcUrl(this.chainId));

    this.publicClient = createPublicClient({
      chain,
      transport,
    });
  }

  /**
   * Add event listener (EIP-1193)
   */
  on<E extends ProviderEventName>(event: E, listener: ProviderEventMap[E]): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(listener);
  }

  /**
   * Remove event listener (EIP-1193)
   */
  removeListener<E extends ProviderEventName>(event: E, listener: ProviderEventMap[E]): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.delete(listener);
    }
  }

  /**
   * Emit an event to all listeners
   */
  private emit<E extends ProviderEventName>(event: E, ...args: Parameters<ProviderEventMap[E]>): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach((listener) => {
        try {
          (listener as (...args: any[]) => void)(...args);
        } catch {
          // Listener threw — isolate so other listeners still fire
        }
      });
    }
  }

  /**
   * Update the chain ID and recreate the public client
   */
  private switchChain(chainId: number): void {
    const chain = CHAIN_MAP[chainId];
    if (!chain) {
      throw new ProviderRpcError(
        ProviderErrorCode.INVALID_PARAMS,
        `Unsupported chain: ${chainId}`
      );
    }

    this.chainId = chainId;
    const transport = http(getRpcUrl(chainId));

    this.publicClient = createPublicClient({
      chain,
      transport,
    });

    // Emit chainChanged event
    this.emit('chainChanged', `0x${chainId.toString(16)}`);
  }

  /**
   * Handle EIP-1193 request
   */
  async request(args: { method: string; params?: unknown[] }): Promise<unknown> {
    const { method, params = [] } = args;
    switch (method) {
      // Connection methods
      case 'eth_requestAccounts':
      case 'eth_accounts':
        return [this.address];

      // Chain methods
      case 'eth_chainId':
        return `0x${this.chainId.toString(16)}`;

      case 'net_version':
        return this.chainId.toString();

      case 'wallet_switchEthereumChain': {
        const [{ chainId }] = params as [{ chainId: string }];
        const newChainId = parseInt(chainId, 16);
        this.switchChain(newChainId);
        return null;
      }

      // Transaction methods - delegated to secure callbacks
      case 'eth_sendTransaction': {
        const [txParams] = params as [TransactionRequest];
        return this.sendTransaction(txParams);
      }

      case 'eth_signTransaction': {
        const [txParams] = params as [TransactionRequest];
        return this.signTransaction(txParams);
      }

      // Signing methods - delegated to secure callbacks
      case 'personal_sign': {
        const [message, account] = params as [Hex, Address];
        return this.personalSign(message, account);
      }

      case 'eth_sign': {
        const [account, message] = params as [Address, Hex];
        return this.personalSign(message, account);
      }

      case 'eth_signTypedData':
      case 'eth_signTypedData_v4': {
        const [account, typedDataJson] = params as [Address, string];
        return this.signTypedData(account, typedDataJson);
      }

      // Read methods (passthrough to RPC - no signing needed)
      case 'eth_call': {
        const [callParams, blockTag] = params as [TransactionRequest, string?];
        return this.publicClient.call({
          to: callParams.to as Address,
          data: callParams.data as Hex,
          account: callParams.from as Address | undefined,
        });
      }

      case 'eth_estimateGas': {
        const [txParams] = params as [TransactionRequest];
        const gas = await this.publicClient.estimateGas({
          to: txParams.to as Address,
          data: txParams.data as Hex,
          value: txParams.value ? BigInt(txParams.value.toString()) : undefined,
          account: this.address,
        });
        return `0x${gas.toString(16)}`;
      }

      case 'eth_getBalance': {
        const [address, blockTag] = params as [Address, string?];
        const balance = await this.publicClient.getBalance({ address });
        return `0x${balance.toString(16)}`;
      }

      case 'eth_blockNumber': {
        const blockNumber = await this.publicClient.getBlockNumber();
        return `0x${blockNumber.toString(16)}`;
      }

      case 'eth_getBlockByNumber': {
        const [blockTag, includeTransactions] = params as [string, boolean];
        const block = await this.publicClient.getBlock({
          blockTag: blockTag as 'latest' | 'earliest' | 'pending',
          includeTransactions,
        });
        return block;
      }

      case 'eth_getTransactionByHash': {
        const [hash] = params as [Hash];
        return this.publicClient.getTransaction({ hash });
      }

      case 'eth_getTransactionReceipt': {
        const [hash] = params as [Hash];
        return this.publicClient.getTransactionReceipt({ hash });
      }

      case 'eth_getCode': {
        const [address, blockTag] = params as [Address, string?];
        return this.publicClient.getCode({ address });
      }

      case 'eth_gasPrice': {
        const gasPrice = await this.publicClient.getGasPrice();
        return `0x${gasPrice.toString(16)}`;
      }

      case 'eth_getTransactionCount': {
        const [address, blockTag] = params as [Address, string?];
        const count = await this.publicClient.getTransactionCount({ address });
        return `0x${count.toString(16)}`;
      }

      default:
        throw new ProviderRpcError(
          ProviderErrorCode.UNSUPPORTED_METHOD,
          `Method ${method} is not supported`
        );
    }
  }

  /**
   * Send a transaction
   * Delegates to the secure signing callback
   */
  private async sendTransaction(txParams: TransactionRequest): Promise<Hash> {
    if (!this.config.onSendTransaction) {
      throw new ProviderRpcError(
        ProviderErrorCode.INTERNAL_ERROR,
        'Transaction signing not configured'
      );
    }

    // Prepare transaction for approval
    const txForApproval: TransactionForApproval = {
      from: this.address,
      to: txParams.to as Address | undefined,
      value: txParams.value ? BigInt(txParams.value.toString()) : undefined,
      data: txParams.data as Hex | undefined,
      gas: txParams.gas ? BigInt(txParams.gas.toString()) : undefined,
      gasPrice: txParams.gasPrice ? BigInt(txParams.gasPrice.toString()) : undefined,
      maxFeePerGas: txParams.maxFeePerGas ? BigInt(txParams.maxFeePerGas.toString()) : undefined,
      maxPriorityFeePerGas: txParams.maxPriorityFeePerGas
        ? BigInt(txParams.maxPriorityFeePerGas.toString())
        : undefined,
      nonce: txParams.nonce ? Number(txParams.nonce) : undefined,
      chainId: this.chainId,
    };

    // Delegate to the secure signing callback
    const result = await this.config.onSendTransaction(txForApproval);

    if (!result.success) {
      throw new ProviderRpcError(
        ProviderErrorCode.USER_REJECTED,
        result.error || 'User rejected the transaction'
      );
    }

    if (!result.hash) {
      throw new ProviderRpcError(
        ProviderErrorCode.INTERNAL_ERROR,
        'Transaction was signed but no hash returned'
      );
    }
    return result.hash;
  }

  /**
   * Sign a transaction without sending
   * Delegates to the secure signing callback
   */
  private async signTransaction(txParams: TransactionRequest): Promise<Hex> {
    if (!this.config.onSignTransaction) {
      throw new ProviderRpcError(
        ProviderErrorCode.INTERNAL_ERROR,
        'Transaction signing not configured'
      );
    }

    const txForApproval: TransactionForApproval = {
      from: this.address,
      to: txParams.to as Address | undefined,
      value: txParams.value ? BigInt(txParams.value.toString()) : undefined,
      data: txParams.data as Hex | undefined,
      gas: txParams.gas ? BigInt(txParams.gas.toString()) : undefined,
      chainId: this.chainId,
    };

    const result = await this.config.onSignTransaction(txForApproval);

    if (!result.success) {
      throw new ProviderRpcError(
        ProviderErrorCode.USER_REJECTED,
        result.error || 'User rejected the transaction'
      );
    }

    if (!result.signature) {
      throw new ProviderRpcError(
        ProviderErrorCode.INTERNAL_ERROR,
        'Transaction signing failed'
      );
    }

    return result.signature;
  }

  /**
   * Sign a personal message (EIP-191)
   * Delegates to the secure signing callback
   */
  private async personalSign(message: Hex | string, account: Address): Promise<Hex> {
    // Verify the account matches
    if (account.toLowerCase() !== this.address.toLowerCase()) {
      throw new ProviderRpcError(
        ProviderErrorCode.UNAUTHORIZED,
        'Account mismatch'
      );
    }

    if (!this.config.onSignMessage) {
      throw new ProviderRpcError(
        ProviderErrorCode.INTERNAL_ERROR,
        'Message signing not configured'
      );
    }

    // Decode message for display
    let displayMessage: string;
    if (isHex(message)) {
      try {
        displayMessage = hexToString(message as Hex);
      } catch {
        displayMessage = message;
      }
    } else {
      displayMessage = message;
    }

    const result = await this.config.onSignMessage({
      message: displayMessage,
      rawMessage: message,
      account,
      method: 'personal_sign',
    });

    if (!result.success) {
      throw new ProviderRpcError(
        ProviderErrorCode.USER_REJECTED,
        result.error || 'User rejected the signature request'
      );
    }

    if (!result.signature) {
      throw new ProviderRpcError(
        ProviderErrorCode.INTERNAL_ERROR,
        'Message signing failed'
      );
    }
    return result.signature;
  }

  /**
   * Sign typed data (EIP-712)
   * Delegates to the secure signing callback
   */
  private async signTypedData(account: Address, typedDataJson: string): Promise<Hex> {
    // Verify the account matches
    if (account.toLowerCase() !== this.address.toLowerCase()) {
      throw new ProviderRpcError(
        ProviderErrorCode.UNAUTHORIZED,
        'Account mismatch'
      );
    }

    if (!this.config.onSignTypedData) {
      throw new ProviderRpcError(
        ProviderErrorCode.INTERNAL_ERROR,
        'Typed data signing not configured'
      );
    }

    const typedData = typeof typedDataJson === 'string'
      ? JSON.parse(typedDataJson)
      : typedDataJson;

    const result = await this.config.onSignTypedData({
      domain: typedData.domain,
      types: typedData.types,
      primaryType: typedData.primaryType,
      message: typedData.message,
      account,
    });

    if (!result.success) {
      throw new ProviderRpcError(
        ProviderErrorCode.USER_REJECTED,
        result.error || 'User rejected the signature request'
      );
    }

    if (!result.signature) {
      throw new ProviderRpcError(
        ProviderErrorCode.INTERNAL_ERROR,
        'Typed data signing failed'
      );
    }
    return result.signature;
  }

  /**
   * Get the current chain ID
   */
  getChainId(): number {
    return this.chainId;
  }

  /**
   * Get the connected address
   */
  getAddress(): Address {
    return this.address;
  }

  /**
   * Get supported chain IDs
   */
  static getSupportedChainIds(): number[] {
    return Object.keys(CHAIN_MAP).map(Number);
  }

  /**
   * Get chain name from ID
   */
  static getChainName(chainId: number): string {
    const chain = CHAIN_MAP[chainId];
    return chain?.name || `Chain ${chainId}`;
  }
}

/**
 * Format a transaction for display
 */
export function formatTransactionForDisplay(tx: TransactionForApproval): {
  to: string;
  value: string;
  data: string;
  gas: string;
  chainName: string;
} {
  return {
    to: tx.to || 'Contract Creation',
    value: tx.value ? `${formatEther(tx.value)} ETH` : '0 ETH',
    data: tx.data ? (tx.data.length > 66 ? `${tx.data.slice(0, 66)}...` : tx.data) : 'None',
    gas: tx.gas ? tx.gas.toString() : 'Estimating...',
    chainName: EthereumProviderService.getChainName(tx.chainId),
  };
}
