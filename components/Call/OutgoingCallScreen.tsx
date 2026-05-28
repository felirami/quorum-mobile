import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme';
import { useCall } from '@/context';
import { DefaultAvatar } from '@/components/ui/DefaultAvatar';
import { IconSymbol } from '@/components/ui/IconSymbol';

export function OutgoingCallScreen() {
  const { activeCall, hangup, toggleMute, toggleSpeaker } = useCall();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  const dotOpacity = useSharedValue(0.3);
  React.useEffect(() => {
    dotOpacity.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 600 }),
        withTiming(0.3, { duration: 600 }),
      ),
      -1,
    );
  }, [dotOpacity]);

  const dotStyle = useAnimatedStyle(() => ({ opacity: dotOpacity.value }));

  if (!activeCall) return null;

  return (
    <View style={[styles.container, { paddingTop: insets.top + 60, backgroundColor: theme.colors.background }]}>
      <View style={styles.callerInfo}>
        <DefaultAvatar address={activeCall.recipientAddress} size={96} />
        <Text style={[styles.callerName, { color: theme.colors.text }]}>
          {activeCall.recipientDisplayName}
        </Text>
        <Animated.Text style={[styles.statusText, { color: theme.colors.textMuted }, dotStyle]}>
          {activeCall.state === 'offering' ? 'Connecting...' : 'Ringing...'}
        </Animated.Text>
      </View>

      <View style={styles.controls}>
        <TouchableOpacity
          style={[styles.controlButton, activeCall.isMuted && { backgroundColor: theme.colors.surface3 }]}
          onPress={toggleMute}
        >
          <IconSymbol
            name={activeCall.isMuted ? 'mic.slash' : 'mic'}
            color={theme.colors.textMuted}
            size={22}
          />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.controlButton, activeCall.isSpeakerOn && { backgroundColor: theme.colors.surface3 }]}
          onPress={toggleSpeaker}
        >
          <IconSymbol name="speaker.wave.2" color={theme.colors.textMuted} size={22} />
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={[styles.hangupButton, { backgroundColor: '#ff3b30' }]}
        onPress={hangup}
      >
        <IconSymbol name="phone.down" color="#fff" size={28} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 80,
  },
  callerInfo: {
    alignItems: 'center',
    gap: 8,
  },
  callerName: {
    fontSize: 28,
    fontWeight: '600',
    marginTop: 16,
  },
  statusText: {
    fontSize: 17,
  },
  controls: {
    flexDirection: 'row',
    gap: 32,
  },
  controlButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hangupButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
