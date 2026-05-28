/**
 * Hook for biometric authentication
 */

import * as LocalAuthentication from 'expo-local-authentication';
import { useCallback, useEffect, useState } from 'react';

export interface BiometricAuthResult {
  success: boolean;
  error?: string;
}

export function useBiometricAuth() {
  const [isAvailable, setIsAvailable] = useState(false);
  const [biometricType, setBiometricType] = useState<'fingerprint' | 'facial' | 'iris' | null>(null);

  useEffect(() => {
    checkBiometricAvailability();
  }, []);

  const checkBiometricAvailability = async () => {
    try {
      const compatible = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      setIsAvailable(compatible && enrolled);

      if (compatible && enrolled) {
        const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
        if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
          setBiometricType('facial');
        } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
          setBiometricType('fingerprint');
        } else if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) {
          setBiometricType('iris');
        }
      }
    } catch (error) {
      setIsAvailable(false);
    }
  };

  const authenticate = useCallback(async (
    promptMessage: string = 'Authenticate to confirm'
  ): Promise<BiometricAuthResult> => {
    try {
      if (!isAvailable) {
        return { success: false, error: 'Biometric authentication not available' };
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage,
        fallbackLabel: 'Use passcode',
        cancelLabel: 'Cancel',
        disableDeviceFallback: false,
      });

      if (result.success) {
        return { success: true };
      } else {
        return {
          success: false,
          error: result.error === 'user_cancel' ? 'Cancelled' : 'Authentication failed',
        };
      }
    } catch (error: unknown) {
      return { success: false, error: error instanceof Error ? error.message : 'Authentication error' };
    }
  }, [isAvailable]);

  const getBiometricLabel = useCallback(() => {
    switch (biometricType) {
      case 'facial':
        return 'Face ID';
      case 'fingerprint':
        return 'Touch ID';
      case 'iris':
        return 'Iris';
      default:
        return 'Biometric';
    }
  }, [biometricType]);

  return {
    isAvailable,
    biometricType,
    authenticate,
    getBiometricLabel,
  };
}
