/**
 * API Configuration
 *
 * In dev mode (__DEV__), the user can toggle between localhost and production
 * via setDevModeLocal(). Persisted in MMKV. Default is production.
 */

import { Platform } from 'react-native';
import { createMMKV } from 'react-native-mmkv';
import { logger } from '@quilibrium/quorum-shared';
export interface ApiConfig {
  baseUrl: string;
  wsUrl: string;
  apiVersion: string;
}

const PROD_BASE = 'https://api.quorummessenger.com';
const PROD_WS = 'wss://api.quorummessenger.com/ws';

const DEV_HOST = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
const DEV_BASE = `http://${DEV_HOST}:5000`;
const DEV_WS = `ws://${DEV_HOST}:5000/ws`;

const DEV_MODE_KEY = 'useLocalApi';

// Use a tiny dedicated MMKV instance so we don't depend on the main storage
// module (avoids circular imports and load-order issues).
let devStorage: ReturnType<typeof createMMKV> | null = null;
function getDevStorage() {
  if (!devStorage) {
    devStorage = createMMKV({ id: 'quorum-dev-config' });
  }
  return devStorage;
}

let useLocalApi = false;
if (__DEV__) {
  try {
    useLocalApi = getDevStorage().getBoolean(DEV_MODE_KEY) === true;
    logger.debug(`[Config] dev mode local API: ${useLocalApi}`);
  } catch (e) {
    logger.debug('[Config] failed to read dev mode setting:', e);
  }
}

function buildConfig(): ApiConfig {
  const isLocal = __DEV__ && useLocalApi;
  return {
    baseUrl: isLocal ? DEV_BASE : PROD_BASE,
    wsUrl: isLocal ? DEV_WS : PROD_WS,
    apiVersion: 'v1',
  };
}

let currentConfig = buildConfig();

export function getApiConfig(): ApiConfig {
  return currentConfig;
}

export function isDevModeLocal(): boolean {
  return __DEV__ && useLocalApi;
}

export function setDevModeLocal(enabled: boolean): void {
  if (!__DEV__) return;
  useLocalApi = enabled;
  getDevStorage().set(DEV_MODE_KEY, enabled);
  currentConfig = buildConfig();
  logger.debug(`[Config] switched to ${enabled ? currentConfig.baseUrl : 'production'}`);
}

export const API_CONFIG = new Proxy({} as ApiConfig, {
  get(_target, prop: string) {
    return (currentConfig as any)[prop];
  },
});
