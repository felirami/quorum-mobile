/**
 * Emoji Frecency Service
 *
 * Tracks emoji usage with frecency scoring (frequency + recency).
 * Higher scores for emojis used more frequently and more recently.
 */

import { File, Paths } from 'expo-file-system';

const STORAGE_FILENAME = 'emoji_frecency.json';
const MAX_TRACKED_EMOJIS = 50;
const DECAY_FACTOR = 0.95; // How much old usage decays per new usage

interface EmojiUsage {
  emoji: string;
  score: number;
  lastUsed: number;
}

interface FrecencyData {
  emojis: EmojiUsage[];
  lastUpdated: number;
}

let cachedData: FrecencyData | null = null;

/**
 * Get the storage file reference
 */
function getStorageFile(): File {
  return new File(Paths.document, STORAGE_FILENAME);
}

/**
 * Load frecency data from storage
 */
async function loadData(): Promise<FrecencyData> {
  if (cachedData) return cachedData;

  try {
    const file = getStorageFile();
    if (file.exists) {
      const stored = await file.text();
      cachedData = JSON.parse(stored);
      return cachedData!;
    }
  } catch {
    // File may not exist yet or contain malformed JSON — fall through to default
  }

  cachedData = { emojis: [], lastUpdated: Date.now() };
  return cachedData;
}

/**
 * Save frecency data to storage
 */
async function saveData(data: FrecencyData): Promise<void> {
  cachedData = data;
  try {
    const file = getStorageFile();
    await file.write(JSON.stringify(data));
  } catch {
    // Best-effort persistence — frecency data is non-critical
  }
}

/**
 * Calculate time-decayed score
 * Scores decay over time to favor recently used emojis
 */
function calculateDecayedScore(score: number, lastUsed: number): number {
  const now = Date.now();
  const hoursSinceUse = (now - lastUsed) / (1000 * 60 * 60);
  // Decay by 50% every 24 hours
  const decayMultiplier = Math.pow(0.5, hoursSinceUse / 24);
  return score * decayMultiplier;
}

/**
 * Record emoji usage - call this when an emoji is selected
 */
export async function recordEmojiUsage(emoji: string): Promise<void> {
  const data = await loadData();
  const now = Date.now();

  // Apply decay to all existing scores
  data.emojis = data.emojis.map(e => ({
    ...e,
    score: e.score * DECAY_FACTOR,
  }));

  // Find existing entry or create new one
  const existingIndex = data.emojis.findIndex(e => e.emoji === emoji);

  if (existingIndex >= 0) {
    // Boost existing emoji
    data.emojis[existingIndex].score += 1;
    data.emojis[existingIndex].lastUsed = now;
  } else {
    // Add new emoji
    data.emojis.push({
      emoji,
      score: 1,
      lastUsed: now,
    });
  }

  // Sort by decayed score (highest first) and trim to max
  data.emojis.sort((a, b) => {
    const scoreA = calculateDecayedScore(a.score, a.lastUsed);
    const scoreB = calculateDecayedScore(b.score, b.lastUsed);
    return scoreB - scoreA;
  });

  // Keep only top N emojis
  data.emojis = data.emojis.slice(0, MAX_TRACKED_EMOJIS);
  data.lastUpdated = now;

  await saveData(data);
}

/**
 * Get recent emojis sorted by frecency score
 */
export async function getRecentEmojis(limit: number = 24): Promise<string[]> {
  const data = await loadData();

  // Sort by decayed score and return emoji strings
  const sorted = [...data.emojis]
    .map(e => ({
      emoji: e.emoji,
      decayedScore: calculateDecayedScore(e.score, e.lastUsed),
    }))
    .sort((a, b) => b.decayedScore - a.decayedScore)
    .slice(0, limit)
    .map(e => e.emoji);

  return sorted;
}

/**
 * Clear all frecency data
 */
export async function clearFrecencyData(): Promise<void> {
  cachedData = null;
  try {
    const file = getStorageFile();
    if (file.exists) {
      await file.delete();
    }
  } catch {
    // Best-effort cleanup — ignore file deletion errors
  }
}
