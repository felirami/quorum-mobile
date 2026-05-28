/**
 * SFU Client — communicates with the quorum-api SFU endpoints for space/group calls.
 *
 * The SFU manages rooms (one per active space call). Each participant sends
 * an SDP offer and receives an answer. Media flows through TURN relays to the SFU,
 * which forwards it to all other participants without decrypting.
 */

import { getApiConfig } from '../api/config';
import { logger } from '@quilibrium/quorum-shared';
export interface SFUJoinParams {
  roomId: string;
  spaceId: string;
  channelId: string;
  sdpOffer: string;
  address: string;
  signMessage: (msg: string) => Promise<string>;
}

export interface SFUJoinResult {
  sdpAnswer: string;
  participants: string[];
}

export interface SFULeaveParams {
  roomId: string;
  address: string;
  signMessage: (msg: string) => Promise<string>;
}

export interface SFURoomInfo {
  roomId: string;
  spaceId: string;
  channelId: string;
  participants: string[];
  active: boolean;
  createdAt: number;
}

export class SFUClient {
  private getBaseUrl(): string {
    return getApiConfig().baseUrl;
  }

  /**
   * Join a space call room. Sends an SDP offer and receives the SFU's answer.
   * The server authenticates via Ed448 signature on the join payload.
   */
  async joinRoom(params: SFUJoinParams): Promise<SFUJoinResult> {
    const timestamp = Date.now().toString();
    const signPayload = `sfu:join:${params.roomId}:${params.address}:${timestamp}`;
    const signature = await params.signMessage(signPayload);

    const url = `${this.getBaseUrl()}/sfu/join`;
    logger.debug(`[SFUClient] POST ${url} (room=${params.roomId})`);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        room_id: params.roomId,
        space_id: params.spaceId,
        channel_id: params.channelId,
        address: params.address,
        sdp_offer: params.sdpOffer,
        signature,
        timestamp,
      }),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      logger.debug(`[SFUClient] join failed: ${response.status} ${errBody}`);
      throw new Error(`SFU join failed: ${response.status}`);
    }

    const data = await response.json();
    return {
      sdpAnswer: data.sdp_answer,
      participants: data.participants ?? [],
    };
  }

  /**
   * Leave a space call room. Best-effort — the SFU also detects disconnects.
   */
  async leaveRoom(params: SFULeaveParams): Promise<void> {
    const timestamp = Date.now().toString();
    const signPayload = `sfu:leave:${params.roomId}:${params.address}:${timestamp}`;
    const signature = await params.signMessage(signPayload);

    const url = `${this.getBaseUrl()}/sfu/leave`;
    logger.debug(`[SFUClient] POST ${url} (room=${params.roomId})`);

    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room_id: params.roomId,
          address: params.address,
          signature,
          timestamp,
        }),
      });
    } catch {
      // Best-effort — the SFU will detect the disconnect via PeerConnection state
      logger.debug('[SFUClient] leave request failed (best-effort)');
    }
  }

  /**
   * Get room info (participant list, active state).
   * Returns null if the room doesn't exist or is inactive.
   */
  async getRoomInfo(roomId: string): Promise<SFURoomInfo | null> {
    const url = `${this.getBaseUrl()}/sfu/room/${roomId}`;

    try {
      const response = await fetch(url);
      if (!response.ok) return null;

      const data = await response.json();
      if (!data.active) return null;

      return {
        roomId: data.room_id,
        spaceId: data.space_id ?? '',
        channelId: data.channel_id ?? '',
        participants: data.participants ?? [],
        active: data.active,
        createdAt: data.created_at ?? 0,
      };
    } catch {
      return null;
    }
  }
}
