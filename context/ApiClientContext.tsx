/**
 * ApiClientContext - Provides QuorumApiClient to the app
 */

import React, { createContext, useContext, useMemo, useEffect } from 'react';
import type { QuorumApiClient } from '@quilibrium/quorum-shared';
import { QuorumMobileClient } from '../services/api/quorumClient';

interface ApiClientContextValue {
  apiClient: QuorumApiClient;
  setUserAddress: (address: string) => void;
  setSignMessage: (signFn: (message: string) => Promise<string>) => void;
}

const ApiClientContext = createContext<ApiClientContextValue | null>(null);

interface ApiClientProviderProps {
  children: React.ReactNode;
  userAddress?: string;
  signMessage?: (message: string) => Promise<string>;
}

export function ApiClientProvider({
  children,
  userAddress,
  signMessage,
}: ApiClientProviderProps) {
  const client = useMemo(() => new QuorumMobileClient(), []);

  // Update client when user address changes
  useEffect(() => {
    if (userAddress) {
      client.setUserAddress(userAddress);
    }
  }, [client, userAddress]);

  // Update client when sign function changes
  useEffect(() => {
    if (signMessage) {
      client.setSignMessage(signMessage);
    }
  }, [client, signMessage]);

  const value = useMemo<ApiClientContextValue>(
    () => ({
      apiClient: client,
      setUserAddress: (address: string) => client.setUserAddress(address),
      setSignMessage: (signFn: (message: string) => Promise<string>) =>
        client.setSignMessage(signFn),
    }),
    [client]
  );

  return (
    <ApiClientContext.Provider value={value}>
      {children}
    </ApiClientContext.Provider>
  );
}

export function useApiClient(): QuorumApiClient {
  const context = useContext(ApiClientContext);
  if (!context) {
    throw new Error('useApiClient must be used within an ApiClientProvider');
  }
  return context.apiClient;
}

export function useApiClientContext(): ApiClientContextValue {
  const context = useContext(ApiClientContext);
  if (!context) {
    throw new Error('useApiClientContext must be used within an ApiClientProvider');
  }
  return context;
}

export default ApiClientContext;
