/**
 * Encoding utility functions for base64/hex/number-array conversion
 *
 * Consolidates the base64ToHex, hexToBase64, and numberArrayToBase64 helpers
 * that were previously duplicated across 8+ service/context files.
 */

/**
 * Convert a base64 string to a hex string
 */
export function base64ToHex(base64: string): string {
  const binary = atob(base64);
  let hex = '';
  for (let i = 0; i < binary.length; i++) {
    hex += binary.charCodeAt(i).toString(16).padStart(2, '0');
  }
  return hex;
}

/**
 * Convert a hex string to a base64 string
 */
export function hexToBase64(hex: string): string {
  const bytes = new Uint8Array(hex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Convert a number array to a base64 string
 */
export function numberArrayToBase64(arr: number[]): string {
  const uint8 = new Uint8Array(arr);
  let binary = '';
  for (let i = 0; i < uint8.length; i++) {
    binary += String.fromCharCode(uint8[i]);
  }
  return btoa(binary);
}

// Alias used by space-session.ts and native-provider.ts under this name.
export const arrayToBase64 = numberArrayToBase64;

/**
 * Convert a base64 string to a number array.
 */
export function base64ToArray(base64: string): number[] {
  const binary = atob(base64);
  const arr: number[] = [];
  for (let i = 0; i < binary.length; i++) {
    arr.push(binary.charCodeAt(i));
  }
  return arr;
}
