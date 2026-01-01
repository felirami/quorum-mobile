/**
 * NativeSigningProvider - Implements SigningProvider using React Native native modules
 *
 * Uses the QuorumCrypto Expo module which wraps uniffi-generated bindings
 * to the Rust channel crate.
 */

// Import types from the shared library
import type { SigningProvider } from '@quilibrium/quorum-shared';
import QuorumCrypto from '../../modules/quorum-crypto/src';

/**
 * Parse native verification result
 */
function parseVerifyResult(result: string): boolean {
  const normalized = result.toLowerCase().trim();
  if (normalized === 'true' || normalized === 'valid') {
    return true;
  }
  if (normalized === 'false' || normalized === 'invalid') {
    return false;
  }
  // Check for error patterns
  if (
    result.startsWith('invalid') ||
    result.startsWith('error') ||
    result.includes('failed') ||
    result.includes('Error')
  ) {
    throw new Error(result);
  }
  // Try to parse as JSON boolean
  try {
    return JSON.parse(result) as boolean;
  } catch {
    throw new Error(`Unexpected verification result: ${result}`);
  }
}

/**
 * NativeSigningProvider - Implements SigningProvider using QuorumCrypto native module
 */
export class NativeSigningProvider implements SigningProvider {
  async signEd448(privateKey: string, message: string): Promise<string> {
    const result = await QuorumCrypto.signEd448(privateKey, message);

    // Check for error patterns
    if (
      result.startsWith('invalid') ||
      result.startsWith('error') ||
      result.includes('failed') ||
      result.includes('Error')
    ) {
      throw new Error(result);
    }

    // Remove quotes if present (native returns quoted string)
    if (result.startsWith('"') && result.endsWith('"')) {
      return result.slice(1, -1);
    }

    return result;
  }

  async verifyEd448(publicKey: string, message: string, signature: string): Promise<boolean> {
    const result = await QuorumCrypto.verifyEd448(publicKey, message, signature);
    return parseVerifyResult(result);
  }
}
