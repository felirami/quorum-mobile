/**
 * API Configuration
 */

export interface ApiConfig {
  baseUrl: string;
  wsUrl: string;
  apiVersion: string;
}

const apiConfig: ApiConfig = {
  baseUrl: 'https://api.quorummessenger.com',
  wsUrl: 'wss://api.quorummessenger.com/ws',
  apiVersion: 'v1',
};

export function getApiConfig(): ApiConfig {
  return apiConfig;
}

export const API_CONFIG = getApiConfig();

