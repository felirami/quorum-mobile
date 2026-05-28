/**
 * Persistent notification log.
 *
 * Every notification we surface to the OS is also appended here so the
 * in-app notification center can replay them. Uses MMKV so the log
 * survives app restarts and can be inspected later (the OS notification
 * tray clears on user dismiss; we want our own record).
 *
 * Also tracks an "unread count" — entries created after the last time the
 * user opened the in-app notification center. The tab badge consumes
 * that count.
 */

import { createMMKV, type MMKV } from 'react-native-mmkv';
import { useEffect, useState } from 'react';
import type { MessageNotificationData } from './NotificationService';

const storage: MMKV = createMMKV({ id: 'quorum-notifications' });

const KEY_ENTRIES = 'log.entries';
const KEY_LAST_SEEN = 'log.lastSeenAt';
// Keep the log bounded — older entries roll off so a runaway producer can't
// fill MMKV. 200 is plenty for a notification center; users that scroll
// past that probably want OS-level history anyway.
const MAX_ENTRIES = 200;

export interface NotificationLogEntry {
  id: string;
  title: string;
  body: string;
  data?: MessageNotificationData;
  createdAt: number;
}

type Listener = () => void;
const listeners = new Set<Listener>();

function emit(): void {
  for (const l of listeners) {
    try { l(); } catch { /* swallow per-listener errors */ }
  }
}

export function getNotificationLog(): NotificationLogEntry[] {
  const raw = storage.getString(KEY_ENTRIES);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as NotificationLogEntry[]) : [];
  } catch {
    return [];
  }
}

export function appendNotificationLog(entry: Omit<NotificationLogEntry, 'createdAt'> & { createdAt?: number }): void {
  const existing = getNotificationLog();
  const next: NotificationLogEntry[] = [
    {
      id: entry.id,
      title: entry.title,
      body: entry.body,
      data: entry.data,
      createdAt: entry.createdAt ?? Date.now(),
    },
    ...existing.filter(e => e.id !== entry.id),
  ];
  if (next.length > MAX_ENTRIES) next.length = MAX_ENTRIES;
  storage.set(KEY_ENTRIES, JSON.stringify(next));
  emit();
}

export function clearNotificationLog(): void {
  storage.remove(KEY_ENTRIES);
  emit();
}

export function removeNotificationLogEntry(id: string): void {
  const next = getNotificationLog().filter(e => e.id !== id);
  storage.set(KEY_ENTRIES, JSON.stringify(next));
  emit();
}

export function markNotificationsSeen(): void {
  storage.set(KEY_LAST_SEEN, String(Date.now()));
  emit();
}

export function getLastSeenTimestamp(): number {
  const v = storage.getString(KEY_LAST_SEEN);
  return v ? parseInt(v, 10) : 0;
}

export function getUnreadNotificationCount(): number {
  const lastSeen = getLastSeenTimestamp();
  return getNotificationLog().reduce(
    (n, e) => (e.createdAt > lastSeen ? n + 1 : n),
    0,
  );
}

/**
 * React subscription helper. Returns the current log + unread count and
 * re-renders whenever any of the mutators above fire.
 */
export function useNotificationLog(): {
  entries: NotificationLogEntry[];
  unreadCount: number;
} {
  const [entries, setEntries] = useState<NotificationLogEntry[]>(() => getNotificationLog());
  const [unreadCount, setUnreadCount] = useState<number>(() => getUnreadNotificationCount());
  useEffect(() => {
    const listener = () => {
      setEntries(getNotificationLog());
      setUnreadCount(getUnreadNotificationCount());
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return { entries, unreadCount };
}
