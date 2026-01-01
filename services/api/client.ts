/**
 * Unified API client with retry logic and error handling.
 */

interface FetchOptions extends RequestInit {
  retries?: number;
  retryDelay?: number;
}

class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public response?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Fetch wrapper with automatic retries and error handling.
 */
export async function apiFetch<T>(
  url: string,
  options: FetchOptions = {}
): Promise<T> {
  const { retries = 3, retryDelay = 1000, ...fetchOptions } = options;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        ...fetchOptions,
        headers: {
          'Content-Type': 'application/json',
          accept: '*/*',
          origin: 'https://farcaster.xyz',
          referer: 'https://farcaster.xyz/',
          ...fetchOptions.headers,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new ApiError(
          `HTTP ${response.status}: ${errorText}`,
          response.status,
          errorText
        );
      }

      return await response.json();
    } catch (error) {
      lastError = error as Error;

      // Don't retry on 4xx errors (client errors)
      if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
        throw error;
      }

      // Wait before retrying
      if (attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, retryDelay * (attempt + 1)));
      }
    }
  }

  throw lastError;
}

/**
 * Farcaster API base URL
 */
export const FARCASTER_API_BASE = 'https://farcaster.xyz/~api/v2';

/**
 * Create authenticated headers for Farcaster API
 */
export function createFarcasterHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = {
    accept: '*/*',
    origin: 'https://farcaster.xyz',
    referer: 'https://farcaster.xyz/',
  };

  if (token) {
    headers['fc-token'] = token;
    headers['fc-csrftoken'] = token;
  }

  return headers;
}

export { ApiError };
export default apiFetch;
