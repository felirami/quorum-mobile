import type {
  Message,
  CallOfferMessage,
  CallAnswerMessage,
  CallRejectMessage,
  CallHangupMessage,
  CallIceCandidateMessage,
  CallEventMessage,
  CallRenegotiateMessage,
} from '@quilibrium/quorum-shared';
import type { TurnCredentials } from './relay-client';

function generateNonce(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function generateCallId(): string {
  return 'call-' + generateNonce();
}

function buildCallMessage(
  senderId: string,
  recipientAddress: string,
  content: CallOfferMessage | CallAnswerMessage | CallRejectMessage | CallHangupMessage | CallIceCandidateMessage | CallEventMessage | CallRenegotiateMessage,
): Message {
  const nonce = generateNonce();
  const now = Date.now();

  return {
    messageId: `call-signal-${nonce}`,
    channelId: recipientAddress,
    spaceId: recipientAddress,
    digestAlgorithm: 'SHA-256',
    nonce,
    createdDate: now,
    modifiedDate: now,
    lastModifiedHash: '',
    content,
    reactions: [],
    mentions: { memberIds: [], roleIds: [], channelIds: [] },
  };
}

export function createCallOffer(params: {
  senderId: string;
  recipientAddress: string;
  callId?: string;
  sdp: string;
  mediaType: 'audio' | 'video';
  relayCredentials: TurnCredentials;
  circuitId: string;
}): { message: Message; callId: string } {
  const callId = params.callId || generateCallId();
  const content: CallOfferMessage = {
    senderId: params.senderId,
    type: 'call-offer',
    callId,
    sdp: params.sdp,
    mediaType: params.mediaType,
    relayCredentials: {
      username: params.relayCredentials.username,
      password: params.relayCredentials.password,
      turnUrls: params.relayCredentials.turnUrls,
      ttl: params.relayCredentials.ttl,
    },
    circuitId: params.circuitId,
  };

  return {
    message: buildCallMessage(params.senderId, params.recipientAddress, content),
    callId,
  };
}

export function createCallAnswer(params: {
  senderId: string;
  recipientAddress: string;
  callId: string;
  sdp: string;
}): Message {
  const content: CallAnswerMessage = {
    senderId: params.senderId,
    type: 'call-answer',
    callId: params.callId,
    sdp: params.sdp,
  };
  return buildCallMessage(params.senderId, params.recipientAddress, content);
}

export function createCallReject(params: {
  senderId: string;
  recipientAddress: string;
  callId: string;
  reason: 'declined' | 'busy' | 'unavailable' | 'timeout';
}): Message {
  const content: CallRejectMessage = {
    senderId: params.senderId,
    type: 'call-reject',
    callId: params.callId,
    reason: params.reason,
  };
  return buildCallMessage(params.senderId, params.recipientAddress, content);
}

export function createCallHangup(params: {
  senderId: string;
  recipientAddress: string;
  callId: string;
}): Message {
  const content: CallHangupMessage = {
    senderId: params.senderId,
    type: 'call-hangup',
    callId: params.callId,
  };
  return buildCallMessage(params.senderId, params.recipientAddress, content);
}

export function createCallIceCandidate(params: {
  senderId: string;
  recipientAddress: string;
  callId: string;
  candidate: string;
}): Message {
  const content: CallIceCandidateMessage = {
    senderId: params.senderId,
    type: 'call-ice-candidate',
    callId: params.callId,
    candidate: params.candidate,
  };
  return buildCallMessage(params.senderId, params.recipientAddress, content);
}

export function createCallEvent(params: {
  senderId: string;
  recipientAddress: string;
  callId: string;
  mediaType: 'audio' | 'video';
  event: 'completed' | 'missed' | 'declined' | 'failed';
  duration?: number;
}): Message {
  const content: CallEventMessage = {
    senderId: params.senderId,
    type: 'call-event',
    callId: params.callId,
    mediaType: params.mediaType,
    event: params.event,
    duration: params.duration,
  };
  return buildCallMessage(params.senderId, params.recipientAddress, content);
}

export function createCallRenegotiate(params: {
  senderId: string;
  recipientAddress: string;
  callId: string;
  sdp: string;
  relayCredentials: TurnCredentials;
}): Message {
  const content: CallRenegotiateMessage = {
    senderId: params.senderId,
    type: 'call-renegotiate',
    callId: params.callId,
    sdp: params.sdp,
    relayCredentials: {
      username: params.relayCredentials.username,
      password: params.relayCredentials.password,
      turnUrls: params.relayCredentials.turnUrls,
      ttl: params.relayCredentials.ttl,
    },
  };
  return buildCallMessage(params.senderId, params.recipientAddress, content);
}

export function isCallSignalingMessage(content: { type: string }): boolean {
  return content.type.startsWith('call-');
}
