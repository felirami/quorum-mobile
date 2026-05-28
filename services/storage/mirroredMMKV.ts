/**
 * mirroredMMKV - drop-in replacement for createMMKV({ id }) that mirrors
 * every mutating call into a parallel MMKV instance rooted in the iOS
 * App Group container.
 *
 * The iOS Notification Service Extension lives in a sandbox separate
 * from the main app and can't read MMKV files from the app's normal
 * Documents/Library tree. To let the NSE decrypt incoming pushes and
 * decide whether to suppress notifications for control-type messages
 * (update-profile, edit-message, remove-message), the main app
 * mirrors the small set of MMKV stores the NSE needs into the App
 * Group container, where both processes can mmap them.
 *
 * Behavior:
 *   - Reads always come from the sandbox MMKV (the source of truth).
 *   - Writes (`set`, `remove`, `clearAll`) go to both the sandbox MMKV
 *     and the App Group mirror.
 *   - On Android, or when the App Group entitlement is unavailable,
 *     the mirror is null and this behaves identically to plain
 *     createMMKV.
 *
 * The returned object is structurally compatible with the MMKV type
 * for the methods we use (getString, set, remove, getAllKeys,
 * clearAll, contains, getNumber, getBoolean). Add forwarders here if
 * a caller needs a method that isn't yet proxied.
 */

import { Platform } from 'react-native';
import { createMMKV, type MMKV } from 'react-native-mmkv';

function getAppGroupMMKVRoot(): string | null {
  if (Platform.OS !== 'ios') return null;
  try {
    type AppGroupModule = { getAppGroupPath?: () => string | null };
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod: AppGroupModule | undefined =
      require('../../modules/quorum-crypto/src/QuorumCryptoModule').default;
    const path = mod?.getAppGroupPath?.();
    if (typeof path !== 'string' || path.length === 0) return null;
    return `${path}/mmkv`;
  } catch {
    return null;
  }
}

export function createMirroredMMKV({ id }: { id: string }): MMKV {
  const primary = createMMKV({ id });
  const appGroupRoot = getAppGroupMMKVRoot();
  let mirror: MMKV | null = null;
  if (appGroupRoot) {
    try {
      mirror = createMMKV({ id, path: appGroupRoot });
    } catch {
      // Permissions / race during first launch — degrade silently. The
      // sandbox MMKV keeps working; the NSE just falls back to its
      // catalog-only path until next launch retries.
      mirror = null;
    }
  }

  // Proxy that delegates reads to `primary` and mirrors writes to both.
  // We expose the full MMKV interface by forwarding to `primary` and
  // intercepting mutators.
  return new Proxy(primary, {
    get(target, prop, receiver) {
      if (prop === 'set') {
        return (key: string, value: string | number | boolean) => {
          target.set(key, value);
          mirror?.set(key, value);
        };
      }
      if (prop === 'remove') {
        return (key: string) => {
          target.remove(key);
          mirror?.remove(key);
        };
      }
      if (prop === 'clearAll') {
        return () => {
          target.clearAll();
          mirror?.clearAll();
        };
      }
      const v = Reflect.get(target, prop, receiver);
      return typeof v === 'function' ? v.bind(target) : v;
    },
  });
}
