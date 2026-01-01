/**
 * QuorumCrypto - Native crypto module for Quorum mobile
 *
 * Provides E2E encryption using the channel Rust crate via uniffi bindings.
 */

import QuorumCryptoModule from './QuorumCryptoModule';

export type { KeyPair, MessageCiphertext } from './QuorumCryptoModule';

// Re-export the native module
export default QuorumCryptoModule;

// Convenience functions with parsed results

export async function generateX448() {
  const result = await QuorumCryptoModule.generateX448();
  return JSON.parse(result) as { public_key: number[]; private_key: number[] };
}

export async function generateEd448() {
  const result = await QuorumCryptoModule.generateEd448();
  return JSON.parse(result) as { public_key: number[]; private_key: number[] };
}

export async function getPublicKeyX448(privateKey: string): Promise<string> {
  const result = await QuorumCryptoModule.getPublicKeyX448(privateKey);
  // Result is quoted, parse to remove quotes
  return JSON.parse(result) as string;
}

export async function getPublicKeyEd448(privateKey: string): Promise<string> {
  const result = await QuorumCryptoModule.getPublicKeyEd448(privateKey);
  return JSON.parse(result) as string;
}

export async function signEd448(privateKey: string, message: string): Promise<string> {
  const result = await QuorumCryptoModule.signEd448(privateKey, message);
  return JSON.parse(result) as string;
}

export async function verifyEd448(
  publicKey: string,
  message: string,
  signature: string
): Promise<boolean> {
  const result = await QuorumCryptoModule.verifyEd448(publicKey, message, signature);
  return result === 'true';
}
