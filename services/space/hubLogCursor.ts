/**
 * Per-hub log cursor — tracks the highest sequence number we've ingested for
 * each hub address. Used to drive log-since catch-up on reconnect and to
 * gap-fill on log-update notifications.
 */

import { createMMKV } from 'react-native-mmkv';

const storage = createMMKV({ id: 'quorum-hub-log-cursor' });

const key = (hubAddress: string) => `seq/${hubAddress}`;

export function getHubLastSeq(hubAddress: string): number {
  const v = storage.getNumber(key(hubAddress));
  return v ?? 0;
}

export function setHubLastSeq(hubAddress: string, seq: number): void {
  const cur = getHubLastSeq(hubAddress);
  if (seq > cur) {
    storage.set(key(hubAddress), seq);
  }
}

export function clearHubCursor(hubAddress: string): void {
  storage.remove(key(hubAddress));
}
