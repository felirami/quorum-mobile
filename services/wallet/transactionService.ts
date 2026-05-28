/**
 * Transaction Service - Sign and broadcast EVM transactions
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  type Hash,
  type Hex,
  type Address,
  type Chain,
  formatEther,
  parseEther,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
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
  hyperEvm,
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
  999: hyperEvm,
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
  1, 10, 56, 137, 324, 999, 8453, 42161, 43114, 59144, 534352, 81457, 100, 42220, 7777777
]);

// Get RPC URL for a chain (via proxy)
// Proxy expects: /api/alchemy/{chainId}/rpc
function getRpcUrl(chainId: number): string {
  if (SUPPORTED_CHAIN_IDS.has(chainId)) {
    return `${RPC_PROXY_BASE}/api/alchemy/${chainId}/rpc`;
  }
  throw new Error(`Unsupported chain: ${chainId}`);
}

export interface SwapTransaction {
  to: string;
  data: string;
  value?: string;
  gas?: string;
  gasPrice?: string;
  chainId: number;
}

export interface TransactionResult {
  hash: Hash;
  chainId: number;
}

/**
 * Send a swap transaction
 */
export async function sendSwapTransaction(
  privateKey: string,
  transaction: SwapTransaction
): Promise<TransactionResult> {
  const { chainId, to, data, value, gas, gasPrice } = transaction;

  const chain = CHAIN_MAP[chainId];
  if (!chain) {
    throw new Error(`Unsupported chain ID: ${chainId}`);
  }

  // Format private key
  const formattedKey = (privateKey.startsWith('0x')
    ? privateKey
    : `0x${privateKey}`) as Hex;

  const account = privateKeyToAccount(formattedKey);
  const transport = http(getRpcUrl(chainId));

  const publicClient = createPublicClient({
    chain,
    transport,
  });

  const walletClient = createWalletClient({
    account,
    chain,
    transport,
  });

  // Estimate gas if not provided
  let gasLimit = gas ? BigInt(gas) : undefined;
  if (!gasLimit) {
    try {
      gasLimit = await publicClient.estimateGas({
        to: to as Address,
        data: data as Hex,
        value: value ? BigInt(value) : undefined,
        account: account.address,
      });
      // Add 20% buffer for safety
      gasLimit = (gasLimit * 120n) / 100n;
    } catch (err) {
      // Use a reasonable default
      gasLimit = 300000n;
    }
  }
  // Send the transaction
  const hash = await walletClient.sendTransaction({
    to: to as Address,
    data: data as Hex,
    value: value ? BigInt(value) : undefined,
    gas: gasLimit,
    gasPrice: gasPrice ? BigInt(gasPrice) : undefined,
    chain,
    account,
  });
  return {
    hash,
    chainId,
  };
}

/**
 * Wait for a transaction to be confirmed
 */
export async function waitForTransaction(
  chainId: number,
  hash: Hash,
  confirmations: number = 1
): Promise<{ success: boolean; blockNumber?: bigint }> {
  const chain = CHAIN_MAP[chainId];
  if (!chain) {
    throw new Error(`Unsupported chain ID: ${chainId}`);
  }

  const transport = http(getRpcUrl(chainId));
  const publicClient = createPublicClient({
    chain,
    transport,
  });

  try {
    const receipt = await publicClient.waitForTransactionReceipt({
      hash,
      confirmations,
      timeout: 60_000, // 60 seconds
    });

    return {
      success: receipt.status === 'success',
      blockNumber: receipt.blockNumber,
    };
  } catch (err) {
    throw err;
  }
}

/**
 * Get transaction status
 */
export async function getTransactionStatus(
  chainId: number,
  hash: Hash
): Promise<'pending' | 'success' | 'failed' | 'not_found'> {
  const chain = CHAIN_MAP[chainId];
  if (!chain) {
    throw new Error(`Unsupported chain ID: ${chainId}`);
  }

  const transport = http(getRpcUrl(chainId));
  const publicClient = createPublicClient({
    chain,
    transport,
  });

  try {
    const receipt = await publicClient.getTransactionReceipt({ hash });
    return receipt.status === 'success' ? 'success' : 'failed';
  } catch (err: unknown) {
    // Transaction not yet mined
    if (err instanceof Error && err.message?.includes('could not be found')) {
      // Check if transaction exists but not mined
      try {
        const tx = await publicClient.getTransaction({ hash });
        if (tx) return 'pending';
      } catch {
        return 'not_found';
      }
    }
    return 'not_found';
  }
}

/**
 * Check ERC20 token allowance
 */
export async function checkAllowance(
  chainId: number,
  tokenAddress: string,
  ownerAddress: string,
  spenderAddress: string
): Promise<bigint> {
  const chain = CHAIN_MAP[chainId];
  if (!chain) {
    throw new Error(`Unsupported chain ID: ${chainId}`);
  }

  const transport = http(getRpcUrl(chainId));
  const publicClient = createPublicClient({
    chain,
    transport,
  });

  // ERC20 allowance function signature
  const allowanceData = `0xdd62ed3e${ownerAddress.slice(2).padStart(64, '0')}${spenderAddress.slice(2).padStart(64, '0')}` as Hex;

  const result = await publicClient.call({
    to: tokenAddress as Address,
    data: allowanceData,
  });

  if (!result.data) return 0n;
  return BigInt(result.data);
}

/**
 * Approve ERC20 token spending
 */
export async function approveToken(
  privateKey: string,
  chainId: number,
  tokenAddress: string,
  spenderAddress: string,
  amount: bigint = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff') // Max uint256
): Promise<Hash> {
  const chain = CHAIN_MAP[chainId];
  if (!chain) {
    throw new Error(`Unsupported chain ID: ${chainId}`);
  }

  const formattedKey = (privateKey.startsWith('0x')
    ? privateKey
    : `0x${privateKey}`) as Hex;

  const account = privateKeyToAccount(formattedKey);
  const transport = http(getRpcUrl(chainId));

  const walletClient = createWalletClient({
    account,
    chain,
    transport,
  });

  // ERC20 approve function signature + spender + amount
  const approveData = `0x095ea7b3${spenderAddress.slice(2).padStart(64, '0')}${amount.toString(16).padStart(64, '0')}` as Hex;
  const hash = await walletClient.sendTransaction({
    to: tokenAddress as Address,
    data: approveData,
    chain,
    account,
  });
  return hash;
}

/**
 * Get block explorer URL for a transaction
 */
export function getExplorerUrl(chainId: number, hash: Hash): string {
  const explorers: Record<number, string> = {
    1: 'https://etherscan.io/tx/',
    10: 'https://optimistic.etherscan.io/tx/',
    56: 'https://bscscan.com/tx/',
    137: 'https://polygonscan.com/tx/',
    324: 'https://explorer.zksync.io/tx/',
    8453: 'https://basescan.org/tx/',
    42161: 'https://arbiscan.io/tx/',
    43114: 'https://snowtrace.io/tx/',
    59144: 'https://lineascan.build/tx/',
    534352: 'https://scrollscan.com/tx/',
    81457: 'https://blastscan.io/tx/',
    100: 'https://gnosisscan.io/tx/',
    42220: 'https://celoscan.io/tx/',
    7777777: 'https://explorer.zora.energy/tx/',
  };

  const baseUrl = explorers[chainId] || `https://etherscan.io/tx/`;
  return `${baseUrl}${hash}`;
}

// L2 chains that have additional L1 data fees
const L2_CHAINS = new Set([10, 8453, 42161, 59144, 534352, 81457, 7777777]); // Optimism, Base, Arbitrum, Linea, Scroll, Blast, Zora

/**
 * Estimate gas cost for a native token transfer
 * Returns the cost in wei as a bigint
 */
export async function estimateTransferGasCost(chainId: number): Promise<bigint> {
  const chain = CHAIN_MAP[chainId];
  if (!chain) {
    throw new Error(`Unsupported chain ID: ${chainId}`);
  }

  const transport = http(getRpcUrl(chainId));
  const publicClient = createPublicClient({
    chain,
    transport,
  });

  // Get current gas price
  const gasPrice = await publicClient.getGasPrice();

  // Native transfer uses 21000 gas
  const gasLimit = 21000n;

  // Calculate base execution cost
  let gasCost = gasPrice * gasLimit;

  // For L2 chains, add estimated L1 data fee
  // L1 data fee can be significant - use conservative estimate
  if (L2_CHAINS.has(chainId)) {
    // L1 data fee for a simple transfer is roughly 500-2000 gwei on Base/OP
    // Use 5000 gwei (~0.000005 ETH) as conservative buffer for L1 data
    const l1DataFeeBuffer = 5000000000000n; // 5000 gwei
    gasCost = gasCost + l1DataFeeBuffer;
  }

  // Add 50% buffer for price fluctuation
  gasCost = (gasCost * 150n) / 100n;

  return gasCost;
}
