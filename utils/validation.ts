/**
 * Validation utility functions
 *
 * Consolidates URI validation helpers that were duplicated across
 * multiple screen and component files.
 */

/**
 * Check whether a URI is valid for use as an avatar image source.
 * Accepts data URIs, http, and https URLs.
 */
export function isValidAvatarUri(uri: string | undefined): boolean {
  if (!uri) return false;
  return uri.startsWith('data:') || uri.startsWith('http://') || uri.startsWith('https://');
}
