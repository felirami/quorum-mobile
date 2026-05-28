import React, { useEffect } from 'react';
import { Keyboard } from 'react-native';
import { useCall } from '@/context';
import { IncomingCallScreen } from './IncomingCallScreen';
import { OutgoingCallScreen } from './OutgoingCallScreen';
import { InCallScreen } from './InCallScreen';

export function CallOverlay() {
  const { activeCall, incomingCall } = useCall();

  // Whenever a call screen is about to take over the UI, hide any
  // currently-shown soft keyboard. Without this, tapping "Call" while
  // the DM message input was focused leaves the keyboard up — and on
  // iOS it overlays the call screen's bottom controls (hangup
  // included), with no way to dismiss short of force-quitting the app.
  // Keying off callId / incomingCallId so this runs on each new call,
  // not on every render.
  const callId = activeCall?.callId;
  const incomingCallId = incomingCall?.callId;
  useEffect(() => {
    if (callId || incomingCallId) Keyboard.dismiss();
  }, [callId, incomingCallId]);

  if (incomingCall && !activeCall) {
    return <IncomingCallScreen />;
  }

  if (!activeCall) return null;

  switch (activeCall.state) {
    case 'offering':
    case 'ringing':
      return <OutgoingCallScreen />;
    case 'connecting':
    case 'connected':
    case 'reconnecting':
      return <InCallScreen />;
    default:
      return null;
  }
}
