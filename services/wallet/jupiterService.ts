/**
 * Jupiter Aggregator integration for Solana SPL token swaps
 *
 * Jupiter is the leading DEX aggregator on Solana, providing best-price
 * routing across Raydium, Orca, Phoenix, and other Solana DEXs.
 */

import { Connection, PublicKey, VersionedTransaction } from '@solana/web3.js';
import bs58 from 'bs58';

// RPC Proxy base URL
const RPC_PROXY_BASE = 'https://rpc-proxy.quorummessenger.com';

// Jupiter API (via proxy)
const JUPITER_API_BASE = `${RPC_PROXY_BASE}/api/solana/jupiter`;

// Solana RPC (via proxy)
// Proxy expects: /api/solana/rpc for JSON-RPC calls
const SOLANA_RPC = `${RPC_PROXY_BASE}/api/solana/rpc`;

// Fee configuration - 0.3% (30 basis points)
const FEE_BPS = 30;
const FEE_RECIPIENT = 'F1v4NTmuBvveGU6ppcaYKs5eQuovVjAtdqF8rJboFXRK';

// Native SOL mint address
export const SOL_MINT = 'So11111111111111111111111111111111111111112';

// Common SPL token mints
export const COMMON_SPL_TOKENS: Record<string, { mint: string; symbol: string; decimals: number; name: string; logoURI?: string }> = {
  SOL: { mint: SOL_MINT, symbol: 'SOL', decimals: 9, name: 'Solana', logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png' },
  USDC: { mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', symbol: 'USDC', decimals: 6, name: 'USD Coin', logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png' },
  USDT: { mint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', symbol: 'USDT', decimals: 6, name: 'Tether USD', logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.png' },
  BONK: { mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', symbol: 'BONK', decimals: 5, name: 'Bonk', logoURI: 'https://arweave.net/hQiPZOsRZXGXBJd_82PhVdlM_hACsT_q6wqwf5cSY7I' },
  JUP: { mint: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN', symbol: 'JUP', decimals: 6, name: 'Jupiter', logoURI: 'https://static.jup.ag/jup/icon.png' },
  WIF: { mint: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm', symbol: 'WIF', decimals: 6, name: 'dogwifhat', logoURI: 'https://bafkreibk3covs5ltyqxa272uodhber6kksiakq7sxd7x5e7bjvvhdngqcu.ipfs.nftstorage.link' },
  PYTH: { mint: 'HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3', symbol: 'PYTH', decimals: 6, name: 'Pyth Network', logoURI: 'https://pyth.network/token.svg' },
  JTO: { mint: 'jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL', symbol: 'JTO', decimals: 9, name: 'Jito', logoURI: 'https://metadata.jito.network/token/jto/image' },
  RAY: { mint: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R', symbol: 'RAY', decimals: 6, name: 'Raydium', logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R/logo.png' },
  ORCA: { mint: 'orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE', symbol: 'ORCA', decimals: 6, name: 'Orca', logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE/logo.png' },
  mSOL: { mint: 'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So', symbol: 'mSOL', decimals: 9, name: 'Marinade staked SOL', logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So/logo.png' },
  RENDER: { mint: 'rndrizKT3MK1iimdxRdWabcF7Zg7AR5T4nud4EkHBof', symbol: 'RENDER', decimals: 8, name: 'Render Token', logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/rndrizKT3MK1iimdxRdWabcF7Zg7AR5T4nud4EkHBof/logo.png' },
  HNT: { mint: 'hntyVP6YFm1Hg25TN9WGLqM12b8TQmcknKrdu1oxWux', symbol: 'HNT', decimals: 8, name: 'Helium', logoURI: 'https://s2.coinmarketcap.com/static/img/coins/64x64/5665.png' },
};

export interface JupiterQuote {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: 'ExactIn' | 'ExactOut';
  slippageBps: number;
  platformFee: {
    amount: string;
    feeBps: number;
  } | null;
  priceImpactPct: string;
  routePlan: JupiterRoutePlan[];
  contextSlot: number;
  timeTaken: number;
}

export interface JupiterRoutePlan {
  swapInfo: {
    ammKey: string;
    label: string;
    inputMint: string;
    outputMint: string;
    inAmount: string;
    outAmount: string;
    feeAmount: string;
    feeMint: string;
  };
  percent: number;
}

export interface JupiterSwapResult {
  swapTransaction: string; // Base64 encoded serialized transaction
  lastValidBlockHeight: number;
  prioritizationFeeLamports: number;
}

export interface JupiterToken {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
  tags?: string[];
}

/**
 * Get a quote for swapping SPL tokens via Jupiter
 */
export async function getJupiterQuote(
  inputMint: string,
  outputMint: string,
  amount: string,
  slippageBps: number = 50 // 0.5% default slippage
): Promise<JupiterQuote> {
  const params = new URLSearchParams({
    inputMint,
    outputMint,
    amount,
    slippageBps: slippageBps.toString(),
    platformFeeBps: FEE_BPS.toString(),
  });

  const url = `${JUPITER_API_BASE}/quote?${params}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Jupiter quote failed: ${error}`);
  }

  const data = await response.json();
  return data;
}

/**
 * Get swap transaction from Jupiter
 */
export async function getJupiterSwapTransaction(
  quote: JupiterQuote,
  userPublicKey: string,
  wrapAndUnwrapSol: boolean = true
): Promise<JupiterSwapResult> {
  const response = await fetch(`${JUPITER_API_BASE}/swap`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      quoteResponse: quote,
      userPublicKey,
      wrapAndUnwrapSol,
      feeAccount: FEE_RECIPIENT,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: 'auto',
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    // Parse error for user-friendly messages
    try {
      const errorJson = JSON.parse(error);
      if (errorJson.errorCode === 'MARKET_NOT_FOUND') {
        throw new Error('No liquidity available for this swap. Try a different token pair.');
      }
    } catch (e) {
      // Not JSON or parsing failed
    }
    throw new Error(`Jupiter swap failed: ${error}`);
  }

  return response.json();
}

/**
 * Execute a Jupiter swap
 */
export async function executeJupiterSwap(
  inputMint: string,
  outputMint: string,
  amount: string,
  privateKeyBase58: string,
  slippageBps: number = 50
): Promise<{ signature: string; inputAmount: string; outputAmount: string }> {
  // Disable WebSocket by only using HTTP
  const connection = new Connection(SOLANA_RPC, {
    commitment: 'confirmed',
    wsEndpoint: undefined,
  });

  // Decode private key
  const privateKeyBytes = bs58.decode(privateKeyBase58);
  const { Keypair } = await import('@solana/web3.js');
  const keypair = Keypair.fromSecretKey(privateKeyBytes);
  const quote = await getJupiterQuote(inputMint, outputMint, amount, slippageBps);
  const swapResult = await getJupiterSwapTransaction(quote, keypair.publicKey.toString());

  // Deserialize and sign transaction
  const swapTransactionBuf = Buffer.from(swapResult.swapTransaction, 'base64');
  const transaction = VersionedTransaction.deserialize(swapTransactionBuf);
  transaction.sign([keypair]);

  // Send transaction
  const rawTransaction = transaction.serialize();
  const signature = await connection.sendRawTransaction(rawTransaction, {
    skipPreflight: false, // Enable preflight to catch errors
    preflightCommitment: 'confirmed',
    maxRetries: 2,
  });
  // Poll for confirmation instead of using WebSocket
  const lastValidBlockHeight = swapResult.lastValidBlockHeight;

  let confirmed = false;
  for (let i = 0; i < 30; i++) {
    try {
      const status = await connection.getSignatureStatus(signature);
      if (status.value?.confirmationStatus === 'confirmed' ||
          status.value?.confirmationStatus === 'finalized') {
        if (status.value.err) {
          throw new Error(`Transaction failed: ${JSON.stringify(status.value.err)}`);
        }
        confirmed = true;
        break;
      }

      // Check if blockhash expired
      const blockHeight = await connection.getBlockHeight();
      if (blockHeight > lastValidBlockHeight) {
        throw new Error('Transaction expired: blockhash no longer valid');
      }
    } catch (err) {
      // Ignore WebSocket errors during polling, continue trying
      if (err instanceof Error && err.message.includes('expired')) {
        throw err;
      }
    }

    // Wait 1 second before next poll
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // If we didn't confirm but also didn't error, the transaction might still be processing
  // Return the signature anyway - the user can check explorer
  if (!confirmed) {
  }

  return {
    signature,
    inputAmount: quote.inAmount,
    outputAmount: quote.outAmount,
  };
}

/**
 * Search for tokens on Jupiter
 */
export async function searchJupiterTokens(query: string): Promise<JupiterToken[]> {
  try {
    // Use Jupiter's token list API (via proxy)
    const response = await fetch(`${RPC_PROXY_BASE}/api/solana/jupiter/tokens`);
    if (!response.ok) {
      throw new Error('Failed to fetch token list');
    }

    const tokens: JupiterToken[] = await response.json();

    // Filter by query
    const lowerQuery = query.toLowerCase();
    return tokens.filter(token =>
      token.symbol.toLowerCase().includes(lowerQuery) ||
      token.name.toLowerCase().includes(lowerQuery) ||
      token.address.toLowerCase() === lowerQuery
    ).slice(0, 20); // Limit results
  } catch (error) {
    // Return common tokens as fallback
    return Object.values(COMMON_SPL_TOKENS).filter(token =>
      token.symbol.toLowerCase().includes(query.toLowerCase()) ||
      token.name.toLowerCase().includes(query.toLowerCase())
    ).map(t => ({
      address: t.mint,
      symbol: t.symbol,
      name: t.name,
      decimals: t.decimals,
      logoURI: t.logoURI,
    }));
  }
}

/**
 * Get token info by mint address
 */
export async function getJupiterTokenInfo(mint: string): Promise<JupiterToken | null> {
  // Check common tokens first
  const commonToken = Object.values(COMMON_SPL_TOKENS).find(t => t.mint === mint);
  if (commonToken) {
    return {
      address: commonToken.mint,
      symbol: commonToken.symbol,
      name: commonToken.name,
      decimals: commonToken.decimals,
      logoURI: commonToken.logoURI,
    };
  }

  try {
    const response = await fetch(`${RPC_PROXY_BASE}/api/solana/jupiter/tokens`);
    if (!response.ok) return null;

    const tokens: JupiterToken[] = await response.json();
    return tokens.find(t => t.address === mint) || null;
  } catch {
    return null;
  }
}

/**
 * Format token amount for display
 */
export function formatJupiterAmount(amount: string, decimals: number): string {
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
export function parseJupiterAmount(amount: string, decimals: number): string {
  const num = parseFloat(amount);
  if (isNaN(num)) return '0';
  return Math.floor(num * Math.pow(10, decimals)).toString();
}

/**
 * Check if a swap is supported (Solana only)
 */
export function isJupiterSwapSupported(chain: string): boolean {
  return chain === 'solana';
}

/**
 * Get Solscan explorer URL for a transaction
 */
export function getJupiterExplorerUrl(signature: string): string {
  return `https://solscan.io/tx/${signature}`;
}
