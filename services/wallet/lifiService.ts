/**
 * Li.Fi integration for cross-chain and same-chain EVM swaps
 *
 * Li.Fi is a DEX/bridge aggregator supporting 58+ chains including Hyperliquid.
 * It aggregates liquidity from multiple DEXs and bridges to find optimal routes.
 */

// Li.Fi API (via proxy)
const RPC_PROXY_BASE = 'https://rpc-proxy.quorummessenger.com';
const LIFI_API_BASE = `${RPC_PROXY_BASE}/api/lifi`;

// Fee configuration - 0.3% (30 basis points)
// Note: Li.Fi uses a different fee structure - integrator fees
const INTEGRATOR = 'Quorum';
const FEE_BPS = 0.003; // 0.3% as decimal
const FEE_RECIPIENT = '0xb53561b0Ff4D499F25A897e242Cb6E0E7879F6C2';

// Chain IDs supported by Li.Fi (subset of most common)
export const LIFI_CHAIN_IDS: Record<string, number> = {
  ethereum: 1,
  polygon: 137,
  bsc: 56,
  optimism: 10,
  arbitrum: 42161,
  base: 8453,
  avalanche: 43114,
  gnosis: 100,
  linea: 59144,
  scroll: 534352,
  blast: 81457,
  zksync: 324,
  mantle: 5000,
  mode: 34443,
  hyperevm: 999,
  berachain: 80094,
  abstract: 2741,
  unichain: 130,
  sei: 1329,
  sonic: 146,
  taiko: 167000,
  celo: 42220,
  moonbeam: 1284,
  metis: 1088,
  fraxtal: 252,
  ink: 57073,
  apechain: 33139,
  worldchain: 480,
  zora: 7777777,
  bob: 60808,
  rootstock: 30,
  cronos: 25,
  fuse: 122,
  flare: 14,
  boba: 288,
};

// Native token address
export const LIFI_NATIVE_ADDRESS = '0x0000000000000000000000000000000000000000';

export interface LifiQuote {
  id: string;
  type: string;
  tool: string;
  toolDetails: {
    key: string;
    name: string;
    logoURI: string;
  };
  action: {
    fromChainId: number;
    toChainId: number;
    fromToken: LifiToken;
    toToken: LifiToken;
    fromAmount: string;
    slippage: number;
    fromAddress: string;
    toAddress: string;
  };
  estimate: {
    fromAmount: string;
    toAmount: string;
    toAmountMin: string;
    approvalAddress: string;
    executionDuration: number;
    feeCosts: LifiFeeCost[];
    gasCosts: LifiGasCost[];
  };
  transactionRequest?: {
    from: string;
    to: string;
    chainId: number;
    data: string;
    value: string;
    gasPrice?: string;
    gasLimit?: string;
  };
  includedSteps: LifiStep[];
}

export interface LifiToken {
  address: string;
  chainId: number;
  symbol: string;
  decimals: number;
  name: string;
  priceUSD?: string;
  logoURI?: string;
}

export interface LifiFeeCost {
  name: string;
  description: string;
  percentage: string;
  token: LifiToken;
  amount: string;
  amountUSD: string;
  included: boolean;
}

export interface LifiGasCost {
  type: string;
  estimate: string;
  limit: string;
  amount: string;
  amountUSD: string;
  price: string;
  token: LifiToken;
}

export interface LifiStep {
  id: string;
  type: string;
  tool: string;
  action: {
    fromChainId: number;
    toChainId: number;
    fromToken: LifiToken;
    toToken: LifiToken;
    fromAmount: string;
  };
  estimate: {
    fromAmount: string;
    toAmount: string;
    toAmountMin: string;
    approvalAddress: string;
    executionDuration: number;
  };
}

export interface LifiTokensResponse {
  tokens: Record<string, LifiToken[]>;
}

export interface LifiRoutesRequest {
  fromChainId: number;
  toChainId: number;
  fromTokenAddress: string;
  toTokenAddress: string;
  fromAmount: string;
  fromAddress: string;
  toAddress?: string;
  slippage?: number;
  integrator?: string;
  fee?: number;
}

export interface LifiRoutesResponse {
  routes: LifiQuote[];
}

/**
 * Check if a chain is supported by Li.Fi
 */
export function isLifiSupported(chain: string): boolean {
  return chain.toLowerCase() in LIFI_CHAIN_IDS;
}

/**
 * Get Li.Fi chain ID for a chain name
 */
export function getLifiChainId(chain: string): number | undefined {
  return LIFI_CHAIN_IDS[chain.toLowerCase()];
}

/**
 * Get supported chains
 */
export function getLifiSupportedChains(): string[] {
  return Object.keys(LIFI_CHAIN_IDS);
}

/**
 * Get tokens available on a chain
 */
export async function getLifiTokens(chainId: number): Promise<LifiToken[]> {
  try {
    const response = await fetch(`${LIFI_API_BASE}/tokens?chains=${chainId}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch tokens: ${response.status}`);
    }

    const data: LifiTokensResponse = await response.json();
    return data.tokens[chainId.toString()] || [];
  } catch (error) {
    return [];
  }
}

/**
 * Search tokens across chains
 */
export async function searchLifiTokens(
  query: string,
  chainId?: number
): Promise<LifiToken[]> {
  try {
    const chains = chainId ? chainId.toString() : Object.values(LIFI_CHAIN_IDS).join(',');
    const response = await fetch(`${LIFI_API_BASE}/tokens?chains=${chains}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch tokens: ${response.status}`);
    }

    const data: LifiTokensResponse = await response.json();
    const allTokens: LifiToken[] = [];

    for (const tokens of Object.values(data.tokens)) {
      allTokens.push(...tokens);
    }

    // Filter by query
    const lowerQuery = query.toLowerCase();
    return allTokens.filter(token =>
      token.symbol.toLowerCase().includes(lowerQuery) ||
      token.name.toLowerCase().includes(lowerQuery) ||
      token.address.toLowerCase() === lowerQuery
    ).slice(0, 30);
  } catch (error) {
    return [];
  }
}

/**
 * Get quote for a swap
 */
export async function getLifiQuote(
  fromChainId: number,
  toChainId: number,
  fromTokenAddress: string,
  toTokenAddress: string,
  fromAmount: string,
  fromAddress: string,
  slippage: number = 0.5 // 0.5% default
): Promise<LifiQuote> {
  const params = new URLSearchParams({
    fromChain: fromChainId.toString(),
    toChain: toChainId.toString(),
    fromToken: fromTokenAddress,
    toToken: toTokenAddress,
    fromAmount,
    fromAddress,
    toAddress: fromAddress, // Same address for now
    slippage: (slippage / 100).toString(), // Convert to decimal
    integrator: INTEGRATOR,
    fee: FEE_BPS.toString(),
  });

  const response = await fetch(`${LIFI_API_BASE}/quote?${params}`);

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Li.Fi quote failed: ${error}`);
  }

  return response.json();
}

/**
 * Get multiple routes for a swap
 */
export async function getLifiRoutes(
  request: LifiRoutesRequest
): Promise<LifiRoutesResponse> {
  const body = {
    ...request,
    toAddress: request.toAddress || request.fromAddress,
    slippage: request.slippage ? request.slippage / 100 : 0.005,
    integrator: INTEGRATOR,
    fee: FEE_BPS,
    options: {
      slippage: request.slippage ? request.slippage / 100 : 0.005,
      integrator: INTEGRATOR,
      fee: FEE_BPS,
      allowSwitchChain: true,
      bridges: {
        allow: [], // Allow all bridges
      },
      exchanges: {
        allow: [], // Allow all exchanges
      },
    },
  };

  const response = await fetch(`${LIFI_API_BASE}/routes`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Li.Fi routes failed: ${error}`);
  }

  return response.json();
}

/**
 * Get step transaction data
 */
export async function getLifiStepTransaction(
  step: LifiStep,
  fromAddress: string
): Promise<LifiQuote> {
  const response = await fetch(`${LIFI_API_BASE}/step`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ...step,
      fromAddress,
      toAddress: fromAddress,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Li.Fi step failed: ${error}`);
  }

  return response.json();
}

/**
 * Check token allowance
 */
export async function checkLifiAllowance(
  chainId: number,
  tokenAddress: string,
  ownerAddress: string,
  spenderAddress: string
): Promise<string> {
  // Native token doesn't need allowance
  if (tokenAddress === LIFI_NATIVE_ADDRESS) {
    return 'unlimited';
  }

  const params = new URLSearchParams({
    chain: chainId.toString(),
    token: tokenAddress,
    owner: ownerAddress,
    spender: spenderAddress,
  });

  const response = await fetch(`${LIFI_API_BASE}/allowance?${params}`);

  if (!response.ok) {
    throw new Error('Failed to check allowance');
  }

  const data = await response.json();
  return data.allowance || '0';
}

/**
 * Get approval transaction data
 */
export async function getLifiApprovalData(
  chainId: number,
  tokenAddress: string,
  ownerAddress: string,
  spenderAddress: string,
  amount: string
): Promise<{ to: string; data: string }> {
  const params = new URLSearchParams({
    chain: chainId.toString(),
    token: tokenAddress,
    owner: ownerAddress,
    spender: spenderAddress,
    amount,
  });

  const response = await fetch(`${LIFI_API_BASE}/approve?${params}`);

  if (!response.ok) {
    throw new Error('Failed to get approval data');
  }

  return response.json();
}

/**
 * Get transaction status
 */
export async function getLifiStatus(txHash: string, chainId: number): Promise<{
  status: 'PENDING' | 'DONE' | 'FAILED' | 'NOT_FOUND';
  substatus?: string;
  receiving?: {
    chainId: number;
    txHash: string;
    amount: string;
    token: LifiToken;
  };
}> {
  const params = new URLSearchParams({
    txHash,
    bridge: 'lifi',
    fromChain: chainId.toString(),
  });

  const response = await fetch(`${LIFI_API_BASE}/status?${params}`);

  if (!response.ok) {
    return { status: 'NOT_FOUND' };
  }

  return response.json();
}

/**
 * Format token amount for display
 */
export function formatLifiAmount(amount: string, decimals: number): string {
  const num = Number(amount) / Math.pow(10, decimals);
  if (num === 0) return '0';
  if (num < 0.0001) return '<0.0001';
  if (num < 1) return num.toFixed(6);
  if (num < 1000) return num.toFixed(4);
  return num.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

/**
 * Parse token amount from display string
 */
export function parseLifiAmount(amount: string, decimals: number): string {
  const num = parseFloat(amount);
  if (isNaN(num)) return '0';
  return Math.floor(num * Math.pow(10, decimals)).toString();
}

/**
 * Get explorer URL for a chain
 */
export function getLifiExplorerUrl(chainId: number, txHash: string): string {
  const explorers: Record<number, string> = {
    1: 'https://etherscan.io/tx/',
    137: 'https://polygonscan.com/tx/',
    56: 'https://bscscan.com/tx/',
    10: 'https://optimistic.etherscan.io/tx/',
    42161: 'https://arbiscan.io/tx/',
    8453: 'https://basescan.org/tx/',
    43114: 'https://snowtrace.io/tx/',
    100: 'https://gnosisscan.io/tx/',
    59144: 'https://lineascan.build/tx/',
    534352: 'https://scrollscan.com/tx/',
    81457: 'https://blastscan.io/tx/',
    324: 'https://explorer.zksync.io/tx/',
    5000: 'https://mantlescan.xyz/tx/',
    34443: 'https://modescan.io/tx/',
    999: 'https://hyperscan.xyz/tx/', // HyperEVM
    80094: 'https://bartio.beratrail.io/tx/', // Berachain
    7777777: 'https://explorer.zora.energy/tx/',
  };

  const baseUrl = explorers[chainId] || 'https://etherscan.io/tx/';
  return `${baseUrl}${txHash}`;
}

/**
 * Check if this is a cross-chain swap
 */
export function isLifiCrossChain(fromChainId: number, toChainId: number): boolean {
  return fromChainId !== toChainId;
}
