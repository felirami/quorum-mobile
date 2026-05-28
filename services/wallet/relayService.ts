/**
 * Relay Protocol integration for cross-chain swaps
 *
 * Provides functionality for:
 * - Cross-chain token swaps between any supported chains
 * - Quote fetching with fee breakdown
 * - Transaction execution via relay network
 */

// RPC Proxy base URL
const RPC_PROXY_BASE = 'https://rpc-proxy.quorummessenger.com';
const RELAY_API_BASE = `${RPC_PROXY_BASE}/api/relay`;

// Fee configuration
const FEE_RECIPIENT = '0xb53561b0Ff4D499F25A897e242Cb6E0E7879F6C2';
const FEE_BPS = '30'; // 0.3% fee in basis points

// Relay chain IDs (same as standard EVM chain IDs)
export const RELAY_CHAIN_IDS: Record<string, number> = {
  ethereum: 1,
  polygon: 137,
  bsc: 56,
  optimism: 10,
  arbitrum: 42161,
  base: 8453,
  avalanche: 43114,
  linea: 59144,
  scroll: 534352,
  blast: 81457,
  zksync: 324,
  mantle: 5000,
  mode: 34443,
  zora: 7777777,
};

// Native token address (0x0 for Relay API)
export const RELAY_NATIVE_ADDRESS = '0x0000000000000000000000000000000000000000';

export interface RelayQuote {
  steps: RelayStep[];
  fees: RelayFees;
  details: RelayDetails;
  currencyIn: RelayCurrency;
  currencyOut: RelayCurrency;
}

export interface RelayStep {
  id: string;
  action: string;
  description: string;
  kind: 'transaction' | 'signature';
  items: RelayStepItem[];
  check?: {
    endpoint: string;
    method: string;
  };
}

export interface RelayStepItem {
  status: 'complete' | 'incomplete';
  data?: {
    chainId: number;
    to: string;
    data: string;
    value: string;
    maxFeePerGas?: string;
    maxPriorityFeePerGas?: string;
    gas?: string;
  };
  check?: {
    endpoint: string;
    method: string;
  };
}

export interface RelayFees {
  gas: RelayFeeItem;
  relayer: RelayFeeItem;
  relayerGas: RelayFeeItem;
  relayerService: RelayFeeItem;
  app?: RelayFeeItem;
  subsidized?: RelayFeeItem;
}

export interface RelayFeeItem {
  currency: RelayCurrency;
  amount: string;
  amountFormatted: string;
  amountUsd: string;
}

export interface RelayCurrency {
  chainId: number;
  address: string;
  symbol: string;
  name: string;
  decimals: number;
}

export interface RelayCurrencyAmount {
  currency: RelayCurrency;
  amount: string;
  amountFormatted: string;
  amountUsd: string;
  minimumAmount?: string;
}

export interface RelayDetails {
  operation?: string;
  sender: string;
  recipient: string;
  currencyIn: RelayCurrencyAmount;
  currencyOut: RelayCurrencyAmount;
  rate: string;
  slippageTolerance?: {
    origin?: { percent: string };
    destination?: { percent: string };
  };
  totalImpact?: { usd: string; percent: string };
  swapImpact?: { usd: string; percent: string };
  timeEstimate?: number;
}

export interface RelayChain {
  id: number;
  name: string;
  displayName: string;
  httpRpcUrl: string;
  wsRpcUrl?: string;
  explorerUrl: string;
  currency: {
    id: string;
    symbol: string;
    name: string;
    decimals: number;
  };
}

export interface RelayToken {
  chainId: number;
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
}

/**
 * Get supported chains from Relay
 */
export async function getRelaySupportedChains(): Promise<RelayChain[]> {
  const response = await fetch(`${RELAY_API_BASE}/chains`, {
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch chains: ${response.status}`);
  }

  const data = await response.json();
  return data.chains || [];
}

/**
 * Get tokens available on a specific chain
 * Uses POST /currencies/v2 with body parameters
 */
export async function getRelayTokens(chainId: number, search?: string): Promise<RelayToken[]> {
  const body: any = {
    chainIds: [chainId],
    limit: 50,
    useExternalSearch: true,
  };

  if (search && search.trim()) {
    body.term = search.trim();
  }
  // Proxy expects: POST /api/relay/currencies
  const response = await fetch(`${RELAY_API_BASE}/currencies`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`Failed to fetch tokens: ${response.status}`);
  }

  const data = await response.json();
  // Log first few results to verify structure and decimals
  if (data?.length > 0) {
  }

  // Map the response to our RelayToken interface
  // The API may return currencies in a different format
  return (data || []).map((item: any) => ({
    chainId: item.chainId || chainId,
    address: item.address || item.currency?.address || '0x0000000000000000000000000000000000000000',
    symbol: item.symbol || item.currency?.symbol || '',
    name: item.name || item.currency?.name || item.symbol || '',
    decimals: item.decimals ?? item.currency?.decimals ?? 18,
    logoURI: item.metadata?.logoURI || item.logoURI,
  }));
}

/**
 * Get a cross-chain swap quote from Relay
 */
export async function getRelayQuote(params: {
  originChainId: number;
  destinationChainId: number;
  originCurrency: string; // Token address or "0x0" for native
  destinationCurrency: string;
  amount: string; // Amount in wei
  userAddress: string;
  recipient?: string; // Optional different recipient
  slippageTolerance?: number; // Basis points (100 = 1%)
  tradeType?: 'EXACT_INPUT' | 'EXACT_OUTPUT';
}): Promise<RelayQuote> {
  const body: any = {
    user: params.userAddress,
    originChainId: params.originChainId,
    destinationChainId: params.destinationChainId,
    originCurrency: params.originCurrency,
    destinationCurrency: params.destinationCurrency,
    amount: params.amount,
    tradeType: params.tradeType || 'EXACT_INPUT',
    // App fee collection (0.3%)
    appFees: [
      {
        recipient: FEE_RECIPIENT,
        fee: FEE_BPS,
      },
    ],
  };

  if (params.recipient) {
    body.recipient = params.recipient;
  }

  if (params.slippageTolerance !== undefined) {
    body.slippageTolerance = params.slippageTolerance.toString();
  }

  // Use legacy /quote endpoint which accepts token addresses
  const response = await fetch(`${RELAY_API_BASE}/quote`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Unknown error' }));
    throw new Error(error.message || `Quote failed: ${response.status}`);
  }

  const result = await response.json();
  return result;
}

/**
 * Check status of a relay transaction
 */
export async function getRelayStatus(params: {
  requestId: string;
}): Promise<{
  status: 'pending' | 'waiting' | 'success' | 'failure';
  txHash?: string;
  details?: any;
}> {
  // Proxy expects: GET /api/relay/status?requestId=...
  const response = await fetch(
    `${RELAY_API_BASE}/status?requestId=${params.requestId}`,
    {
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to get status: ${response.status}`);
  }

  return response.json();
}

/**
 * Check if a cross-chain route exists between two chains/tokens
 */
export async function checkRelayRoute(params: {
  originChainId: number;
  destinationChainId: number;
  originCurrency: string;
  destinationCurrency: string;
}): Promise<boolean> {
  try {
    // Try to get a minimal quote to verify route exists
    // Proxy expects: POST /api/relay/execute
    const response = await fetch(`${RELAY_API_BASE}/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        user: '0x0000000000000000000000000000000000000001', // Dummy address for route check
        originChainId: params.originChainId,
        destinationChainId: params.destinationChainId,
        originCurrency: params.originCurrency,
        destinationCurrency: params.destinationCurrency,
        amount: '1000000000000000000', // 1 token in wei
        tradeType: 'EXACT_INPUT',
      }),
    });

    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Get chain name from chain ID
 */
export function getRelayChainName(chainId: number): string {
  const chainNames: Record<number, string> = {
    1: 'Ethereum',
    137: 'Polygon',
    56: 'BNB Chain',
    10: 'Optimism',
    42161: 'Arbitrum',
    8453: 'Base',
    43114: 'Avalanche',
    59144: 'Linea',
    534352: 'Scroll',
    81457: 'Blast',
    324: 'zkSync',
    5000: 'Mantle',
    34443: 'Mode',
    7777777: 'Zora',
  };
  return chainNames[chainId] || `Chain ${chainId}`;
}

/**
 * Check if cross-chain swap is available
 * Returns true if origin and destination are different chains
 */
export function isCrossChainSwap(originChainId: number, destinationChainId: number): boolean {
  return originChainId !== destinationChainId;
}

/**
 * Get the token address format for Relay API
 * Returns 0x0 for native tokens, contract address otherwise
 */
export function getRelayTokenAddress(contractAddress: string | undefined, isNative: boolean): string {
  if (isNative || !contractAddress) {
    return RELAY_NATIVE_ADDRESS;
  }
  return contractAddress;
}

/**
 * Format amount for display from wei
 */
export function formatRelayAmount(amount: string, decimals: number): string {
  const num = parseFloat(amount) / Math.pow(10, decimals);
  if (num < 0.0001) return '<0.0001';
  if (num < 1) return num.toFixed(6);
  if (num < 1000) return num.toFixed(4);
  return num.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

/**
 * Parse user input to wei
 */
export function parseRelayAmount(amount: string, decimals: number): string {
  const num = parseFloat(amount);
  if (isNaN(num)) return '0';
  return BigInt(Math.floor(num * Math.pow(10, decimals))).toString();
}
