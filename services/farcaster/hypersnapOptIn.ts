/**
 * Persisted Hypersnap signer opt-in state.
 *
 * MMKV-backed. Two keys:
 *   - `hypersnap.optInChoice`: 'opted-in' | 'opted-out' | unset
 *   - `hypersnap.optInPromptShown`: '1' once the user has seen the prompt
 *
 * The mobile adapter at services/farcaster/hypersnapAdapters.ts converts
 * this into the OptInStore interface that quorum-shared consumes.
 */

import { mmkvStorage } from '@/services/offline/storage';
import type { HypersnapOptInChoice } from '@quilibrium/quorum-shared';

const KEY_CHOICE = 'hypersnap.optInChoice';
const KEY_PROMPT_SHOWN = 'hypersnap.optInPromptShown';

export function getHypersnapOptInChoice(): HypersnapOptInChoice {
  const raw = mmkvStorage.getItem(KEY_CHOICE);
  if (raw === 'opted-in' || raw === 'opted-out') return raw;
  return 'unset';
}

export function setHypersnapOptInChoice(choice: HypersnapOptInChoice): void {
  if (choice === 'unset') {
    mmkvStorage.removeItem(KEY_CHOICE);
    return;
  }
  mmkvStorage.setItem(KEY_CHOICE, choice);
  mmkvStorage.setItem(KEY_PROMPT_SHOWN, '1');
}

export function hasShownHypersnapPrompt(): boolean {
  return mmkvStorage.getItem(KEY_PROMPT_SHOWN) === '1';
}

export function markHypersnapPromptShown(): void {
  mmkvStorage.setItem(KEY_PROMPT_SHOWN, '1');
}
