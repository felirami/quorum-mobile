/**
 * Scam-cast filter.
 *
 * A scammer is currently typo-squatting hypria.xyz with `hyrpia.xyz`
 * (note the transposed `r` and `y`) and posting it as a cast embed
 * across replies and quote-casts on basically every cast we publish.
 * The site is a wallet drainer. Until Farcaster takes the domain down
 * we suppress any cast whose embeds (or visible text) reference it.
 *
 * The matcher is domain-anchored — it catches `hyrpia.xyz`,
 * `https://hyrpia.xyz/path`, `WWW.HYRPIA.XYZ`, etc., but NOT the
 * legitimate `hypria.xyz`. Add to SCAM_DOMAINS if more variants show
 * up; the predicate is case-insensitive and tolerant of subdomains.
 */

const SCAM_DOMAINS: readonly string[] = [
  'hyrpia.xyz',
];

// Build a single regex that matches any scam domain as a hostname or
// embedded substring. Anchors require the match to START at a domain
// boundary (start of string, whitespace, slash, dot, @) so we don't
// false-positive on something like "hyrpia.xyz.notarealdomain.com" —
// though for a wallet-drainer typo squat, even that broad a match is
// arguably fine.
const SCAM_DOMAIN_RE = new RegExp(
  '(?:^|[^a-z0-9])(' +
    SCAM_DOMAINS.map((d) => d.replace(/\./g, '\\.')).join('|') +
    ')(?:[/?#]|$|[^a-z0-9.])',
  'i',
);

function stringContainsScamDomain(s: unknown): boolean {
  if (typeof s !== 'string' || s.length === 0) return false;
  return SCAM_DOMAIN_RE.test(s);
}

interface CastEmbedUrl {
  url?: string;
  openGraph?: {
    url?: string;
    sourceUrl?: string;
    domain?: string;
    title?: string;
    description?: string;
    frameEmbedNext?: { frameUrl?: string };
  };
  snap?: { url?: string };
}

interface CastLike {
  text?: string;
  textWithEmbeds?: string;
  embeds?: {
    urls?: CastEmbedUrl[];
    casts?: Array<CastLike | { hash?: string }>;
    unknowns?: unknown[];
    processedCastText?: string;
  };
}

/**
 * Returns true if the given cast — or any cast/embed it references —
 * mentions a known scam domain. Used to suppress rendering at list
 * and individual-card boundaries.
 *
 * Recursive across `embeds.casts` so a clean cast that QUOTES a scam
 * cast is also suppressed (the visible scam payload is what matters).
 */
export function isScamCast(cast: CastLike | null | undefined): boolean {
  if (!cast) return false;

  if (stringContainsScamDomain(cast.text)) return true;
  if (stringContainsScamDomain(cast.textWithEmbeds)) return true;
  if (stringContainsScamDomain(cast.embeds?.processedCastText)) return true;

  for (const u of cast.embeds?.urls ?? []) {
    if (stringContainsScamDomain(u.url)) return true;
    if (stringContainsScamDomain(u.openGraph?.url)) return true;
    if (stringContainsScamDomain(u.openGraph?.sourceUrl)) return true;
    if (stringContainsScamDomain(u.openGraph?.domain)) return true;
    if (stringContainsScamDomain(u.openGraph?.frameEmbedNext?.frameUrl)) return true;
    if (stringContainsScamDomain(u.snap?.url)) return true;
  }

  for (const embedded of cast.embeds?.casts ?? []) {
    if (isScamCast(embedded as CastLike)) return true;
  }

  return false;
}

/** Convenience: filter an array of casts in one call. */
export function filterScamCasts<T extends CastLike>(casts: T[] | undefined): T[] {
  if (!casts) return [];
  return casts.filter((c) => !isScamCast(c));
}

/**
 * Test-only predicate used to assert the matcher accepts the actual
 * scam domain and rejects the legitimate variant. Not called at
 * runtime; kept here so anyone editing the regex can sanity-check.
 */
export function _selfTest(): { passes: boolean; details: Record<string, boolean> } {
  const cases: Record<string, boolean> = {
    'naked hyrpia.xyz': stringContainsScamDomain('check this hyrpia.xyz/claim'),
    'https url': stringContainsScamDomain('https://hyrpia.xyz'),
    'uppercase': stringContainsScamDomain('HYRPIA.XYZ'),
    'subdomain': stringContainsScamDomain('https://www.hyrpia.xyz/'),
    'in path NOT matched (false)': !stringContainsScamDomain('https://example.com/hyrpia.xyz'),
    'legit hypria.xyz NOT matched': !stringContainsScamDomain('check hypria.xyz'),
    'legit hypria with trailing': !stringContainsScamDomain('hypria.xyz/launch'),
  };
  const passes = Object.values(cases).every(Boolean);
  return { passes, details: cases };
}
