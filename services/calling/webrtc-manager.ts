import {
  RTCPeerConnection,
  RTCSessionDescription,
  RTCIceCandidate,
  mediaDevices,
  MediaStream,
} from 'react-native-webrtc';
import { Platform } from 'react-native';
import QuorumCrypto from '../../modules/quorum-crypto/src';
import type { TurnCredentials } from './relay-client';
import { logger } from '@quilibrium/quorum-shared';
/**
 * Enforce constant bitrate on Opus codec in an SDP string.
 * Opus CBR sends the same number of bytes regardless of voice activity,
 * preventing relay nodes from inferring speech patterns via traffic volume.
 */
function enforceConstantBitrate(sdp: string): string {
  // Opus is typically payload type 111 in WebRTC SDPs.
  // Find the a=fmtp:111 line and append cbr=1 if not already present.
  const lines = sdp.split('\r\n');
  const result: string[] = [];

  for (const line of lines) {
    // Match a=fmtp line for Opus (commonly 111, but detect dynamically)
    if (line.startsWith('a=fmtp:111 ')) {
      if (!line.includes('cbr=1')) {
        result.push(line + ';cbr=1');
      } else {
        result.push(line);
      }
    } else {
      result.push(line);
    }
  }

  return result.join('\r\n');
}

export interface CallQuality {
  rtt: number;          // milliseconds
  packetLoss: number;   // 0-1 ratio
  jitter: number;       // milliseconds
  bitrate: number;      // kbps
  level: 'good' | 'fair' | 'poor';
}

function deriveQualityLevel(rtt: number, packetLoss: number): CallQuality['level'] {
  if (rtt > 400 || packetLoss > 0.1) return 'poor';
  if (rtt < 150 && packetLoss < 0.02) return 'good';
  return 'fair';
}

export interface WebRTCConfig {
  turnCredentials: TurnCredentials;
}

export class WebRTCManager {
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private iceTimeout: ReturnType<typeof setTimeout> | null = null;
  private gotCandidate = false;
  private hasRemoteDescription = false;
  private pendingRemoteCandidates: RTCIceCandidate[] = [];
  private _peerConnectionId: number | null = null;

  private qualityInterval: ReturnType<typeof setInterval> | null = null;
  private prevBytesSent = 0;
  private prevBytesReceived = 0;
  private prevStatsTimestamp = 0;

  onRemoteStream: ((stream: MediaStream) => void) | null = null;
  onIceCandidate: ((candidate: RTCIceCandidate) => void) | null = null;
  onConnectionStateChange: ((state: string) => void) | null = null;
  onIceConnectionStateChange: ((state: string) => void) | null = null;
  onCallQualityChange: ((quality: CallQuality) => void) | null = null;

  async createConnection(config: WebRTCConfig): Promise<RTCPeerConnection> {
    if (this.peerConnection) {
      await this.cleanup();
    }

    // Pre-warm the audio session on iOS. This configures AVAudioSession
    // for PlayAndRecord + VoiceChat mode BEFORE WebRTC creates its
    // VoiceProcessingIO audio unit. Without this, the VoiceProcessingIO
    // RPC to mediaserverd can timeout and abort() the process.
    if (Platform.OS === 'ios') {
      try {
        await QuorumCrypto.prepareAudioSession();
        // Give mediaserverd time to fully activate
        await new Promise(resolve => setTimeout(resolve, 200));
        logger.debug('[WebRTC] audio session pre-warmed');
      } catch (e) {
        logger.debug('[WebRTC] audio session pre-warm failed:', e);
      }
    }

    const pc = new RTCPeerConnection({
      iceServers: [{
        urls: config.turnCredentials.turnUrls,
        username: config.turnCredentials.username,
        credential: config.turnCredentials.password,
      }],
      iceTransportPolicy: 'relay',
    });

    // Store the native PeerConnection ID for frame encryption.
    // react-native-webrtc exposes this as _pcId on the JS object.
    this._peerConnectionId = (pc as any)._pcId ?? null;

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.gotCandidate = true;
        this.onIceCandidate?.(event.candidate);
      }
    };

    pc.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        this.remoteStream = event.streams[0];
        this.onRemoteStream?.(event.streams[0]);
      }
    };

    pc.onconnectionstatechange = () => {
      this.onConnectionStateChange?.(pc.connectionState);
    };

    pc.oniceconnectionstatechange = () => {
      this.onIceConnectionStateChange?.(pc.iceConnectionState);
    };

    this.peerConnection = pc;
    this.gotCandidate = false;
    this.hasRemoteDescription = false;
    this.pendingRemoteCandidates = [];
    return pc;
  }

  startIceTimeout(timeoutMs: number = 15000): void {
    if (this.iceTimeout) clearTimeout(this.iceTimeout);
    this.iceTimeout = setTimeout(() => {
      if (!this.gotCandidate && this.peerConnection) {
        logger.debug('[WebRTC] ICE timeout — no relay candidates. TURN may be unreachable.');
        this.onConnectionStateChange?.('failed');
        this.cleanup();
      }
    }, timeoutMs);
  }

  async getLocalMedia(options: {
    audio: boolean;
    video: boolean;
  }): Promise<MediaStream> {
    const stream = await mediaDevices.getUserMedia({
      audio: options.audio,
      video: options.video ? {
        facingMode: 'user',
        width: 640,
        height: 480,
        frameRate: 30,
      } : false,
    });

    this.localStream = stream;

    if (this.peerConnection) {
      stream.getTracks().forEach((track) => {
        this.peerConnection.addTrack(track, stream);
      });
    }

    return stream;
  }

  async createOffer(options?: { video?: boolean }): Promise<RTCSessionDescription> {
    if (!this.peerConnection) {
      throw new Error('PeerConnection not initialized');
    }

    const offer = await this.peerConnection.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: options?.video ?? false,
    });

    // Enforce Opus CBR to prevent traffic analysis of speech patterns
    if (offer.sdp) {
      offer.sdp = enforceConstantBitrate(offer.sdp);
    }

    await this.peerConnection.setLocalDescription(offer);

    // Trickle ICE: return the SDP immediately. ICE candidates are sent
    // separately via onIceCandidate as they're gathered.
    return offer;
  }

  async setRemoteOffer(remoteSdp: RTCSessionDescription): Promise<void> {
    if (!this.peerConnection) {
      throw new Error('PeerConnection not initialized');
    }

    logger.debug('[WebRTC] setRemoteDescription (offer)...');
    await this.peerConnection.setRemoteDescription(
      new RTCSessionDescription(remoteSdp)
    );
    this.hasRemoteDescription = true;
    this.flushPendingCandidates();
    logger.debug('[WebRTC] setRemoteDescription OK');
  }

  async createAnswer(): Promise<RTCSessionDescription> {
    if (!this.peerConnection) {
      throw new Error('PeerConnection not initialized');
    }

    logger.debug('[WebRTC] createAnswer...');
    const answer = await this.peerConnection.createAnswer();
    logger.debug('[WebRTC] createAnswer OK');

    // Enforce Opus CBR to prevent traffic analysis of speech patterns
    if (answer.sdp) {
      answer.sdp = enforceConstantBitrate(answer.sdp);
    }

    // Fire-and-forget: react-native-webrtc blocks setLocalDescription for
    // answers until ICE gathering completes (unlike offers which resolve
    // immediately). We already have the answer SDP — send it to the caller
    // right away via trickle ICE. ICE candidates flow separately.
    logger.debug('[WebRTC] setLocalDescription (answer) — non-blocking');
    this.peerConnection.setLocalDescription(new RTCSessionDescription(answer))
      .then(() => logger.debug('[WebRTC] setLocalDescription (answer) resolved'))
      .catch((e: unknown) => logger.debug('[WebRTC] setLocalDescription (answer) error:', e));

    return answer;
  }

  async setRemoteAnswer(sdp: RTCSessionDescription): Promise<void> {
    if (!this.peerConnection) {
      throw new Error('PeerConnection not initialized');
    }

    // Fire-and-forget: setting the remote answer completes the offer/answer
    // pair and triggers VoiceProcessingIO initialization on a worker thread.
    // On iOS simulator, this RPC can timeout and abort(). Making it
    // non-blocking prevents the crash from taking down the JS thread.
    logger.debug('[WebRTC] setRemoteDescription (answer) — non-blocking');
    this.peerConnection.setRemoteDescription(new RTCSessionDescription(sdp))
      .then(() => {
        logger.debug('[WebRTC] setRemoteDescription (answer) resolved');
        this.hasRemoteDescription = true;
        this.flushPendingCandidates();
      })
      .catch((e: unknown) => logger.debug('[WebRTC] setRemoteDescription (answer) error:', e));
  }

  async addIceCandidate(candidate: RTCIceCandidate): Promise<void> {
    if (!this.peerConnection) {
      throw new Error('PeerConnection not initialized');
    }

    if (!this.hasRemoteDescription) {
      this.pendingRemoteCandidates.push(candidate);
      logger.debug(`[WebRTC] buffered ICE candidate (remote desc not set yet, ${this.pendingRemoteCandidates.length} pending)`);
      return;
    }

    await this.peerConnection.addIceCandidate(
      new RTCIceCandidate(candidate)
    );
  }

  private flushPendingCandidates(): void {
    if (!this.peerConnection || this.pendingRemoteCandidates.length === 0) return;
    logger.debug(`[WebRTC] flushing ${this.pendingRemoteCandidates.length} buffered ICE candidate(s)`);
    for (const candidate of this.pendingRemoteCandidates) {
      this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate))
        .catch((e: unknown) => logger.debug('[WebRTC] buffered addIceCandidate failed:', e));
    }
    this.pendingRemoteCandidates = [];
  }

  /**
   * Update the PeerConnection's ICE server configuration with new TURN credentials.
   * Used during circuit rotation to point at a new relay.
   */
  updateIceServers(turnCredentials: TurnCredentials): void {
    if (!this.peerConnection) {
      throw new Error('PeerConnection not initialized');
    }

    // react-native-webrtc supports setConfiguration for updating ICE servers
    (this.peerConnection as any).setConfiguration({
      iceServers: [{
        urls: turnCredentials.turnUrls,
        username: turnCredentials.username,
        credential: turnCredentials.password,
      }],
      iceTransportPolicy: 'relay',
    });
    logger.debug('[WebRTC] ICE servers updated for circuit rotation');
  }

  /**
   * Perform an ICE restart with new TURN credentials.
   * Creates a new offer with iceRestart: true, forcing the PeerConnection
   * to gather new ICE candidates through the updated relay.
   */
  async performIceRestart(newTurnCredentials: TurnCredentials): Promise<RTCSessionDescription> {
    if (!this.peerConnection) {
      throw new Error('PeerConnection not initialized');
    }

    this.updateIceServers(newTurnCredentials);

    // Reset state for the new ICE negotiation
    this.hasRemoteDescription = false;
    this.pendingRemoteCandidates = [];
    this.gotCandidate = false;

    const offer = await this.peerConnection.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: false,
      iceRestart: true,
    } as any);

    // Enforce Opus CBR on the renegotiation offer
    if (offer.sdp) {
      offer.sdp = enforceConstantBitrate(offer.sdp);
    }

    await this.peerConnection.setLocalDescription(offer);

    logger.debug('[WebRTC] ICE restart offer created');
    return offer;
  }

  setAudioEnabled(enabled: boolean): void {
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        track.enabled = enabled;
      });
    }
  }

  setVideoEnabled(enabled: boolean): void {
    if (this.localStream) {
      this.localStream.getVideoTracks().forEach((track) => {
        track.enabled = enabled;
      });
    }
  }

  /**
   * Mute all media tracks for post-hangup padding without stopping the encoder.
   * Opus CBR continues to produce identically-sized silence frames at the same
   * bitrate, so the relay sees no traffic change. The PeerConnection stays alive
   * until the next rotation boundary when cleanup() is called.
   */
  muteForPadding(): void {
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        track.enabled = false;
      });
      this.localStream.getVideoTracks().forEach((track) => {
        track.enabled = false;
      });
    }
    // Stop the quality monitor — nobody is watching and it's just overhead
    this.stopQualityMonitor();
    // Detach all callbacks so the call context doesn't receive spurious events
    this.onRemoteStream = null;
    this.onConnectionStateChange = null;
    this.onIceConnectionStateChange = null;
    this.onIceCandidate = null;
    this.onCallQualityChange = null;
  }

  flipCamera(): void {
    if (this.localStream) {
      this.localStream.getVideoTracks().forEach((track) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- react-native-webrtc exposes _switchCamera on video tracks but it's not in the type definitions
        (track as { _switchCamera?: () => void })._switchCamera?.();
      });
    }
  }

  startQualityMonitor(): void {
    this.stopQualityMonitor();
    this.prevBytesSent = 0;
    this.prevBytesReceived = 0;
    this.prevStatsTimestamp = 0;

    this.qualityInterval = setInterval(() => {
      this.pollStats();
    }, 2000);
  }

  stopQualityMonitor(): void {
    if (this.qualityInterval) {
      clearInterval(this.qualityInterval);
      this.qualityInterval = null;
    }
  }

  private async pollStats(): Promise<void> {
    if (!this.peerConnection) return;

    try {
      // react-native-webrtc getStats() returns a Map-like object
      const stats = await (this.peerConnection as any).getStats();

      let rtt = 0;
      let jitter = 0;
      let packetsLost = 0;
      let packetsReceived = 0;
      let totalBytesSent = 0;
      let totalBytesReceived = 0;

      const now = Date.now();

      stats.forEach((report: any) => {
        if (report.type === 'candidate-pair' && report.state === 'succeeded') {
          // currentRoundTripTime is in seconds
          if (report.currentRoundTripTime != null) {
            rtt = report.currentRoundTripTime * 1000;
          }
        }

        if (report.type === 'inbound-rtp' && report.kind === 'audio') {
          if (report.jitter != null) {
            // jitter is in seconds for audio
            jitter = report.jitter * 1000;
          }
          if (report.packetsLost != null) {
            packetsLost += report.packetsLost;
          }
          if (report.packetsReceived != null) {
            packetsReceived += report.packetsReceived;
          }
          if (report.bytesReceived != null) {
            totalBytesReceived += report.bytesReceived;
          }
        }

        if (report.type === 'outbound-rtp') {
          if (report.bytesSent != null) {
            totalBytesSent += report.bytesSent;
          }
        }

        if (report.type === 'inbound-rtp' && report.kind === 'video') {
          if (report.bytesReceived != null) {
            totalBytesReceived += report.bytesReceived;
          }
          if (report.packetsLost != null) {
            packetsLost += report.packetsLost;
          }
          if (report.packetsReceived != null) {
            packetsReceived += report.packetsReceived;
          }
        }
      });

      const totalPackets = packetsReceived + packetsLost;
      const packetLoss = totalPackets > 0 ? packetsLost / totalPackets : 0;

      let bitrate = 0;
      if (this.prevStatsTimestamp > 0) {
        const elapsedMs = now - this.prevStatsTimestamp;
        if (elapsedMs > 0) {
          const bytesDelta =
            (totalBytesSent - this.prevBytesSent) +
            (totalBytesReceived - this.prevBytesReceived);
          // Convert bytes per ms to kbps: (bytes * 8) / (ms) = kbps
          bitrate = (bytesDelta * 8) / elapsedMs;
        }
      }

      this.prevBytesSent = totalBytesSent;
      this.prevBytesReceived = totalBytesReceived;
      this.prevStatsTimestamp = now;

      const quality: CallQuality = {
        rtt,
        packetLoss,
        jitter,
        bitrate: Math.round(bitrate),
        level: deriveQualityLevel(rtt, packetLoss),
      };

      this.onCallQualityChange?.(quality);
    } catch (e) {
      // getStats() can fail if the connection is closing — ignore
    }
  }

  async cleanup(): Promise<void> {
    this.stopQualityMonitor();

    if (this.iceTimeout) {
      clearTimeout(this.iceTimeout);
      this.iceTimeout = null;
    }

    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }

    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    this.remoteStream = null;
    this.hasRemoteDescription = false;
    this.pendingRemoteCandidates = [];
    this._peerConnectionId = null;
    this.onRemoteStream = null;
    this.onIceCandidate = null;
    this.onConnectionStateChange = null;
    this.onIceConnectionStateChange = null;
    this.onCallQualityChange = null;
  }

  getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  getRemoteStream(): MediaStream | null {
    return this.remoteStream;
  }

  /**
   * Get the native PeerConnection ID for frame encryption.
   * Returns null if no PeerConnection is active.
   */
  getPeerConnectionId(): number | null {
    return this._peerConnectionId;
  }

}
