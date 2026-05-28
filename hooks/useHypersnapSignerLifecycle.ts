/**
 * useHypersnapSignerLifecycle — opt-in modal trigger + background
 * renew-if-near-expiry job.
 *
 * Drop into the root of the post-auth tree. Mounting it once is enough.
 */

import { useEffect, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import {
  getHypersnapOptInChoice,
  hasShownHypersnapPrompt,
} from '@/services/farcaster/hypersnapOptIn';
import {
  provisionHypersnapSigner,
  renewHypersnapSignerIfNeeded,
} from '@/services/farcaster/hypersnapProvision';
import { logger } from '@quilibrium/quorum-shared';

interface UseHypersnapSignerLifecycleOptions {
  /** The user's Farcaster FID, if linked. Undefined when not linked. */
  fid: number | undefined;
}

interface UseHypersnapSignerLifecycleResult {
  /** True when the modal should be visible — Farcaster is linked but the
   *  user hasn't been asked yet. */
  promptVisible: boolean;
  dismissPrompt: () => void;
  /** Manually open the prompt (e.g. from a Settings entry). */
  openPrompt: () => void;
}

export function useHypersnapSignerLifecycle({
  fid,
}: UseHypersnapSignerLifecycleOptions): UseHypersnapSignerLifecycleResult {
  const [promptVisible, setPromptVisible] = useState(false);

  // First-time prompt: Farcaster linked, no prior choice persisted.
  useEffect(() => {
    if (!fid) return;
    if (hasShownHypersnapPrompt()) return;
    setPromptVisible(true);
  }, [fid]);

  // On user opt-in we need to actually provision the signer. We listen for
  // the choice flipping via storage and provision once.
  useEffect(() => {
    if (!fid) return;
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      const choice = getHypersnapOptInChoice();
      if (choice !== 'opted-in') return;
      try {
        // Provision is idempotent at the SecureStore layer — if a record
        // already exists the lifecycle hook will just renew.
        await renewHypersnapSignerIfNeeded();
        // If still no record exists, this was the first opt-in flow.
        const renewed = await renewHypersnapSignerIfNeeded();
        if (!renewed) {
          await provisionHypersnapSigner(fid);
        }
      } catch (e) {
        logger.warn('[hypersnap] signer provision/renew failed', e);
      }
    };
    void tick();
    return () => { cancelled = true; };
  }, [fid, promptVisible]);

  // Foreground renew check.
  useEffect(() => {
    if (!fid) return;
    const tick = () => {
      renewHypersnapSignerIfNeeded().catch((e) => {
        logger.warn('[hypersnap] foreground renew failed', e);
      });
    };
    tick();
    const sub = AppState.addEventListener('change', (status: AppStateStatus) => {
      if (status === 'active') tick();
    });
    return () => sub.remove();
  }, [fid]);

  return {
    promptVisible,
    dismissPrompt: () => setPromptVisible(false),
    openPrompt: () => setPromptVisible(true),
  };
}
