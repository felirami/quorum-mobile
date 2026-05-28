import { getApiConfig } from '../api/config';
import { getBlindToken, prefetchBlindToken, type BlindToken } from './blind-token';
import { logger } from '@quilibrium/quorum-shared';
export interface TurnCredentials {
  username: string;
  password: string;
  turnUrls: string[];
  ttl: number;
  nodeId: string;
}

export interface CircuitAllocation {
  circuitId: string;
  relayA: TurnCredentials;
  relayB: TurnCredentials;
  expiresAt: number;
}

export class RelayClient {
  private getBaseUrl(): string {
    return getApiConfig().baseUrl;
  }

  /**
   * Allocate a 2-hop relay circuit.
   *
   * Prefers blind token auth (metadata-resistant: server cannot identify who
   * is making the call). Falls back to Ed448 signature auth if blind token
   * issuance fails.
   */
  async allocateCircuit(params: {
    callerAddress: string;
    signMessage: (msg: string) => Promise<string>;
    regionHint?: string;
  }): Promise<CircuitAllocation> {
    // Try to get a blind token first (anonymous auth path)
    let blindToken: BlindToken | null = null;
    try {
      blindToken = await getBlindToken(params.callerAddress, params.signMessage);
    } catch (err) {
      logger.debug('[RelayClient] Blind token acquisition failed, using Ed448 fallback:', err);
    }

    let body: Record<string, string | undefined>;

    if (blindToken) {
      // Anonymous auth path: blind token + signature, no caller identity
      logger.debug('[RelayClient] Using blind token for anonymous circuit allocation');
      body = {
        blind_token: blindToken.token,
        blind_signature: blindToken.signature,
        region_hint: params.regionHint,
      };
    } else {
      // Fallback: Ed448 signature auth (identifies the caller)
      logger.debug('[RelayClient] Using Ed448 signature for circuit allocation');
      const timestamp = Date.now().toString();
      const signPayload = `relay:circuit:${params.callerAddress}:${timestamp}`;
      const signature = await params.signMessage(signPayload);

      body = {
        caller_address: params.callerAddress,
        signature,
        timestamp,
        region_hint: params.regionHint,
      };
    }

    const url = `${this.getBaseUrl()}/relay/circuit`;
    logger.debug(`[RelayClient] POST ${url}`);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      logger.debug(`[RelayClient] failed: ${response.status} ${errBody}`);
      throw new Error(`Circuit allocation failed: ${response.status}`);
    }

    const data = await response.json();
    return {
      circuitId: data.circuit_id,
      relayA: {
        username: data.relay_a.username,
        password: data.relay_a.password,
        turnUrls: data.relay_a.turn_urls,
        ttl: data.relay_a.ttl,
        nodeId: data.relay_a.node_id,
      },
      relayB: {
        username: data.relay_b.username,
        password: data.relay_b.password,
        turnUrls: data.relay_b.turn_urls,
        ttl: data.relay_b.ttl,
        nodeId: data.relay_b.node_id,
      },
      expiresAt: data.expires_at,
    };
  }

  /**
   * Pre-fetch a blind token so it's ready for the next circuit allocation.
   * Call this after login or after a call ends.
   */
  prefetchToken(
    callerAddress: string,
    signMessage: (msg: string) => Promise<string>,
  ): void {
    prefetchBlindToken(callerAddress, signMessage);
  }

  async releaseCircuit(circuitId: string): Promise<void> {
    try {
      await fetch(`${this.getBaseUrl()}/relay/circuit/${circuitId}`, {
        method: 'DELETE',
      });
    } catch {
      // Best-effort cleanup — circuit expires on its own
    }
  }
}
