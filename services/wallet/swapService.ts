/**
 * 0x API integration for swaps and bridges
 *
 * Provides functionality for:
 * - Same-chain token swaps
 * - Cross-chain bridges (same asset)
 */

// RPC Proxy base URL
const RPC_PROXY_BASE = 'https://rpc-proxy.quorummessenger.com';

// Fee configuration
const FEE_RECIPIENT = '0xb53561b0Ff4D499F25A897e242Cb6E0E7879F6C2';
const FEE_BPS = 30; // 0.3% fee

// Stablecoin addresses by chain for fee collection
const STABLECOINS: Record<number, string[]> = {
  1: [ // Ethereum
    '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC
    '0xdAC17F958D2ee523a2206206994597C13D831ec7', // USDT
    '0x6B175474E89094C44Da98b954EescdeCB5BE3830', // DAI
  ],
  8453: [ // Base
    '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC
  ],
  42161: [ // Arbitrum
    '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', // USDC
    '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', // USDT
  ],
  10: [ // Optimism
    '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', // USDC
    '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58', // USDT
  ],
  137: [ // Polygon
    '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', // USDC
    '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', // USDT
  ],
  56: [ // BSC
    '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', // USDC
    '0x55d398326f99059fF775485246999027B3197955', // USDT
  ],
  43114: [ // Avalanche
    '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E', // USDC
    '0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7', // USDT
  ],
};

// Tokens to avoid collecting fees in
const AVOID_FEE_TOKENS: string[] = [
  '0x8143182a775c54578c8b7b3ef77982498866945d', // wQUIL on Ethereum
];

/**
 * Check if a token should be avoided for fee collection
 */
function shouldAvoidFeeToken(token: string): boolean {
  return AVOID_FEE_TOKENS.some(t => t.toLowerCase() === token.toLowerCase());
}

/**
 * Get the preferred fee token for a swap (prefer stablecoins, avoid wQUIL)
 */
function getFeeToken(chainId: number, sellToken: string, buyToken: string): string {
  const stables = STABLECOINS[chainId] || [];
  const sellLower = sellToken.toLowerCase();
  const buyLower = buyToken.toLowerCase();

  // Check if either token is a stablecoin (and not in avoid list)
  for (const stable of stables) {
    const stableLower = stable.toLowerCase();
    if (stableLower === sellLower && !shouldAvoidFeeToken(sellToken)) return sellToken;
    if (stableLower === buyLower && !shouldAvoidFeeToken(buyToken)) return buyToken;
  }

  // Fallback: prefer buyToken unless it's in avoid list
  if (!shouldAvoidFeeToken(buyToken)) {
    return buyToken;
  }

  // If buyToken should be avoided, use sellToken
  if (!shouldAvoidFeeToken(sellToken)) {
    return sellToken;
  }

  // Last resort: use buyToken anyway
  return buyToken;
}

// Chain IDs for 0x API
export const CHAIN_IDS: Record<string, number> = {
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
  hyperevm: 999,
};

// 0x API (via proxy)
const ZRX_API_BASE = `${RPC_PROXY_BASE}/api/0x`;

// Supported chain IDs for 0x v2 API
const ZRX_SUPPORTED_CHAINS = [1, 137, 56, 10, 42161, 8453, 43114, 59144, 534352, 81457];

// Native token addresses (0x uses this for ETH, etc.)
export const NATIVE_TOKEN_ADDRESS = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

// Common token addresses by chain
export const COMMON_TOKENS: Record<string, Record<string, { address: string; symbol: string; decimals: number; name?: string }>> = {
  ethereum: {
    ETH: { address: NATIVE_TOKEN_ADDRESS, symbol: 'ETH', decimals: 18, name: 'Ethereum' },
    USDC: { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', symbol: 'USDC', decimals: 6, name: 'USD Coin' },
    USDT: { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', symbol: 'USDT', decimals: 6, name: 'Tether' },
    WETH: { address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', symbol: 'WETH', decimals: 18, name: 'Wrapped Ether' },
    DAI: { address: '0x6B175474E89094C44Da98b954EescdeCB5BE3830', symbol: 'DAI', decimals: 18, name: 'Dai' },
    WBTC: { address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', symbol: 'WBTC', decimals: 8, name: 'Wrapped Bitcoin' },
    wQUIL: { address: '0x8143182a775C54578c8B7b3Ef77982498866945D', symbol: 'wQUIL', decimals: 8, name: 'Wrapped QUIL' },
    LINK: { address: '0x514910771AF9Ca656af840dff83E8264EcF986CA', symbol: 'LINK', decimals: 18, name: 'Chainlink' },
    UNI: { address: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984', symbol: 'UNI', decimals: 18, name: 'Uniswap' },
    AAVE: { address: '0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9', symbol: 'AAVE', decimals: 18, name: 'Aave' },
    MKR: { address: '0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2', symbol: 'MKR', decimals: 18, name: 'Maker' },
    SNX: { address: '0xC011a73ee8576Fb46F5E1c5751cA3B9Fe0af2a6F', symbol: 'SNX', decimals: 18, name: 'Synthetix' },
    CRV: { address: '0xD533a949740bb3306d119CC777fa900bA034cd52', symbol: 'CRV', decimals: 18, name: 'Curve' },
    LDO: { address: '0x5A98FcBEA516Cf06857215779Fd812CA3beF1B32', symbol: 'LDO', decimals: 18, name: 'Lido DAO' },
    APE: { address: '0x4d224452801ACEd8B2F0aebE155379bb5D594381', symbol: 'APE', decimals: 18, name: 'ApeCoin' },
    SHIB: { address: '0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE', symbol: 'SHIB', decimals: 18, name: 'Shiba Inu' },
    PEPE: { address: '0x6982508145454Ce325dDbE47a25d4ec3d2311933', symbol: 'PEPE', decimals: 18, name: 'Pepe' },
  },
  base: {
    ETH: { address: NATIVE_TOKEN_ADDRESS, symbol: 'ETH', decimals: 18, name: 'Ethereum' },
    USDC: { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', symbol: 'USDC', decimals: 6, name: 'USD Coin' },
    WETH: { address: '0x4200000000000000000000000000000000000006', symbol: 'WETH', decimals: 18, name: 'Wrapped Ether' },
    DAI: { address: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', symbol: 'DAI', decimals: 18, name: 'Dai' },
    cbETH: { address: '0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22', symbol: 'cbETH', decimals: 18, name: 'Coinbase Wrapped Staked ETH' },
    USDbC: { address: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA', symbol: 'USDbC', decimals: 6, name: 'USD Base Coin' },
    AERO: { address: '0x940181a94A35A4569E4529A3CDfB74e38FD98631', symbol: 'AERO', decimals: 18, name: 'Aerodrome' },
    BRETT: { address: '0x532f27101965dd16442E59d40670FaF5eBB142E4', symbol: 'BRETT', decimals: 18, name: 'Brett' },
    DEGEN: { address: '0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed', symbol: 'DEGEN', decimals: 18, name: 'Degen' },
    TOSHI: { address: '0xAC1Bd2486aAf3B5C0fc3Fd868558b082a531B2B4', symbol: 'TOSHI', decimals: 18, name: 'Toshi' },
  },
  arbitrum: {
    ETH: { address: NATIVE_TOKEN_ADDRESS, symbol: 'ETH', decimals: 18, name: 'Ethereum' },
    USDC: { address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', symbol: 'USDC', decimals: 6, name: 'USD Coin' },
    USDT: { address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', symbol: 'USDT', decimals: 6, name: 'Tether' },
    WETH: { address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', symbol: 'WETH', decimals: 18, name: 'Wrapped Ether' },
    WBTC: { address: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f', symbol: 'WBTC', decimals: 8, name: 'Wrapped Bitcoin' },
    ARB: { address: '0x912CE59144191C1204E64559FE8253a0e49E6548', symbol: 'ARB', decimals: 18, name: 'Arbitrum' },
    GMX: { address: '0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a', symbol: 'GMX', decimals: 18, name: 'GMX' },
    LINK: { address: '0xf97f4df75117a78c1A5a0DBb814Af92458539FB4', symbol: 'LINK', decimals: 18, name: 'Chainlink' },
    UNI: { address: '0xFa7F8980b0f1E64A2062791cc3b0871572f1F7f0', symbol: 'UNI', decimals: 18, name: 'Uniswap' },
    DAI: { address: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1', symbol: 'DAI', decimals: 18, name: 'Dai' },
  },
  optimism: {
    ETH: { address: NATIVE_TOKEN_ADDRESS, symbol: 'ETH', decimals: 18, name: 'Ethereum' },
    USDC: { address: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', symbol: 'USDC', decimals: 6, name: 'USD Coin' },
    USDT: { address: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58', symbol: 'USDT', decimals: 6, name: 'Tether' },
    WETH: { address: '0x4200000000000000000000000000000000000006', symbol: 'WETH', decimals: 18, name: 'Wrapped Ether' },
    OP: { address: '0x4200000000000000000000000000000000000042', symbol: 'OP', decimals: 18, name: 'Optimism' },
    WBTC: { address: '0x68f180fcCe6836688e9084f035309E29Bf0A2095', symbol: 'WBTC', decimals: 8, name: 'Wrapped Bitcoin' },
    LINK: { address: '0x350a791Bfc2C21F9Ed5d10980Dad2e2638ffa7f6', symbol: 'LINK', decimals: 18, name: 'Chainlink' },
    DAI: { address: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1', symbol: 'DAI', decimals: 18, name: 'Dai' },
    SNX: { address: '0x8700dAec35aF8Ff88c16BdF0418774CB3D7599B4', symbol: 'SNX', decimals: 18, name: 'Synthetix' },
    VELO: { address: '0x9560e827aF36c94D2Ac33a39bCE1Fe78631088Db', symbol: 'VELO', decimals: 18, name: 'Velodrome' },
  },
  polygon: {
    POL: { address: NATIVE_TOKEN_ADDRESS, symbol: 'POL', decimals: 18, name: 'Polygon' },
    USDC: { address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', symbol: 'USDC', decimals: 6, name: 'USD Coin' },
    USDT: { address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', symbol: 'USDT', decimals: 6, name: 'Tether' },
    WETH: { address: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619', symbol: 'WETH', decimals: 18, name: 'Wrapped Ether' },
    WBTC: { address: '0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6', symbol: 'WBTC', decimals: 8, name: 'Wrapped Bitcoin' },
    WMATIC: { address: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270', symbol: 'WMATIC', decimals: 18, name: 'Wrapped Matic' },
    LINK: { address: '0x53E0bca35eC356BD5ddDFebbD1Fc0fD03FaBad39', symbol: 'LINK', decimals: 18, name: 'Chainlink' },
    AAVE: { address: '0xD6DF932A45C0f255f85145f286eA0b292B21C90B', symbol: 'AAVE', decimals: 18, name: 'Aave' },
    UNI: { address: '0xb33EaAd8d922B1083446DC23f610c2567fB5180f', symbol: 'UNI', decimals: 18, name: 'Uniswap' },
    DAI: { address: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063', symbol: 'DAI', decimals: 18, name: 'Dai' },
  },
  bsc: {
    BNB: { address: NATIVE_TOKEN_ADDRESS, symbol: 'BNB', decimals: 18, name: 'BNB' },
    USDC: { address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', symbol: 'USDC', decimals: 18, name: 'USD Coin' },
    USDT: { address: '0x55d398326f99059fF775485246999027B3197955', symbol: 'USDT', decimals: 18, name: 'Tether' },
    WBNB: { address: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', symbol: 'WBNB', decimals: 18, name: 'Wrapped BNB' },
    BTCB: { address: '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c', symbol: 'BTCB', decimals: 18, name: 'Bitcoin BEP2' },
    ETH: { address: '0x2170Ed0880ac9A755fd29B2688956BD959F933F8', symbol: 'ETH', decimals: 18, name: 'Ethereum' },
    CAKE: { address: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82', symbol: 'CAKE', decimals: 18, name: 'PancakeSwap' },
    XRP: { address: '0x1D2F0da169ceB9fC7B3144628dB156f3F6c60dBE', symbol: 'XRP', decimals: 18, name: 'XRP' },
  },
  avalanche: {
    AVAX: { address: NATIVE_TOKEN_ADDRESS, symbol: 'AVAX', decimals: 18, name: 'Avalanche' },
    USDC: { address: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E', symbol: 'USDC', decimals: 6, name: 'USD Coin' },
    USDT: { address: '0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7', symbol: 'USDT', decimals: 6, name: 'Tether' },
    WAVAX: { address: '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7', symbol: 'WAVAX', decimals: 18, name: 'Wrapped AVAX' },
    'WETH.e': { address: '0x49D5c2BdFfac6CE2BFdB6640F4F80f226bc10bAB', symbol: 'WETH.e', decimals: 18, name: 'Wrapped Ether' },
    'WBTC.e': { address: '0x50b7545627a5162F82A992c33b87aDc75187B218', symbol: 'WBTC.e', decimals: 8, name: 'Wrapped Bitcoin' },
    JOE: { address: '0x6e84a6216eA6dACC71eE8E6b0a5B7322EEbC0fDd', symbol: 'JOE', decimals: 18, name: 'Trader Joe' },
    LINK: { address: '0x5947BB275c521040051D82396192181b413227A3', symbol: 'LINK', decimals: 18, name: 'Chainlink' },
  },
};

export interface SwapQuote {
  sellToken: string;
  buyToken: string;
  sellAmount: string;
  buyAmount: string;
  minBuyAmount?: string;
  gas?: string;
  totalNetworkFee?: string;
  transaction?: {
    to: string;
    data: string;
    value: string;
    gas: string;
    gasPrice: string;
  };
  allowanceTarget?: string;
  liquidityAvailable?: boolean;
}

export interface GaslessQuote {
  sellToken: string;
  buyToken: string;
  sellAmount: string;
  buyAmount: string;
  minBuyAmount: string;
  price: string;
  estimatedGas: string;
  trade: {
    type: string;
    hash: string;
    eip712: any; // EIP-712 typed data for signing
  };
  approval?: {
    type: string;
    hash: string;
    eip712: any;
  };
  isGasless: true;
}

export interface SwapPrice {
  sellToken: string;
  buyToken: string;
  sellAmount: string;
  buyAmount: string;
  minBuyAmount?: string;
  gas?: string;
  totalNetworkFee?: string;
  liquidityAvailable?: boolean;
}

// Chains that support gasless swaps via 0x Tx Relay
const GASLESS_SUPPORTED_CHAINS = [1, 137, 10, 42161, 8453]; // ETH, Polygon, OP, Arbitrum, Base

/**
 * Check if gasless swaps are supported for this chain and token
 * Gasless requires ERC-20 tokens (not native ETH)
 */
export function isGaslessSupported(chainId: number, sellToken: string): boolean {
  if (!GASLESS_SUPPORTED_CHAINS.includes(chainId)) return false;
  // Native tokens don't support gasless (need to wrap first)
  if (sellToken.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase()) return false;
  return true;
}

export interface BridgeQuote {
  srcChainId: number;
  dstChainId: number;
  srcToken: string;
  dstToken: string;
  srcAmount: string;
  dstAmount: string;
  estimatedTime: number; // seconds
  fee: string;
  route: string;
  tx: {
    to: string;
    data: string;
    value: string;
    gasLimit: string;
  };
}

/**
 * Check if a chain ID is supported by 0x
 */
function isChainSupported(chainId: number): boolean {
  return ZRX_SUPPORTED_CHAINS.includes(chainId);
}

/**
 * Get chain ID from chain name
 */
export function getChainId(chain: string): number | undefined {
  return CHAIN_IDS[chain.toLowerCase()];
}

/**
 * Check if a chain supports 0x swaps
 */
export function isSwapSupported(chain: string): boolean {
  const chainId = getChainId(chain);
  return chainId !== undefined && isChainSupported(chainId);
}

/**
 * Get a swap price quote (no transaction data)
 * Uses 0x Swap API v2 with AllowanceHolder
 */
export async function getSwapPrice(params: {
  chainId: number;
  sellToken: string;
  buyToken: string;
  sellAmount: string;
  takerAddress?: string;
}): Promise<SwapPrice> {
  if (!isChainSupported(params.chainId)) {
    throw new Error(`Chain ${params.chainId} is not supported for swaps`);
  }

  // Determine fee token (prefer stablecoins)
  const feeToken = getFeeToken(params.chainId, params.sellToken, params.buyToken);

  const queryParams = new URLSearchParams({
    chainId: params.chainId.toString(),
    sellToken: params.sellToken,
    buyToken: params.buyToken,
    sellAmount: params.sellAmount,
    ...(params.takerAddress && { taker: params.takerAddress }),
    // Fee collection
    swapFeeRecipient: FEE_RECIPIENT,
    swapFeeBps: FEE_BPS.toString(),
    swapFeeToken: feeToken,
  });

  // Proxy expects: /api/0x/{chainId}/price with chainId in path
  const url = `${ZRX_API_BASE}/${params.chainId}/price?${queryParams}`;
  const response = await fetch(url);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ reason: 'Unknown error' }));
    throw new Error(error.reason || `Swap price failed: ${response.status}`);
  }

  const result = await response.json();
  return result;
}

/**
 * Get a full swap quote with transaction data
 * Uses 0x Swap API v2 with AllowanceHolder
 */
export async function getSwapQuote(params: {
  chainId: number;
  sellToken: string;
  buyToken: string;
  sellAmount: string;
  takerAddress: string;
  slippageBps?: number; // Slippage in basis points (100 = 1%)
}): Promise<SwapQuote> {
  if (!isChainSupported(params.chainId)) {
    throw new Error(`Chain ${params.chainId} is not supported for swaps`);
  }

  // Determine fee token (prefer stablecoins)
  const feeToken = getFeeToken(params.chainId, params.sellToken, params.buyToken);

  const queryParams = new URLSearchParams({
    chainId: params.chainId.toString(),
    sellToken: params.sellToken,
    buyToken: params.buyToken,
    sellAmount: params.sellAmount,
    taker: params.takerAddress,
    slippageBps: (params.slippageBps || 100).toString(), // Default 1%
    // Fee collection
    swapFeeRecipient: FEE_RECIPIENT,
    swapFeeBps: FEE_BPS.toString(),
    swapFeeToken: feeToken,
  });

  // Proxy expects: /api/0x/{chainId}/quote with chainId in path
  const response = await fetch(`${ZRX_API_BASE}/${params.chainId}/quote?${queryParams}`);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ reason: 'Unknown error' }));
    throw new Error(error.reason || `Swap quote failed: ${response.status}`);
  }

  return response.json();
}

/**
 * Get a gasless swap quote using 0x Gasless API v2
 * Gasless swaps allow users to swap without paying gas - gas is covered by market makers
 */
export async function getGaslessQuote(params: {
  chainId: number;
  sellToken: string;
  buyToken: string;
  sellAmount: string;
  takerAddress: string;
  slippageBps?: number; // Slippage in basis points (100 = 1%)
}): Promise<GaslessQuote> {
  // Determine fee token (prefer stablecoins)
  const feeToken = getFeeToken(params.chainId, params.sellToken, params.buyToken);

  const queryParams = new URLSearchParams({
    chainId: params.chainId.toString(),
    sellToken: params.sellToken,
    buyToken: params.buyToken,
    sellAmount: params.sellAmount,
    taker: params.takerAddress,
    slippageBps: (params.slippageBps || 100).toString(), // Default 1%
    tradeSurplusRecipient: params.takerAddress, // User gets any surplus
    // Fee collection
    swapFeeRecipient: FEE_RECIPIENT,
    swapFeeBps: FEE_BPS.toString(),
    swapFeeToken: feeToken,
  });

  // Proxy expects: /api/0x/{chainId}/gasless/quote with chainId in path
  const response = await fetch(`${ZRX_API_BASE}/${params.chainId}/gasless/quote?${queryParams}`);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ reason: 'Unknown error' }));
    throw new Error(error.reason || error.validationErrors?.[0]?.reason || `Gasless quote failed: ${response.status}`);
  }

  const data = await response.json();
  return {
    ...data,
    isGasless: true,
  };
}

/**
 * Split a signature into r, s, v components
 */
export function splitSignature(signature: string): { r: string; s: string; v: number } {
  // Remove 0x prefix if present
  const sig = signature.startsWith('0x') ? signature.slice(2) : signature;

  if (sig.length !== 130) {
    throw new Error(`Invalid signature length: expected 130, got ${sig.length}`);
  }

  const r = '0x' + sig.slice(0, 64);
  const s = '0x' + sig.slice(64, 128);
  const v = parseInt(sig.slice(128, 130), 16);

  return { r, s, v };
}

/**
 * Submit a signed gasless swap to 0x Gasless API
 * Returns the trade hash for status tracking
 */
export async function submitGaslessSwap(params: {
  chainId: number;
  trade: {
    type: string;
    eip712: any;
  };
  tradeSignature: string;
  approval?: {
    type: string;
    eip712: any;
  };
  approvalSignature?: string;
}): Promise<{ tradeHash: string }> {
  // Split trade signature into r, s, v components
  const tradeSig = splitSignature(params.tradeSignature);

  const tradeData = {
    type: params.trade.type,
    eip712: params.trade.eip712,
    signature: {
      r: tradeSig.r,
      s: tradeSig.s,
      v: tradeSig.v,
      signatureType: 2, // EIP712
    },
  };

  const body: any = {
    trade: tradeData,
    chainId: params.chainId,
  };

  // Add approval if present
  if (params.approval && params.approvalSignature) {
    const approvalSig = splitSignature(params.approvalSignature);
    body.approval = {
      type: params.approval.type,
      eip712: params.approval.eip712,
      signature: {
        r: approvalSig.r,
        s: approvalSig.s,
        v: approvalSig.v,
        signatureType: 2, // EIP712
      },
    };
  }

  // Use the direct gasless API endpoint (not permit2)
  const response = await fetch(`${ZRX_API_BASE}/${params.chainId}/gasless/submit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ reason: 'Unknown error' }));
    throw new Error(error.reason || `Gasless swap submission failed: ${response.status}`);
  }

  return response.json();
}

/**
 * Check status of a gasless swap
 */
export async function getGaslessSwapStatus(params: {
  chainId: number;
  tradeHash: string;
}): Promise<{ status: string; transactions: any[] }> {
  // Proxy expects: GET /api/0x/{chainId}/gasless/status/{tradeHash} with chainId in path
  const response = await fetch(`${ZRX_API_BASE}/${params.chainId}/gasless/status/${params.tradeHash}`);

  if (!response.ok) {
    throw new Error(`Failed to get swap status: ${response.status}`);
  }

  return response.json();
}

/**
 * Get a bridge quote for cross-chain transfer
 * Uses 0x's cross-chain API or fallback to aggregator
 */
export async function getBridgeQuote(params: {
  srcChainId: number;
  dstChainId: number;
  srcToken: string;
  dstToken: string;
  amount: string;
  userAddress: string;
}): Promise<BridgeQuote> {
  // 0x doesn't have a native bridge API, so we'll use a simplified approach
  // For production, integrate with LI.FI, Socket, or similar bridge aggregator

  // For now, return a mock quote that explains the limitation
  // In production, this would call a bridge aggregator API

  const response = await fetch(`${RPC_PROXY_BASE}/api/lifi/quote`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  // Simplified bridge quote structure
  // Real implementation would use LI.FI, Socket, or similar
  throw new Error('Bridge functionality requires additional API integration. Please use a dedicated bridge service.');
}

/**
 * Check if token approval is needed for swap
 * Note: This is a stub - actual implementation should use viem/ethers with RPC
 */
export async function checkAllowance(params: {
  chainId: number;
  tokenAddress: string;
  ownerAddress: string;
  spenderAddress: string;
}): Promise<bigint> {
  // For native tokens, no approval needed
  if (params.tokenAddress.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase()) {
    return BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');
  }

  // TODO: Implement using viem/ethers with proper RPC endpoint
  // For now, return 0 to indicate approval is needed
  return BigInt(0);
}

/**
 * Build approval transaction data
 */
export function buildApprovalData(spenderAddress: string, amount?: string): string {
  const maxAmount = amount || '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
  // approve(address,uint256) function selector
  return `0x095ea7b3${spenderAddress.slice(2).padStart(64, '0')}${BigInt(maxAmount).toString(16).padStart(64, '0')}`;
}

/**
 * Format token amount for display
 */
export function formatTokenAmount(amount: string, decimals: number): string {
  const num = parseFloat(amount) / Math.pow(10, decimals);
  if (num < 0.0001) return '<0.0001';
  if (num < 1) return num.toFixed(6);
  if (num < 1000) return num.toFixed(4);
  return num.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

/**
 * Parse user input amount to wei/smallest unit
 * Uses string manipulation to avoid floating point precision issues
 */
export function parseTokenAmount(amount: string, decimals: number): string {
  if (!amount || amount === '') return '0';

  // Remove any commas and whitespace
  const cleanAmount = amount.replace(/,/g, '').trim();

  // Validate it's a valid number
  if (!/^\d*\.?\d*$/.test(cleanAmount) || cleanAmount === '.' || cleanAmount === '') {
    return '0';
  }

  // Split into integer and decimal parts
  const parts = cleanAmount.split('.');
  const integerPart = parts[0] || '0';
  let decimalPart = parts[1] || '';

  // Pad or truncate decimal part to match token decimals
  if (decimalPart.length < decimals) {
    decimalPart = decimalPart.padEnd(decimals, '0');
  } else if (decimalPart.length > decimals) {
    decimalPart = decimalPart.slice(0, decimals);
  }

  // Combine and remove leading zeros (but keep at least one digit)
  const combined = (integerPart + decimalPart).replace(/^0+/, '') || '0';
  return combined;
}

/**
 * Get supported chains for swapping
 */
export function getSupportedSwapChains(): string[] {
  return Object.keys(CHAIN_IDS);
}

// Trusted/verified token list URLs - these are curated and vetted
const VERIFIED_TOKEN_LISTS: Record<number, string[]> = {
  1: [ // Ethereum - use multiple authoritative sources
    'https://tokens.uniswap.org', // Uniswap's curated default list
  ],
  137: [
    'https://api-polygon-tokens.polygon.technology/tokenlists/default.tokenlist.json',
  ],
  42161: [
    'https://tokens.uniswap.org', // Includes Arbitrum tokens
  ],
  10: [
    'https://tokens.uniswap.org', // Includes Optimism tokens
  ],
  8453: [
    'https://tokens.uniswap.org', // Includes Base tokens
  ],
  43114: [
    'https://tokens.coingecko.com/avalanche/all.json',
  ],
};

// Public multi-chain token list URLs for search (more comprehensive)
const TOKEN_LIST_URLS: Record<number, string> = {
  1: 'https://tokens.coingecko.com/uniswap/all.json', // Ethereum
  137: 'https://api-polygon-tokens.polygon.technology/tokenlists/default.tokenlist.json', // Polygon
  42161: 'https://tokens.coingecko.com/arbitrum-one/all.json', // Arbitrum
  10: 'https://tokens.coingecko.com/optimistic-ethereum/all.json', // Optimism
  8453: 'https://tokens.coingecko.com/base/all.json', // Base
  43114: 'https://tokens.coingecko.com/avalanche/all.json', // Avalanche
};

// Cached verified token addresses by chain (lowercase)
const verifiedTokensCache: Record<number, Set<string>> = {};
let verifiedTokensCacheTimestamp = 0;
const VERIFIED_CACHE_DURATION = 60 * 60 * 1000; // 1 hour

/**
 * Clear verified tokens cache for a specific chain or all chains.
 * Call when switching networks or to free memory from unused chain data.
 */
export function clearVerifiedTokensCache(chainId?: number): void {
  if (chainId !== undefined) {
    delete verifiedTokensCache[chainId];
    delete tokenListCache[chainId];
  } else {
    for (const key of Object.keys(verifiedTokensCache)) {
      delete verifiedTokensCache[Number(key)];
    }
    for (const key of Object.keys(tokenListCache)) {
      delete tokenListCache[Number(key)];
    }
    verifiedTokensCacheTimestamp = 0;
  }
}

// Cached token lists by chain
const tokenListCache: Record<number, { tokens: SearchableToken[]; timestamp: number }> = {};
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

export type TokenVerificationStatus = 'verified' | 'unverified' | 'warning';

export interface SearchableToken {
  chainId: number;
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
  verified?: boolean;
  verificationStatus?: TokenVerificationStatus;
}

/**
 * Fetch and cache verified token addresses from trusted lists
 */
async function loadVerifiedTokens(): Promise<void> {
  if (Date.now() - verifiedTokensCacheTimestamp < VERIFIED_CACHE_DURATION) {
    return; // Cache is still valid
  }
  for (const [chainIdStr, urls] of Object.entries(VERIFIED_TOKEN_LISTS)) {
    const chainId = parseInt(chainIdStr);
    const verifiedAddresses = new Set<string>();

    for (const url of urls) {
      try {
        const response = await fetch(url, {
          headers: { 'Accept': 'application/json' },
        });

        if (!response.ok) continue;

        const data = await response.json();
        const tokens = data.tokens || [];

        for (const token of tokens) {
          // Only include tokens for this specific chain
          if (token.chainId === chainId && token.address) {
            verifiedAddresses.add(token.address.toLowerCase());
          }
        }
      } catch {
        // Token list fetch failed — skip this list and continue with others
      }
    }

    // Also add our COMMON_TOKENS as verified (we manually curated these)
    const chainName = Object.entries(CHAIN_IDS).find(([, id]) => id === chainId)?.[0];
    if (chainName && COMMON_TOKENS[chainName]) {
      for (const tokenInfo of Object.values(COMMON_TOKENS[chainName])) {
        if (tokenInfo.address && tokenInfo.address !== NATIVE_TOKEN_ADDRESS) {
          verifiedAddresses.add(tokenInfo.address.toLowerCase());
        }
      }
    }

    verifiedTokensCache[chainId] = verifiedAddresses;
  }

  verifiedTokensCacheTimestamp = Date.now();
}

/**
 * Check if a token is verified
 */
export function isTokenVerified(chainId: number, address: string): boolean {
  if (!address || address === NATIVE_TOKEN_ADDRESS) {
    return true; // Native tokens are always "verified"
  }

  const verifiedSet = verifiedTokensCache[chainId];
  if (!verifiedSet) return false;

  return verifiedSet.has(address.toLowerCase());
}

/**
 * Get verification status for a token
 */
export function getTokenVerificationStatus(chainId: number, address: string, symbol: string): TokenVerificationStatus {
  if (!address || address === NATIVE_TOKEN_ADDRESS) {
    return 'verified';
  }

  // Check if it's in our verified list
  if (isTokenVerified(chainId, address)) {
    return 'verified';
  }

  // Check for common scam patterns
  const symbolUpper = symbol.toUpperCase();
  const highValueSymbols = ['USDT', 'USDC', 'DAI', 'WETH', 'WBTC', 'UNI', 'AAVE', 'LINK', 'ETH', 'BTC'];

  if (highValueSymbols.includes(symbolUpper)) {
    // This symbol claims to be a high-value token but isn't verified - likely a scam
    return 'warning';
  }

  return 'unverified';
}

/**
 * Fetch and cache token list for a chain
 */
async function fetchTokenList(chainId: number): Promise<SearchableToken[]> {
  const cached = tokenListCache[chainId];
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.tokens;
  }

  const url = TOKEN_LIST_URLS[chainId];
  if (!url) {
    return [];
  }

  try {
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    const tokens: SearchableToken[] = (data.tokens || [])
      .filter((t: any) => t.chainId === chainId || !t.chainId)
      .map((t: any) => ({
        chainId: t.chainId || chainId,
        address: t.address,
        symbol: t.symbol,
        name: t.name,
        decimals: t.decimals,
        logoURI: t.logoURI,
      }));

    tokenListCache[chainId] = { tokens, timestamp: Date.now() };
    return tokens;
  } catch (error) {
    return [];
  }
}

/**
 * Search tokens across chains using public token lists
 * Returns tokens matching the search term, with verification status
 * Filters out likely scam tokens and prioritizes verified tokens
 */
export async function searchTokens(params: {
  search: string;
  chainIds?: number[];
  limit?: number;
  includeUnverified?: boolean; // Default false - only show verified tokens
}): Promise<SearchableToken[]> {
  const { search, chainIds = [1, 8453, 42161, 10, 137], limit = 20, includeUnverified = false } = params;

  if (!search || search.length < 2) {
    return [];
  }

  // Ensure verified tokens are loaded
  await loadVerifiedTokens();

  const searchLower = search.toLowerCase();
  const results: SearchableToken[] = [];
  const isAddressSearch = search.startsWith('0x') && search.length >= 40;

  // First, search in COMMON_TOKENS for quick results (these are all verified)
  for (const [chainName, tokens] of Object.entries(COMMON_TOKENS)) {
    const chainId = CHAIN_IDS[chainName];
    if (chainIds && !chainIds.includes(chainId)) continue;

    for (const [, tokenInfo] of Object.entries(tokens)) {
      const matchesAddress = isAddressSearch && tokenInfo.address?.toLowerCase() === searchLower;
      const matchesNameOrSymbol = !isAddressSearch && (
        tokenInfo.symbol.toLowerCase().includes(searchLower) ||
        (tokenInfo.name && tokenInfo.name.toLowerCase().includes(searchLower))
      );
      if (matchesAddress || matchesNameOrSymbol) {
        results.push({
          chainId,
          address: tokenInfo.address,
          symbol: tokenInfo.symbol,
          name: tokenInfo.name || tokenInfo.symbol,
          decimals: tokenInfo.decimals,
          verified: true,
          verificationStatus: 'verified',
        });
      }
    }
  }

  // If we have enough verified results from common tokens, return early
  if (results.length >= limit) {
    return results.slice(0, limit);
  }

  // Fetch and search public token lists in parallel
  const tokenListPromises = chainIds.map(async (chainId) => {
    try {
      const tokens = await fetchTokenList(chainId);
      return tokens
        .filter((t) => {
          if (isAddressSearch) {
            return t.address?.toLowerCase() === searchLower;
          }
          return (
            t.symbol.toLowerCase().includes(searchLower) ||
            t.name.toLowerCase().includes(searchLower)
          );
        })
        .map((t) => ({
          ...t,
          chainId, // Ensure chainId is set
        }));
    } catch {
      return [];
    }
  });

  const chainResults = await Promise.all(tokenListPromises);
  const allMatches = chainResults.flat();

  // Deduplicate and add verification status
  const seen = new Set(results.map((r) => `${r.chainId}-${r.address.toLowerCase()}`));

  for (const token of allMatches) {
    const key = `${token.chainId}-${token.address.toLowerCase()}`;
    if (seen.has(key)) continue;

    const verificationStatus = getTokenVerificationStatus(token.chainId, token.address, token.symbol);

    // Skip tokens with warning status (likely scams impersonating major tokens)
    if (verificationStatus === 'warning') {
      continue;
    }

    // Skip unverified tokens unless explicitly requested
    if (!includeUnverified && verificationStatus === 'unverified') {
      continue;
    }

    results.push({
      ...token,
      verified: verificationStatus === 'verified',
      verificationStatus,
    });
    seen.add(key);

    if (results.length >= limit * 2) break;
  }

  // Sort: verified first, then exact symbol matches, then by symbol length
  results.sort((a, b) => {
    // Verified tokens first
    const aVerified = a.verified ? 0 : 1;
    const bVerified = b.verified ? 0 : 1;
    if (aVerified !== bVerified) return aVerified - bVerified;

    // Exact symbol matches second
    const aExact = a.symbol.toLowerCase() === searchLower ? 0 : 1;
    const bExact = b.symbol.toLowerCase() === searchLower ? 0 : 1;
    if (aExact !== bExact) return aExact - bExact;

    // Shorter symbols (more likely to be the "real" token)
    return a.symbol.length - b.symbol.length;
  });

  return results.slice(0, limit);
}

/**
 * Estimate gas cost in native token
 */
export function estimateGasCost(gasLimit: string, gasPrice: string, decimals: number = 18): string {
  const cost = BigInt(gasLimit) * BigInt(gasPrice);
  return formatTokenAmount(cost.toString(), decimals);
}
