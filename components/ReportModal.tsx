/**
 * ReportModal — single sheet shared by chat-message reporting and cast
 * reporting. Caller passes the input (already shaped for either flavor)
 * and the modal handles reason/free-text capture + submission.
 */

import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import type { AppTheme } from '@/theme';
import { useTheme } from '@/theme';
import { useAuth } from '@/context/AuthContext';
import { submitReport, type ReportReason } from '@/services/reporting/reportService';

const REASONS: { id: ReportReason; label: string }[] = [
  { id: 'spam', label: 'Spam' },
  { id: 'harassment', label: 'Harassment' },
  { id: 'illegal', label: 'Illegal content' },
  { id: 'other', label: 'Other' },
];

type CastTarget = {
  type: 'cast';
  castHash: string;
  castAuthorFid?: number;
};

type MessageTarget = {
  type: 'message';
  plaintext: string;
  spaceId?: string;
  channelId?: string;
  conversationId?: string;
  messageId: string;
  senderAddress?: string;
};

interface ReportModalProps {
  visible: boolean;
  onClose: () => void;
  target: CastTarget | MessageTarget | null;
  onSubmitted?: () => void;
}

export function ReportModal({ visible, onClose, target, onSubmitted }: ReportModalProps) {
  const { theme } = useTheme();
  const { user } = useAuth();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [freeText, setFreeText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const styles = createStyles(theme);

  const handleClose = () => {
    if (submitting) return;
    setReason(null);
    setFreeText('');
    onClose();
  };

  const handleSubmit = async () => {
    if (!target || !reason || !user?.address) return;
    setSubmitting(true);
    try {
      if (target.type === 'cast') {
        await submitReport({
          type: 'cast',
          castHash: target.castHash,
          castAuthorFid: target.castAuthorFid,
          reason,
          freeText,
          reporterAddress: user.address,
        });
      } else {
        await submitReport({
          type: 'message',
          plaintext: target.plaintext,
          messageId: target.messageId,
          spaceId: target.spaceId,
          channelId: target.channelId,
          conversationId: target.conversationId,
          senderAddress: target.senderAddress,
          reason,
          freeText,
          reporterAddress: user.address,
        });
      }
      Alert.alert('Report submitted', 'Thanks — our team will review it.');
      setReason(null);
      setFreeText('');
      onSubmitted?.();
      onClose();
    } catch (e) {
      Alert.alert(
        'Could not submit report',
        e instanceof Error ? e.message : 'Unknown error',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const headerLabel =
    target?.type === 'cast' ? 'Report cast' : target?.type === 'message' ? 'Report message' : 'Report';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <Pressable style={styles.backdrop} onPress={handleClose}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.kbWrap}
        >
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.title}>{headerLabel}</Text>
            <Text style={styles.subtitle}>
              Pick a reason and add detail if you'd like. Reports go to the
              Quorum moderation team.
            </Text>

            <View style={styles.reasons}>
              {REASONS.map((r) => {
                const selected = reason === r.id;
                return (
                  <TouchableOpacity
                    key={r.id}
                    onPress={() => setReason(r.id)}
                    style={[
                      styles.reasonRow,
                      selected && { backgroundColor: theme.colors.surface3, borderColor: theme.colors.primary },
                    ]}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.reasonLabel, selected && { color: theme.colors.primary }]}>
                      {r.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TextInput
              style={styles.input}
              value={freeText}
              onChangeText={setFreeText}
              placeholder="Add detail (optional)"
              placeholderTextColor={theme.colors.textMuted}
              multiline
              maxLength={2000}
              editable={!submitting}
            />

            <View style={styles.actions}>
              <TouchableOpacity
                onPress={handleClose}
                style={[styles.button, styles.secondary]}
                disabled={submitting}
              >
                <Text style={[styles.buttonLabel, { color: theme.colors.textMain }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSubmit}
                disabled={!reason || submitting}
                style={[
                  styles.button,
                  styles.primary,
                  { backgroundColor: theme.colors.primary, opacity: !reason || submitting ? 0.5 : 1 },
                ]}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={[styles.buttonLabel, { color: '#fff' }]}>Submit report</Text>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
    },
    kbWrap: {
      width: '100%',
    },
    sheet: {
      backgroundColor: theme.colors.surface1,
      paddingHorizontal: 20,
      paddingTop: 24,
      paddingBottom: 36,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      gap: 12,
    },
    title: {
      fontSize: 18,
      fontWeight: '600',
      color: theme.colors.textMain,
    },
    subtitle: {
      fontSize: 13,
      color: theme.colors.textMuted,
      lineHeight: 18,
    },
    reasons: {
      gap: 8,
    },
    reasonRow: {
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.colors.surface3,
      backgroundColor: theme.colors.surface2,
    },
    reasonLabel: {
      fontSize: 15,
      color: theme.colors.textMain,
    },
    input: {
      borderWidth: 1,
      borderColor: theme.colors.surface3,
      borderRadius: 10,
      padding: 12,
      minHeight: 80,
      maxHeight: 160,
      color: theme.colors.textMain,
      backgroundColor: theme.colors.surface2,
      textAlignVertical: 'top',
    },
    actions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 12,
      marginTop: 4,
    },
    button: {
      paddingVertical: 12,
      paddingHorizontal: 20,
      borderRadius: 10,
      minWidth: 120,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primary: {},
    secondary: {
      backgroundColor: theme.colors.surface3,
    },
    buttonLabel: {
      fontSize: 15,
      fontWeight: '600',
    },
  });

export default ReportModal;
