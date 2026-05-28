/**
 * FarcasterReimportSheet — focused recovery UI used when the device's
 * SecureStore is missing the Farcaster custody/signer keys but the
 * user object (MMKV) still claims a Farcaster account. The user pastes
 * their Farcaster recovery phrase; we derive the keys, confirm the
 * lookup matches a real FID, and persist the keys back to SecureStore.
 *
 * This is a separate flow from the main onboarding/farcaster-setup
 * screen because that one is coupled to OnboardingContext and assumes
 * we're walking the user through the full onboarding state machine.
 * Here we just want to top up the keychain.
 */

import React, { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTheme } from '@/theme';
import {
  deriveFarcasterKeys,
  lookupFarcasterAccount,
  validateFarcasterMnemonic,
} from '@/services/onboarding/farcasterService';
import {
  storeFarcasterAuthToken,
  storeFarcasterCustodyKey,
  storeFarcasterFid,
  storeFarcasterSignerKey,
} from '@/services/onboarding/secureStorage';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Called after we successfully store keys so the parent can refresh
   *  its token state. */
  onImported: () => void;
}

export default function FarcasterReimportSheet({ visible, onClose, onImported }: Props) {
  const { theme } = useTheme();
  const [mnemonic, setMnemonic] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleImport = async () => {
    const words = mnemonic.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length !== 12 && words.length !== 24) {
      setError('Recovery phrase must be 12 or 24 words.');
      return;
    }
    if (!validateFarcasterMnemonic(words)) {
      setError('That doesn’t look like a valid recovery phrase.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const keys = deriveFarcasterKeys(words);
      const account = await lookupFarcasterAccount(
        keys.custodyAddress,
        keys.custodyPrivateKey,
      );
      if (!account?.fid) {
        setError(
          'No Farcaster account was found for that recovery phrase. Double-check you used the Farcaster phrase (not your Quorum one).',
        );
        return;
      }
      const writes = [
        storeFarcasterCustodyKey(keys.custodyPrivateKey),
        storeFarcasterSignerKey(keys.signerPrivateKey),
        storeFarcasterFid(account.fid),
      ];
      if (account.authToken) writes.push(storeFarcasterAuthToken(account.authToken));
      await Promise.all(writes);
      setMnemonic('');
      onImported();
      onClose();
    } catch (e) {
      setError(`Couldn’t import: ${(e as Error)?.message ?? 'unknown error'}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={[styles.backdrop, { backgroundColor: 'rgba(0,0,0,0.45)' }]}>
        <View style={[styles.card, { backgroundColor: theme.colors.surface1 }]}>
          <Text style={[styles.title, { color: theme.colors.textStrong }]}>
            Re-import Farcaster
          </Text>
          <Text style={[styles.body, { color: theme.colors.textMuted }]}>
            Paste your Farcaster recovery phrase. We derive the signing keys
            locally and store them in this device&apos;s keychain.
          </Text>
          <TextInput
            value={mnemonic}
            onChangeText={(t) => {
              setMnemonic(t);
              if (error) setError(null);
            }}
            placeholder="12 or 24 words separated by spaces"
            placeholderTextColor={theme.colors.textMuted}
            multiline
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            style={[
              styles.input,
              {
                color: theme.colors.textMain,
                backgroundColor: theme.colors.surface2,
                borderColor: theme.colors.border,
              },
            ]}
          />
          {error ? (
            <Text style={[styles.error, { color: theme.colors.error ?? '#FF3B30' }]}>
              {error}
            </Text>
          ) : null}
          <View style={styles.actionRow}>
            <TouchableOpacity
              onPress={onClose}
              disabled={busy}
              style={[styles.action, { borderColor: theme.colors.border }]}
            >
              <Text style={[styles.actionText, { color: theme.colors.textMain }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => void handleImport()}
              disabled={busy}
              style={[
                styles.action,
                {
                  backgroundColor: theme.colors.primary,
                  opacity: busy ? 0.6 : 1,
                },
              ]}
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={[styles.actionText, { color: '#fff' }]}>Import</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  card: {
    padding: 20,
    paddingBottom: 32,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    gap: 12,
  },
  title: { fontSize: 18, fontWeight: '600' },
  body: { fontSize: 14, lineHeight: 20 },
  input: {
    minHeight: 100,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    textAlignVertical: 'top',
  },
  error: { fontSize: 13 },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  action: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'transparent',
    alignItems: 'center',
  },
  actionText: { fontSize: 15, fontWeight: '600' },
});
