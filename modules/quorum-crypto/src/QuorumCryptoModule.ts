import { NativeModule, requireNativeModule } from 'expo-modules-core';

/**
 * Keypair result from key generation
 */
export interface KeyPair {
  public_key: number[];
  private_key: number[];
}

/**
 * Message ciphertext from encryption
 */
export interface MessageCiphertext {
  ciphertext: string;
  initialization_vector: string;
  associated_data?: string;
}

/**
 * QuorumCrypto native module interface
 *
 * Provides cryptographic operations using the channel Rust crate
 * via uniffi-generated Swift/Kotlin bindings.
 */
interface QuorumCryptoModule extends NativeModule {
  // Key Generation
  generateX448(): Promise<string>;
  generateEd448(): Promise<string>;
  getPublicKeyX448(privateKey: string): Promise<string>;
  getPublicKeyEd448(privateKey: string): Promise<string>;

  // Signing
  signEd448(privateKey: string, message: string): Promise<string>;
  verifyEd448(publicKey: string, message: string, signature: string): Promise<string>;

  // Inbox Message Encryption (Sealed Sender)
  encryptInboxMessage(input: string): Promise<string>;
  decryptInboxMessage(input: string): Promise<string>;

  // X3DH Key Agreement
  senderX3dh(input: string): Promise<string>;
  receiverX3dh(input: string): Promise<string>;

  // Double Ratchet
  newDoubleRatchet(input: string): Promise<string>;
  doubleRatchetEncrypt(input: string): Promise<string>;
  doubleRatchetDecrypt(input: string): Promise<string>;

  // Triple Ratchet
  newTripleRatchet(input: string): Promise<string>;
  tripleRatchetInitRound1(input: string): Promise<string>;
  tripleRatchetInitRound2(input: string): Promise<string>;
  tripleRatchetInitRound3(input: string): Promise<string>;
  tripleRatchetInitRound4(input: string): Promise<string>;
  tripleRatchetEncrypt(input: string): Promise<string>;
  tripleRatchetDecrypt(input: string): Promise<string>;

  /**
   * Resize the triple ratchet to generate invite evals
   * Input: JSON string with { ratchet_state: string, other: string (hex), id: number, total: number }
   * Output: JSON string of number[][] (array of eval byte arrays)
   */
  tripleRatchetResize(input: string): Promise<string>;
}

// This call loads the native module object from the JSI
export default requireNativeModule<QuorumCryptoModule>('QuorumCrypto');
