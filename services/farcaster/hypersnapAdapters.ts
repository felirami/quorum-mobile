/**
 * Mobile-side adapters that fulfil the SignerStore / OptInStore contracts
 * from @quilibrium/quorum-shared.
 *
 * - SignerStore → SecureStore (Ed25519 private key must live in the keychain).
 * - OptInStore → MMKV (cheap, frequent reads).
 */

import * as SecureStore from 'expo-secure-store';
import {
  getHypersnapOptInChoice,
  setHypersnapOptInChoice,
} from './hypersnapOptIn';
import {
  type HypersnapOptInChoice,
  type OptInStore,
  type SignerRecord,
  type SignerStore,
} from '@quilibrium/quorum-shared';

const SIGNER_KEY = 'hypersnap.signerRecord.v1';
const SECURE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export const hypersnapSignerStore: SignerStore = {
  async get(): Promise<SignerRecord | null> {
    const raw = await SecureStore.getItemAsync(SIGNER_KEY, SECURE_OPTIONS);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as SignerRecord;
    } catch {
      return null;
    }
  },
  async save(record: SignerRecord): Promise<void> {
    await SecureStore.setItemAsync(SIGNER_KEY, JSON.stringify(record), SECURE_OPTIONS);
  },
  async clear(): Promise<void> {
    await SecureStore.deleteItemAsync(SIGNER_KEY);
  },
};

export const hypersnapOptInStore: OptInStore = {
  async get(): Promise<HypersnapOptInChoice> {
    return getHypersnapOptInChoice();
  },
  async set(choice: HypersnapOptInChoice): Promise<void> {
    setHypersnapOptInChoice(choice);
  },
};
