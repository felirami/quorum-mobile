/**
 * React Query <-> React Native bridges.
 *
 * On the web, React Query subscribes to `window.focus` / `window.blur` and
 * the `navigator.onLine` events. RN has neither — without explicitly
 * wiring focusManager and onlineManager, refetchOnWindowFocus is a no-op
 * and refetchInterval can be paused or skipped because the focus state
 * never resolves to `true`.
 *
 * Symptoms users report when this isn't wired:
 *   - "chat list doesn't update unless I open the chat"
 *   - "messages don't appear until I background and reopen the app"
 *
 * Install once at app startup before any QueryClient consumers run.
 */

import { focusManager, onlineManager } from '@tanstack/react-query';
import NetInfo from '@react-native-community/netinfo';
import { AppState, type AppStateStatus, Platform } from 'react-native';

let installed = false;

export function installReactQueryRnBridges(): void {
  if (installed) return;
  installed = true;

  // Focus: React Query polls + revalidates while focused. Use AppState's
  // 'active' as the focus signal on iOS/Android; web is already handled
  // by the library's default DOM listener.
  focusManager.setEventListener((handleFocus) => {
    if (Platform.OS === 'web') return undefined;
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      handleFocus(state === 'active');
    });
    // Seed the initial state — without this, the first refetchInterval
    // tick may not fire because the manager hasn't been told the app is
    // active yet.
    handleFocus(AppState.currentState === 'active');
    return () => sub.remove();
  });

  // Online: pauses queries when offline, resumes when reconnected.
  onlineManager.setEventListener((setOnline) => {
    return NetInfo.addEventListener((state) => {
      setOnline(state.isConnected !== false);
    });
  });
}
