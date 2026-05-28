/**
 * Privacy-preserving in-memory diagnostic buffer for space (group) calls.
 *
 * Goals:
 * - Capture enough structural detail to debug reliability bugs (renegotiation
 *   wedges, double-join races, silent disconnects, audio dropouts) without
 *   ever recording anything that could deanonymize participants or link a
 *   user to a relay circuit.
 * - Stay entirely in memory. No persistence, no automatic upload, no analytics
 *   breadcrumbs. Export is a user-initiated copy-to-clipboard and nothing else.
 * - Scope per call: peer indices reset on every `startCall`, so seeing
 *   "peer 0 ICE failed" in one call's buffer reveals nothing about who that
 *   peer was, and the *same* index in a later call refers to a different
 *   arrival-order slot.
 *
 * Forbidden in this buffer (enforced by convention — callers must not pass):
 *   - addresses (Ed448 / wallet / FID / username)
 *   - spaceId / channelId / roomId / circuitId
 *   - SDP, ICE candidate strings, fingerprints
 *   - IPs, ports, hostnames
 *   - any free-form string echoed from network or user
 *
 * Permitted: counts, durations in ms, fixed enum values (state names, kinds),
 * boolean flags, peer indices (number assigned by within-call arrival order).
 */

export interface DiagnosticEvent {
  /** Milliseconds since the start of the current call. */
  t: number;
  /** Stable event kind from the fixed kind set below. */
  kind: string;
  /** Structural data only — never identifiers. May be undefined. */
  data?: Record<string, string | number | boolean | undefined>;
}

const MAX_EVENTS = 200;

interface CallBuffer {
  startedAt: number;
  events: DiagnosticEvent[];
  /** address → arrival-order index. Cleared on next startCall. */
  peerIndices: Map<string, number>;
  nextPeerIndex: number;
  /** Filled in when endCall is called. */
  endedAt: number | null;
  endReason: string | null;
}

let current: CallBuffer | null = null;
/** The most recently finalized buffer, retained for export after the call ends. */
let lastFinalized: CallBuffer | null = null;

function buf(): CallBuffer | null {
  return current;
}

export function startCall(): void {
  current = {
    startedAt: Date.now(),
    events: [],
    peerIndices: new Map(),
    nextPeerIndex: 0,
    endedAt: null,
    endReason: null,
  };
}

export function endCall(reason: string): void {
  if (!current) return;
  current.endedAt = Date.now();
  current.endReason = reason;
  pushEvent('call.end', { reason });
  lastFinalized = current;
  current = null;
}

/**
 * Resolve a peer address to its within-call arrival-order index. The address
 * is NOT stored beyond this Map (used only to dedupe assignment), and the
 * Map itself is destroyed on the next startCall — so an exported buffer
 * carries indices only, never the source addresses.
 */
export function peerIndex(address: string | null | undefined): number {
  const b = buf();
  if (!b || !address) return -1;
  const existing = b.peerIndices.get(address);
  if (existing != null) return existing;
  const idx = b.nextPeerIndex++;
  b.peerIndices.set(address, idx);
  return idx;
}

export function pushEvent(
  kind: string,
  data?: Record<string, string | number | boolean | undefined>,
): void {
  const b = buf();
  if (!b) return;
  const evt: DiagnosticEvent = {
    t: Date.now() - b.startedAt,
    kind,
  };
  if (data) {
    // Drop undefined values so the export stays compact.
    const cleaned: Record<string, string | number | boolean> = {};
    let any = false;
    for (const k of Object.keys(data)) {
      const v = data[k];
      if (v !== undefined) {
        cleaned[k] = v;
        any = true;
      }
    }
    if (any) evt.data = cleaned;
  }
  b.events.push(evt);
  if (b.events.length > MAX_EVENTS) {
    // Drop oldest; structural-only, so a windowed view is fine.
    b.events.splice(0, b.events.length - MAX_EVENTS);
  }
}

/**
 * Snapshot the active or most recently finalized buffer for inspection.
 * Returns null if neither exists.
 */
export function snapshot(): {
  startedAt: number;
  endedAt: number | null;
  endReason: string | null;
  events: DiagnosticEvent[];
  peerCount: number;
} | null {
  const b = current ?? lastFinalized;
  if (!b) return null;
  return {
    startedAt: b.startedAt,
    endedAt: b.endedAt,
    endReason: b.endReason,
    events: b.events.slice(),
    peerCount: b.nextPeerIndex,
  };
}

/**
 * Format the snapshot as plain text for clipboard export. Stable, line-oriented,
 * machine-grep-friendly. Caller decides where this goes — we never send it.
 */
export function formatForExport(): string {
  const s = snapshot();
  if (!s) return 'call-diag: no buffer';
  const lines: string[] = [];
  lines.push(`call-diag v1`);
  lines.push(`duration_ms=${(s.endedAt ?? Date.now()) - s.startedAt}`);
  lines.push(`peer_count=${s.peerCount}`);
  lines.push(`end_reason=${s.endReason ?? 'live'}`);
  lines.push(`events=${s.events.length}`);
  lines.push('---');
  for (const e of s.events) {
    let line = `+${e.t}ms ${e.kind}`;
    if (e.data) {
      const parts: string[] = [];
      for (const k of Object.keys(e.data)) {
        parts.push(`${k}=${e.data[k]}`);
      }
      if (parts.length) line += ` ${parts.join(' ')}`;
    }
    lines.push(line);
  }
  return lines.join('\n');
}

/** For unit-test or hard reset paths. */
export function _resetForTests(): void {
  current = null;
  lastFinalized = null;
}
