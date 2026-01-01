/**
 * Mobile QuorumApiClient Implementation
 *
 * Implements the @quilibrium/quorum-shared QuorumApiClient interface using fetch
 */

import type {
  QuorumApiClient,
  SendMessageParams,
  SendDirectMessageParams,
  AddReactionParams,
  RemoveReactionParams,
  EditMessageParams,
  DeleteMessageParams,
  Space,
  Message,
  Conversation,
} from '@quilibrium/quorum-shared';

const DEFAULT_TIMEOUT = 30000; // 30 seconds
const DEFAULT_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
};

/**
 * Inbox registration info
 */
export interface InboxRegistration {
  /** Inbox address for receiving encrypted messages */
  inbox_address: string;
  /** X448 inbox encryption public key (hex string) */
  inbox_encryption_public_key: string;
  /** Ed448 inbox signing public key for delete requests (hex string) */
  inbox_public_key: string;
}

/**
 * Device registration info for E2E encryption
 * Contains keys for a specific device
 */
export interface DeviceRegistration {
  /** X448 identity public key (hex string) */
  identity_public_key: string;
  /** X448 pre-key for X3DH (hex string) */
  pre_public_key: string;
  /** Inbox registration info */
  inbox_registration: InboxRegistration;
}

/**
 * User registration info for E2E encryption
 * Used for X3DH key exchange when initiating encrypted conversations
 */
export interface UserRegistration {
  /** User's address */
  user_address: string;
  /** User's public key (Ed448 for signing) */
  user_public_key: string;
  /** User's peer public key */
  peer_public_key: string;
  /** Device registrations (usually just one) */
  device_registrations: DeviceRegistration[];
  /** Ed448 signature over the registration data (hex string) */
  signature: string;
}

// API Configuration
const API_CONFIG = {
  baseUrl: 'https://api.quorummessenger.com',
  wsUrl: 'wss://api.quorummessenger.com/ws',
};

interface FetchOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  timeout?: number;
  headers?: Record<string, string>;
}

export class QuorumMobileClient implements QuorumApiClient {
  private baseUrl: string;
  private userAddress: string | null = null;
  private signMessage: ((message: string) => Promise<string>) | null = null;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl ?? API_CONFIG.baseUrl;
  }

  setUserAddress(address: string): void {
    this.userAddress = address;
  }

  setSignMessage(signFn: (message: string) => Promise<string>): void {
    this.signMessage = signFn;
  }

  private async fetch<T>(endpoint: string, options: FetchOptions = {}): Promise<T> {
    const { method = 'GET', body, timeout = DEFAULT_TIMEOUT, headers = {} } = options;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        method,
        headers: {
          ...DEFAULT_HEADERS,
          ...headers,
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = await response.text();
        // Don't log 404 as error - it's expected for missing resources
        if (response.status !== 404) {
          console.error('[QuorumClient] HTTP error:', response.status, errorBody);
        }
        let errorData;
        try {
          errorData = JSON.parse(errorBody);
        } catch {
          errorData = { message: errorBody };
        }
        throw Object.assign(new Error(errorData.message || `HTTP ${response.status}`), {
          status: response.status,
          code: errorData.code,
        });
      }

      const contentType = response.headers.get('content-type');
      if (contentType?.includes('application/json')) {
        return response.json();
      }
      return response.text() as unknown as T;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw Object.assign(new Error('Request timeout'), {
          status: 408,
          code: 'TIMEOUT',
        });
      }
      throw error;
    }
  }

  // ============ Spaces ============

  async fetchSpaces(): Promise<Space[]> {
    if (!this.userAddress) {
      throw new Error('User address not set');
    }
    const response = await this.fetch<{ spaces: Space[] }>(
      `/users/${this.userAddress}/spaces`
    );
    return response.spaces || [];
  }

  async fetchSpace(spaceId: string): Promise<Space> {
    return this.fetch<Space>(`/spaces/${spaceId}`);
  }

  async joinSpace(inviteCode: string): Promise<Space> {
    return this.fetch<Space>('/spaces/join', {
      method: 'POST',
      body: { inviteCode },
    });
  }

  // ============ Messages ============

  async fetchMessages(params: {
    spaceId: string;
    channelId: string;
    cursor?: string;
    limit?: number;
  }): Promise<{ messages: Message[]; nextPageToken?: string }> {
    const queryParams = new URLSearchParams();
    if (params.cursor) queryParams.set('cursor', params.cursor);
    if (params.limit) queryParams.set('limit', params.limit.toString());

    const query = queryParams.toString();
    const endpoint = `/spaces/${params.spaceId}/channels/${params.channelId}/messages${query ? `?${query}` : ''}`;

    return this.fetch<{ messages: Message[]; nextPageToken?: string }>(endpoint);
  }

  async sendMessage(params: SendMessageParams): Promise<Message> {
    return this.fetch<Message>(
      `/spaces/${params.spaceId}/channels/${params.channelId}/messages`,
      {
        method: 'POST',
        body: {
          text: params.text,
          repliesToMessageId: params.repliesToMessageId,
        },
      }
    );
  }

  async editMessage(params: EditMessageParams): Promise<Message> {
    return this.fetch<Message>(
      `/spaces/${params.spaceId}/channels/${params.channelId}/messages/${params.messageId}`,
      {
        method: 'PATCH',
        body: { text: params.text },
      }
    );
  }

  async deleteMessage(params: DeleteMessageParams): Promise<void> {
    await this.fetch<void>(
      `/spaces/${params.spaceId}/channels/${params.channelId}/messages/${params.messageId}`,
      { method: 'DELETE' }
    );
  }

  // ============ Reactions ============

  async addReaction(params: AddReactionParams): Promise<void> {
    await this.fetch<void>(
      `/spaces/${params.spaceId}/channels/${params.channelId}/messages/${params.messageId}/reactions`,
      {
        method: 'POST',
        body: { reaction: params.reaction },
      }
    );
  }

  async removeReaction(params: RemoveReactionParams): Promise<void> {
    await this.fetch<void>(
      `/spaces/${params.spaceId}/channels/${params.channelId}/messages/${params.messageId}/reactions/${encodeURIComponent(params.reaction)}`,
      { method: 'DELETE' }
    );
  }

  // ============ Conversations ============

  async fetchConversations(): Promise<Conversation[]> {
    if (!this.userAddress) {
      throw new Error('User address not set');
    }
    const response = await this.fetch<{ conversations: Conversation[] }>(
      `/users/${this.userAddress}/conversations`
    );
    return response.conversations || [];
  }

  async createConversation(params: { address: string }): Promise<Conversation> {
    return this.fetch<Conversation>('/conversations', {
      method: 'POST',
      body: { address: params.address },
    });
  }

  async sendDirectMessage(params: SendDirectMessageParams): Promise<Message> {
    return this.fetch<Message>(
      `/conversations/${params.conversationId}/messages`,
      {
        method: 'POST',
        body: {
          text: params.text,
          repliesToMessageId: params.repliesToMessageId,
        },
      }
    );
  }

  async fetchDirectMessages(params: {
    conversationId: string;
    cursor?: string;
    limit?: number;
  }): Promise<{ messages: Message[]; nextPageToken?: string }> {
    const queryParams = new URLSearchParams();
    if (params.cursor) queryParams.set('cursor', params.cursor);
    if (params.limit) queryParams.set('limit', params.limit.toString());

    const query = queryParams.toString();
    const endpoint = `/conversations/${params.conversationId}/messages${query ? `?${query}` : ''}`;

    return this.fetch<{ messages: Message[]; nextPageToken?: string }>(endpoint);
  }

  // ============ User Registration (for E2E Encryption) ============

  /**
   * Fetch a user's registration info for E2E encryption
   * Contains identity key, signed pre-key, and inbox address needed for X3DH
   */
  async fetchUserRegistration(address: string): Promise<UserRegistration> {
    return this.fetch<UserRegistration>(`/users/${address}`);
  }

  /**
   * Register user's encryption keys for E2E messaging
   * Called after onboarding to publish keys so others can initiate encrypted conversations
   *
   * @param registration - Full UserRegistration structure matching server expectations
   */
  async uploadRegistration(registration: UserRegistration): Promise<void> {
    await this.fetch<void>(`/users/${registration.user_address}`, {
      method: 'POST',
      body: registration,
    });
  }

  /**
   * Delete messages from inbox after successful decryption
   * Uses Ed448 signature to authenticate the delete request
   *
   * @param params.inbox_address - The inbox address to delete messages from
   * @param params.timestamps - Array of message timestamps to delete
   * @param params.inbox_public_key - Ed448 public key for verification (hex)
   * @param params.inbox_signature - Ed448 signature of (inbox_address + timestamps) (hex)
   */
  async deleteInboxMessages(params: {
    inbox_address: string;
    timestamps: number[];
    inbox_public_key: string;
    inbox_signature: string;
  }): Promise<void> {
    await this.fetch<void>('/inbox/delete', {
      method: 'POST',
      body: params,
    });
  }

  // ============ Pinning ============

  async pinMessage(params: {
    spaceId: string;
    channelId: string;
    messageId: string;
  }): Promise<void> {
    await this.fetch<void>(
      `/spaces/${params.spaceId}/channels/${params.channelId}/messages/${params.messageId}/pin`,
      { method: 'POST' }
    );
  }

  async unpinMessage(params: {
    spaceId: string;
    channelId: string;
    messageId: string;
  }): Promise<void> {
    await this.fetch<void>(
      `/spaces/${params.spaceId}/channels/${params.channelId}/messages/${params.messageId}/pin`,
      { method: 'DELETE' }
    );
  }

  // ============ User Config (E2E Encrypted Settings Sync) ============

  /**
   * Remote user config response from server
   * Contains encrypted config, timestamp, and signature for verification
   */
  /**
   * Fetch user's encrypted config from server
   * Returns encrypted user config, timestamp, and Ed448 signature for verification
   *
   * Config is encrypted with AES-GCM using SHA-512(user_private_key)[0:32] as key
   * Signature is Ed448 over (encrypted_config + timestamp_bytes)
   *
   * @param address - User's address
   * @returns Remote config or null if not found (404)
   */
  async getUserSettings(address: string): Promise<{
    user_config: string;
    timestamp: number;
    signature: string;
  } | null> {
    try {
      return await this.fetch<{
        user_config: string;
        timestamp: number;
        signature: string;
      }>(`/users/${address}/config`);
    } catch (error: unknown) {
      // 404 is expected for new users who haven't synced config yet
      if (error && typeof error === 'object' && 'status' in error && error.status === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Upload user's encrypted config to server
   * Config must be encrypted with AES-GCM and signed with Ed448
   *
   * @param address - User's address
   * @param payload - Encrypted config with signature
   * @param payload.user_address - User's address
   * @param payload.user_public_key - Ed448 public key (hex)
   * @param payload.user_config - Encrypted config (hex ciphertext + IV)
   * @param payload.timestamp - Unix timestamp
   * @param payload.signature - Ed448 signature (hex)
   */
  async postUserSettings(
    address: string,
    payload: {
      user_address: string;
      user_public_key: string;
      user_config: string;
      timestamp: number;
      signature: string;
    }
  ): Promise<{ status: string }> {
    return this.fetch<{ status: string }>(`/users/${address}/config`, {
      method: 'POST',
      body: payload,
    });
  }

  // ============ Space Registration ============

  /**
   * Register a new space
   * Creates the space registration on the server
   *
   * @param spaceAddress - Space address
   * @param registration - Space registration data with signatures
   */
  async postSpace(
    spaceAddress: string,
    registration: {
      space_address: string;
      space_public_key: string;
      space_signature: string;
      config_public_key: string;
      owner_public_keys: string[];
      owner_signatures: string[];
      timestamp: number;
    }
  ): Promise<{ status: string }> {
    return this.fetch<{ status: string }>(`/spaces/${spaceAddress}`, {
      method: 'POST',
      body: registration,
    });
  }

  // ============ Space Manifest ============

  /**
   * Fetch space registration (public info about a space)
   * Used to verify owner signatures on space-manifest updates
   *
   * @param spaceAddress - Space address
   * @returns Space registration with owner public keys
   */
  async getSpaceRegistration(spaceAddress: string): Promise<{
    space_address: string;
    space_public_key: string;
    space_signature: string;
    config_public_key: string;
    owner_public_keys: string[];
    owner_signatures: string[];
    timestamp: number;
  }> {
    return this.fetch<{
      space_address: string;
      space_public_key: string;
      space_signature: string;
      config_public_key: string;
      owner_public_keys: string[];
      owner_signatures: string[];
      timestamp: number;
    }>(`/spaces/${spaceAddress}`);
  }

  /**
   * Fetch space manifest (encrypted space metadata)
   * Used to decrypt space info when syncing from config
   *
   * @param spaceAddress - Space address
   * @returns Encrypted manifest with ephemeral key
   */
  async getSpaceManifest(spaceAddress: string): Promise<{
    space_address: string;
    space_manifest: string;
    ephemeral_public_key: string;
  }> {
    return this.fetch<{
      space_address: string;
      space_manifest: string;
      ephemeral_public_key: string;
    }>(`/spaces/${spaceAddress}/manifest`);
  }

  /**
   * Upload space manifest
   *
   * @param spaceAddress - Space address
   * @param manifest - Encrypted manifest data with owner signature
   */
  async postSpaceManifest(
    spaceAddress: string,
    manifest: {
      space_address: string;
      space_manifest: string;
      ephemeral_public_key: string;
      timestamp?: number;
      owner_public_key?: string;
      owner_signature?: string;
    }
  ): Promise<{ status: string }> {
    return this.fetch<{ status: string }>(`/spaces/${spaceAddress}/manifest`, {
      method: 'POST',
      body: manifest,
    });
  }

  // ============ Hub Operations ============

  /**
   * Add inbox to hub for receiving space messages
   * Called when joining a space to subscribe to hub updates
   *
   * @param params - Hub control message with signatures
   */
  async postHubAdd(params: {
    hub_address: string;
    hub_public_key: string;
    hub_signature: string;
    inbox_public_key: string;
    inbox_signature: string;
  }): Promise<{ status: string }> {
    return this.fetch<{ status: string }>('/hub/add', {
      method: 'POST',
      body: params,
    });
  }

  /**
   * Remove inbox from hub
   *
   * @param params - Hub control message with signatures
   */
  async postHubDelete(params: {
    hub_address: string;
    hub_public_key: string;
    hub_signature: string;
    inbox_public_key: string;
    inbox_signature: string;
  }): Promise<{ status: string }> {
    return this.fetch<{ status: string }>('/hub/delete', {
      method: 'POST',
      body: params,
    });
  }

  /**
   * Send a sealed message to the hub
   * Used for sending encrypted space messages
   *
   * @param message - Sealed hub message
   */
  async postHub(message: {
    hub_address: string;
    sealed_message: string;
  }): Promise<{ status: string }> {
    return this.fetch<{ status: string }>('/hub', {
      method: 'POST',
      body: message,
    });
  }
}

// Singleton instance
let quorumClient: QuorumMobileClient | null = null;

export function getQuorumClient(): QuorumMobileClient {
  if (!quorumClient) {
    quorumClient = new QuorumMobileClient();
  }
  return quorumClient;
}
