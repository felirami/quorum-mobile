import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme';
import { useCall } from '@/context';
import { DefaultAvatar } from '@/components/ui/DefaultAvatar';
import { IconSymbol } from '@/components/ui/IconSymbol';

export function IncomingCallScreen() {
  const { incomingCall, acceptCall, rejectCall } = useCall();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  const pulseScale = useSharedValue(1);
  React.useEffect(() => {
    pulseScale.value = withRepeat(withTiming(1.15, { duration: 800 }), -1, true);
  }, [pulseScale]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }));

  if (!incomingCall) return null;

  return (
    <View style={[styles.container, { paddingTop: insets.top + 60, backgroundColor: theme.colors.background }]}>
      <View style={styles.callerInfo}>
        <DefaultAvatar address={incomingCall.callerAddress} size={96} />
        <Text style={[styles.callerName, { color: theme.colors.text }]}>
          {incomingCall.callerDisplayName}
        </Text>
        <Text style={[styles.callType, { color: theme.colors.textMuted }]}>
          Incoming {incomingCall.mediaType} call
        </Text>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: '#ff3b30' }]}
          onPress={() => rejectCall(incomingCall.callId)}
        >
          <IconSymbol name="phone.down" color="#fff" size={28} />
        </TouchableOpacity>

        <Animated.View style={pulseStyle}>
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: '#34c759' }]}
            onPress={() => acceptCall(incomingCall.callId)}
          >
            <IconSymbol name="phone" color="#fff" size={28} />
          </TouchableOpacity>
        </Animated.View>
      </View>
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
    gap: 12,
  },
  callerName: {
    fontSize: 28,
    fontWeight: '600',
    marginTop: 16,
  },
  callType: {
    fontSize: 17,
  },
  actions: {
    flexDirection: 'row',
    gap: 60,
    alignItems: 'center',
  },
  actionButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
