/*
 * Transaction History Service
 *
 * Stores and retrieves transaction history using MMKV storage.
 * Also fetches on-chain transaction history from block explorer APIs.
 * Transactions are stored per wallet address and chain.
 */

import { createMMKV } from 'react-native-mmkv';
import { getExplorerUrl } from './transactionService';

// RPC Proxy base URL
const RPC_PROXY_BASE = 'https://rpc-proxy.quorummessenger.com';

// Supported chain IDs for Alchemy transaction history
const SUPPORTED_CHAIN_IDS = new Set([
  1, 10, 137, 324, 8453, 42161, 59144, 534352, 81457, 100, 42220, 7777777
]);

// Get Alchemy RPC URL for a chain (via proxy)
// Proxy expects: /api/alchemy/{chainId}/rpc
function getAlchemyRpcUrl(chainId: number): string | null {
  if (SUPPORTED_CHAIN_IDS.has(chainId)) {
    return `${RPC_PROXY_BASE}/api/alchemy/${chainId}/rpc`;
  }
  return null;
}

const storage = createMMKV({ id: 'quorum-wallet-history' });

export interface StoredTransaction {
  id: string; // hash-chainId
  hash: string;
  chainId: number;
  from: string;
  to: string;
  amount: string;
  symbol: string;
  decimals: number;
  isNative: boolean;
  tokenAddress?: string;
  type: 'send' | 'swap' | 'receive' | 'approve';
  status: 'pending' | 'success' | 'failed';
  timestamp: number;
  blockNumber?: number;
  explorerUrl: string;
  gasUsed?: string;
  gasPrice?: string;
  nonce?: number;
}

export interface RecordTransactionParams {
  hash: string;
  chainId: number;
  from: string;
  to: string;
  amount: string;
  symbol: string;
  decimals: number;
  isNative: boolean;
  tokenAddress?: string;
  type: 'send' | 'swap' | 'receive' | 'approve';
  nonce?: number;
}

function getStorageKey(walletAddress: string, chainId?: number): string {
  const normalizedAddress = walletAddress.toLowerCase();
  if (chainId !== undefined) {
    return `transactions:${normalizedAddress}:${chainId}`;
  }
  return `transactions:${normalizedAddress}`;
}

function getChainIdsWithTransactions(walletAddress: string): number[] {
  const allKeys = storage.getAllKeys();
  const prefix = `transactions:${walletAddress.toLowerCase()}:`;
  const chainIds: number[] = [];

  for (const key of allKeys) {
    if (key.startsWith(prefix)) {
      const chainId = parseInt(key.slice(prefix.length), 10);
      if (!isNaN(chainId)) {
        chainIds.push(chainId);
      }
    }
  }

  return chainIds;
}

export function recordTransaction(params: RecordTransactionParams): StoredTransaction {
  const { hash, chainId, from, to, amount, symbol, decimals, isNative, tokenAddress, type, nonce } = params;

  const transaction: StoredTransaction = {
    id: `${hash}-${chainId}`,
    hash,
    chainId,
    from: from.toLowerCase(),
    to: to.toLowerCase(),
    amount,
    symbol,
    decimals,
    isNative,
    tokenAddress,
    type,
    status: 'pending',
    timestamp: Date.now(),
    explorerUrl: getExplorerUrl(chainId, hash as `0x${string}`),
    nonce,
  };

  // Get existing transactions for this chain
  const key = getStorageKey(from, chainId);
  const existing = getTransactionsFromStorage(key);

  // Add new transaction at the beginning (most recent first)
  existing.unshift(transaction);

  // Limit to 100 transactions per chain
  const limited = existing.slice(0, 100);

  // Save back to storage
  storage.set(key, JSON.stringify(limited));

  return transaction;
}

export function updateTransactionStatus(
  walletAddress: string,
  hash: string,
  chainId: number,
  status: 'pending' | 'success' | 'failed',
  blockNumber?: number,
  gasUsed?: string
): void {
  const key = getStorageKey(walletAddress, chainId);
  const transactions = getTransactionsFromStorage(key);

  const index = transactions.findIndex(tx => tx.hash.toLowerCase() === hash.toLowerCase());
  if (index !== -1) {
    transactions[index].status = status;
    if (blockNumber !== undefined) {
      transactions[index].blockNumber = blockNumber;
    }
    if (gasUsed !== undefined) {
      transactions[index].gasUsed = gasUsed;
    }
    storage.set(key, JSON.stringify(transactions));
  }
}

function getTransactionsFromStorage(key: string): StoredTransaction[] {
  const data = storage.getString(key);
  if (!data) return [];

  try {
    return JSON.parse(data) as StoredTransaction[];
  } catch {
    return [];
  }
}

export function getTransactionHistory(
  walletAddress: string,
  options?: {
    chainId?: number;
    type?: 'send' | 'swap' | 'receive' | 'approve';
    status?: 'pending' | 'success' | 'failed';
    limit?: number;
    offset?: number;
  }
): StoredTransaction[] {
  const { chainId, type, status, limit = 50, offset = 0 } = options || {};

  let allTransactions: StoredTransaction[] = [];

  if (chainId !== undefined) {
    // Get transactions for specific chain
    const key = getStorageKey(walletAddress, chainId);
    allTransactions = getTransactionsFromStorage(key);
  } else {
    // Get transactions from all chains
    const chainIds = getChainIdsWithTransactions(walletAddress);
    for (const cid of chainIds) {
      const key = getStorageKey(walletAddress, cid);
      const chainTxs = getTransactionsFromStorage(key);
      allTransactions.push(...chainTxs);
    }
    // Sort by timestamp descending
    allTransactions.sort((a, b) => b.timestamp - a.timestamp);
  }

  // Apply filters
  if (type) {
    allTransactions = allTransactions.filter(tx => tx.type === type);
  }
  if (status) {
    allTransactions = allTransactions.filter(tx => tx.status === status);
  }

  // Apply pagination
  return allTransactions.slice(offset, offset + limit);
}

export function getPendingTransactions(walletAddress: string): StoredTransaction[] {
  return getTransactionHistory(walletAddress, { status: 'pending', limit: 100 });
}

export function getTransaction(walletAddress: string, hash: string, chainId: number): StoredTransaction | null {
  const key = getStorageKey(walletAddress, chainId);
  const transactions = getTransactionsFromStorage(key);
  return transactions.find(tx => tx.hash.toLowerCase() === hash.toLowerCase()) || null;
}

export function clearTransactionHistory(walletAddress: string, chainId?: number): void {
  if (chainId !== undefined) {
    const key = getStorageKey(walletAddress, chainId);
    storage.set(key, '[]'); // Set to empty array
  } else {
    const chainIds = getChainIdsWithTransactions(walletAddress);
    for (const cid of chainIds) {
      const key = getStorageKey(walletAddress, cid);
      storage.set(key, '[]'); // Set to empty array
    }
  }
}

export function getTransactionCount(walletAddress: string, chainId?: number): number {
  if (chainId !== undefined) {
    const key = getStorageKey(walletAddress, chainId);
    return getTransactionsFromStorage(key).length;
  }

  let total = 0;
  const chainIds = getChainIdsWithTransactions(walletAddress);
  for (const cid of chainIds) {
    const key = getStorageKey(walletAddress, cid);
    total += getTransactionsFromStorage(key).length;
  }
  return total;
}

interface AlchemyTransfer {
  blockNum: string;
  hash: string;
  from: string;
  to: string;
  value: number | null;
  asset: string | null;
  category: 'external' | 'internal' | 'erc20' | 'erc721' | 'erc1155' | 'specialnft';
  rawContract: {
    value: string | null;
    address: string | null;
    decimal: string | null;
  };
  metadata: {
    blockTimestamp: string;
  };
}

interface AlchemyAssetTransfersResponse {
  transfers: AlchemyTransfer[];
  pageKey?: string;
}

export async function fetchOnChainHistory(
  walletAddress: string,
  chainId: number,
  options?: {
    pageKey?: string;
    maxCount?: number;
  }
): Promise<{ transactions: StoredTransaction[]; pageKey?: string }> {
  const rpcUrl = getAlchemyRpcUrl(chainId);
  if (!rpcUrl) {
    return { transactions: [] };
  }

  const normalizedAddress = walletAddress.toLowerCase();
  const maxCount = options?.maxCount || 50;

  try {
    // Fetch both sent and received transfers in parallel
    const [sentResponse, receivedResponse] = await Promise.all([
      fetchAlchemyTransfers(rpcUrl, normalizedAddress, 'from', maxCount, options?.pageKey),
      fetchAlchemyTransfers(rpcUrl, normalizedAddress, 'to', maxCount, options?.pageKey),
    ]);

    // Combine and deduplicate by hash
    const allTransfers = [...sentResponse.transfers, ...receivedResponse.transfers];
    const uniqueTransfers = new Map<string, AlchemyTransfer>();
    for (const transfer of allTransfers) {
      // Use hash as key, keep the one with more info
      const existing = uniqueTransfers.get(transfer.hash);
      if (!existing || (transfer.value !== null && existing.value === null)) {
        uniqueTransfers.set(transfer.hash, transfer);
      }
    }

    // Convert to StoredTransaction format
    const transactions: StoredTransaction[] = [];
    for (const transfer of uniqueTransfers.values()) {
      const tx = convertAlchemyTransfer(transfer, chainId, normalizedAddress);
      if (tx) {
        transactions.push(tx);
      }
    }

    // Sort by timestamp descending
    transactions.sort((a, b) => b.timestamp - a.timestamp);

    // Return combined pageKey (use sent's pageKey as primary)
    return {
      transactions: transactions.slice(0, maxCount),
      pageKey: sentResponse.pageKey,
    };
  } catch (err) {
    return { transactions: [] };
  }
}

async function fetchAlchemyTransfers(
  rpcUrl: string,
  address: string,
  direction: 'from' | 'to',
  maxCount: number,
  pageKey?: string
): Promise<AlchemyAssetTransfersResponse> {
  const params: Record<string, any> = {
    [direction === 'from' ? 'fromAddress' : 'toAddress']: address,
    category: ['external', 'erc20'],
    withMetadata: true,
    maxCount: '0x' + Math.min(maxCount, 100).toString(16), // Alchemy expects hex
    order: 'desc',
  };

  if (pageKey) {
    params.pageKey = pageKey;
  }

  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'alchemy_getAssetTransfers',
      params: [params],
    }),
  });

  const data = await response.json();

  if (data.error) {
    throw new Error(data.error.message || 'Alchemy API error');
  }

  return data.result as AlchemyAssetTransfersResponse;
}

function convertAlchemyTransfer(
  transfer: AlchemyTransfer,
  chainId: number,
  walletAddress: string
): StoredTransaction | null {
  const isReceive = transfer.to.toLowerCase() === walletAddress;
  const isSend = transfer.from.toLowerCase() === walletAddress;

  if (!isSend && !isReceive) {
    return null;
  }

  // Determine type
  let type: 'send' | 'receive' | 'swap' | 'approve';
  if (transfer.category === 'erc20' && transfer.rawContract.value === '0x0') {
    // Zero value ERC20 transfer is likely an approval
    type = 'approve';
  } else if (isReceive && !isSend) {
    type = 'receive';
  } else if (isSend && !isReceive) {
    type = 'send';
  } else {
    // Self-transfer or complex tx
    type = 'send';
  }

  // Parse value
  let amount = '0';
  let decimals = 18;
  const isNative = transfer.category === 'external';

  if (transfer.value !== null) {
    amount = transfer.value.toString();
  } else if (transfer.rawContract.value) {
    // Parse raw hex value
    const rawValue = BigInt(transfer.rawContract.value);
    decimals = transfer.rawContract.decimal ? parseInt(transfer.rawContract.decimal, 16) : 18;
    const divisor = BigInt(10 ** decimals);
    const wholePart = rawValue / divisor;
    const fractionalPart = rawValue % divisor;
    const fractionalStr = fractionalPart.toString().padStart(decimals, '0').slice(0, 6);
    amount = `${wholePart}.${fractionalStr}`.replace(/\.?0+$/, '') || '0';
  }

  // Parse timestamp
  let timestamp = Date.now();
  if (transfer.metadata?.blockTimestamp) {
    timestamp = new Date(transfer.metadata.blockTimestamp).getTime();
  }

  // Get symbol
  let symbol = 'ETH';
  if (transfer.asset) {
    symbol = transfer.asset;
  } else if (isNative) {
    // Native token symbol by chain
    const nativeSymbols: Record<number, string> = {
      1: 'ETH',
      10: 'ETH',
      137: 'MATIC',
      324: 'ETH',
      8453: 'ETH',
      42161: 'ETH',
      59144: 'ETH',
      534352: 'ETH',
      81457: 'ETH',
      100: 'xDAI',
      42220: 'CELO',
      7777777: 'ETH',
    };
    symbol = nativeSymbols[chainId] || 'ETH';
  }

  return {
    id: `${transfer.hash}-${chainId}`,
    hash: transfer.hash,
    chainId,
    from: transfer.from.toLowerCase(),
    to: transfer.to.toLowerCase(),
    amount,
    symbol,
    decimals,
    isNative,
    tokenAddress: transfer.rawContract.address || undefined,
    type,
    status: 'success', // On-chain txs are always confirmed
    timestamp,
    blockNumber: transfer.blockNum ? parseInt(transfer.blockNum, 16) : undefined,
    explorerUrl: getExplorerUrl(chainId, transfer.hash as `0x${string}`),
  };
}

export function getSupportedChainIds(): number[] {
  return Array.from(SUPPORTED_CHAIN_IDS);
}

// Bitcoin Transaction History (via Blockstream API)

interface BlockstreamTx {
  txid: string;
  status: {
    confirmed: boolean;
    block_time?: number;
    block_height?: number;
  };
  vin: Array<{
    prevout?: {
      scriptpubkey_address?: string;
      value: number;
    };
  }>;
  vout: Array<{
    scriptpubkey_address?: string;
    value: number;
  }>;
}

export async function fetchBitcoinHistory(
  address: string,
  options?: { limit?: number }
): Promise<StoredTransaction[]> {
  const limit = options?.limit || 50;

  try {
    // Proxy expects: POST /api/bitcoin/history with {addresses, limit}
    const response = await fetch(`${RPC_PROXY_BASE}/api/bitcoin/history`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ addresses: [address], limit }),
    });
    if (!response.ok) {
      return [];
    }

    const txs: BlockstreamTx[] = await response.json();
    const transactions: StoredTransaction[] = [];

    for (const tx of txs.slice(0, limit)) {
      // Calculate if this is send or receive
      let totalIn = 0;
      let totalOut = 0;

      for (const vin of tx.vin) {
        if (vin.prevout?.scriptpubkey_address === address) {
          totalIn += vin.prevout.value;
        }
      }

      for (const vout of tx.vout) {
        if (vout.scriptpubkey_address === address) {
          totalOut += vout.value;
        }
      }

      const netAmount = totalOut - totalIn;
      const isSend = netAmount < 0;
      const amount = Math.abs(netAmount) / 100000000; // Convert satoshis to BTC

      // Find the counterparty address
      let counterparty = '';
      if (isSend) {
        // Find first output that's not ours (the recipient)
        for (const vout of tx.vout) {
          if (vout.scriptpubkey_address && vout.scriptpubkey_address !== address) {
            counterparty = vout.scriptpubkey_address;
            break;
          }
        }
      } else {
        // Find first input that's not ours (the sender)
        for (const vin of tx.vin) {
          if (vin.prevout?.scriptpubkey_address && vin.prevout.scriptpubkey_address !== address) {
            counterparty = vin.prevout.scriptpubkey_address;
            break;
          }
        }
      }

      transactions.push({
        id: `${tx.txid}--1`, // -1 for Bitcoin chain ID
        hash: tx.txid,
        chainId: -1, // Bitcoin placeholder
        from: isSend ? address : counterparty,
        to: isSend ? counterparty : address,
        amount: amount.toFixed(8),
        symbol: 'BTC',
        decimals: 8,
        isNative: true,
        type: isSend ? 'send' : 'receive',
        status: tx.status.confirmed ? 'success' : 'pending',
        timestamp: tx.status.block_time ? tx.status.block_time * 1000 : Date.now(),
        blockNumber: tx.status.block_height,
        explorerUrl: `https://blockstream.info/tx/${tx.txid}`,
      });
    }

    return transactions;
  } catch (err) {
    return [];
  }
}

// Solana Transaction History

// Proxy expects: POST /api/solana/rpc for JSON-RPC calls
const SOLANA_RPC = `${RPC_PROXY_BASE}/api/solana/rpc`;

interface SolanaSignature {
  signature: string;
  slot: number;
  blockTime: number | null;
  err: unknown;
}

export async function fetchSolanaHistory(
  address: string,
  options?: { limit?: number }
): Promise<StoredTransaction[]> {
  const limit = options?.limit || 50;

  try {
    // Get recent signatures
    const sigResponse = await fetch(SOLANA_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getSignaturesForAddress',
        params: [address, { limit }],
      }),
    });

    const sigData = await sigResponse.json();
    if (sigData.error || !sigData.result) {
      return [];
    }

    const signatures: SolanaSignature[] = sigData.result;
    const transactions: StoredTransaction[] = [];

    // Fetch details for each transaction (batch for efficiency)
    for (const sig of signatures.slice(0, limit)) {
      try {
        const txResponse = await fetch(SOLANA_RPC, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'getTransaction',
            params: [sig.signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }],
          }),
        });

        const txData = await txResponse.json();
        if (!txData.result) continue;

        const tx = txData.result;
        const meta = tx.meta;
        const message = tx.transaction?.message;

        if (!meta || !message) continue;

        // Calculate SOL balance change for this address
        const accountKeys = message.accountKeys?.map((k: { pubkey?: string } | string) => typeof k === 'string' ? k : k.pubkey || '') || [];
        const accountIndex = accountKeys.findIndex((k: string) => k === address);

        if (accountIndex === -1) continue;

        const preBalance = meta.preBalances?.[accountIndex] || 0;
        const postBalance = meta.postBalances?.[accountIndex] || 0;
        const balanceChange = (postBalance - preBalance) / 1e9; // Lamports to SOL

        if (balanceChange === 0) continue;

        const isSend = balanceChange < 0;

        // Find counterparty (simplified - first other account)
        let counterparty = accountKeys.find((k: string) => k !== address) || '';

        transactions.push({
          id: `${sig.signature}--2`, // -2 for Solana chain ID
          hash: sig.signature,
          chainId: -2, // Solana placeholder
          from: isSend ? address : counterparty,
          to: isSend ? counterparty : address,
          amount: Math.abs(balanceChange).toFixed(9),
          symbol: 'SOL',
          decimals: 9,
          isNative: true,
          type: isSend ? 'send' : 'receive',
          status: sig.err ? 'failed' : 'success',
          timestamp: sig.blockTime ? sig.blockTime * 1000 : Date.now(),
          explorerUrl: `https://solscan.io/tx/${sig.signature}`,
        });
      } catch (e) {
        // Skip failed transaction fetches
        continue;
      }
    }

    return transactions;
  } catch (err) {
    return [];
  }
}

// Kaspa Transaction History

interface KaspaTx {
  transaction_id: string;
  block_time: number;
  is_accepted: boolean;
  inputs: Array<{
    previous_outpoint_address?: string;
    previous_outpoint_amount?: number;
  }>;
  outputs: Array<{
    script_public_key_address?: string;
    amount?: number;
  }>;
}

export async function fetchKaspaHistory(
  address: string,
  options?: { limit?: number }
): Promise<StoredTransaction[]> {
  const limit = options?.limit || 50;

  try {
    // Proxy expects: POST /api/kaspa/history with {address, limit}
    const response = await fetch(`${RPC_PROXY_BASE}/api/kaspa/history`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address, limit }),
    });

    if (!response.ok) {
      return [];
    }

    const txs: KaspaTx[] = await response.json();
    const transactions: StoredTransaction[] = [];

    for (const tx of txs) {
      // Calculate net amount
      let totalIn = 0;
      let totalOut = 0;

      for (const input of tx.inputs || []) {
        if (input.previous_outpoint_address === address) {
          totalIn += input.previous_outpoint_amount || 0;
        }
      }

      for (const output of tx.outputs || []) {
        if (output.script_public_key_address === address) {
          totalOut += output.amount || 0;
        }
      }

      const netAmount = totalOut - totalIn;
      const isSend = netAmount < 0;
      const amount = Math.abs(netAmount) / 1e8; // Sompi to KAS

      // Find counterparty
      let counterparty = '';
      if (isSend) {
        for (const output of tx.outputs || []) {
          if (output.script_public_key_address && output.script_public_key_address !== address) {
            counterparty = output.script_public_key_address;
            break;
          }
        }
      } else {
        for (const input of tx.inputs || []) {
          if (input.previous_outpoint_address && input.previous_outpoint_address !== address) {
            counterparty = input.previous_outpoint_address;
            break;
          }
        }
      }

      transactions.push({
        id: `${tx.transaction_id}--3`, // -3 for Kaspa chain ID
        hash: tx.transaction_id,
        chainId: -3, // Kaspa placeholder
        from: isSend ? address : counterparty,
        to: isSend ? counterparty : address,
        amount: amount.toFixed(8),
        symbol: 'KAS',
        decimals: 8,
        isNative: true,
        type: isSend ? 'send' : 'receive',
        status: tx.is_accepted ? 'success' : 'pending',
        timestamp: tx.block_time,
        explorerUrl: `https://explorer.kaspa.org/txs/${tx.transaction_id}`,
      });
    }

    return transactions;
  } catch (err) {
    return [];
  }
}

// Bittensor Transaction History

// Not implemented: Taostats API requires authentication.
export async function fetchBittensorHistory(
  _address: string,
  _options?: { limit?: number }
): Promise<StoredTransaction[]> {
  // Bittensor transaction history requires Taostats API key
  // For now, return empty array - users can view history on taostats.io
  return [];
}

export async function fetchNonEvmHistory(
  addresses: {
    bitcoin?: string[];
    solana?: string;
    kaspa?: string;
    bittensor?: string;
  },
  options?: { limit?: number }
): Promise<StoredTransaction[]> {
  const promises: Promise<StoredTransaction[]>[] = [];

  // Bitcoin - fetch for all address types
  if (addresses.bitcoin) {
    for (const btcAddr of addresses.bitcoin) {
      if (btcAddr) {
        promises.push(fetchBitcoinHistory(btcAddr, options));
      }
    }
  }

  // Solana
  if (addresses.solana) {
    promises.push(fetchSolanaHistory(addresses.solana, options));
  }

  // Kaspa
  if (addresses.kaspa) {
    promises.push(fetchKaspaHistory(addresses.kaspa, options));
  }

  // Bittensor
  if (addresses.bittensor) {
    promises.push(fetchBittensorHistory(addresses.bittensor, options));
  }

  const results = await Promise.all(promises);
  const allTxs = results.flat();

  // Sort by timestamp descending
  allTxs.sort((a, b) => b.timestamp - a.timestamp);

  return allTxs;
}
