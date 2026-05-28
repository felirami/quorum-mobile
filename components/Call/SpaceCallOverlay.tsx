/**
 * SpaceCallOverlay - Root-level component that shows either the full-screen
 * SpaceCallScreen or the minimized SpaceCallPiP, depending on state.
 *
 * Renders at the app root alongside CallOverlay.
 * Uses isOverlayMinimized from SpaceCallContext so that other components
 * (e.g. SpaceCallBubble) can also expand the overlay.
 */

import React, { useCallback, useEffect } from 'react';
import { Keyboard } from 'react-native';
import { useSpaceCall } from '@/context/SpaceCallContext';
import { SpaceCallScreen } from './SpaceCallScreen';
import { SpaceCallPiP } from './SpaceCallPiP';

export function SpaceCallOverlay() {
  const { state, isOverlayMinimized, setOverlayMinimized } = useSpaceCall();

  const handleMinimize = useCallback(() => {
    setOverlayMinimized(true);
  }, [setOverlayMinimized]);

  const handleExpand = useCallback(() => {
    setOverlayMinimized(false);
  }, [setOverlayMinimized]);

  // Same fix as CallOverlay: drop the soft keyboard when a space call
  // first appears so its bottom controls can't be hidden behind it.
  // Keyed off activeRoomId so re-renders during a single call don't
  // re-fire this on every state change.
  const activeRoomId = state.activeRoomId;
  useEffect(() => {
    if (activeRoomId) Keyboard.dismiss();
  }, [activeRoomId]);

  if (!state.activeRoomId) return null;

  if (isOverlayMinimized) {
    return <SpaceCallPiP onExpand={handleExpand} />;
  }

  return <SpaceCallScreen onMinimize={handleMinimize} />;
}
