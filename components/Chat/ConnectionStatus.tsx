import React, { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  cancelAnimation,
} from 'react-native-reanimated';

type ConnectionState = 'connected' | 'connecting' | 'disconnected' | 'reconnecting';

interface ConnectionStatusProps {
  state: ConnectionState;
  theme: any;
  showWhenConnected?: boolean;
}

export function ConnectionStatus({
  state,
  theme,
  showWhenConnected = false,
}: ConnectionStatusProps) {
  const styles = createStyles(theme);
  const opacity = useSharedValue(1);
  const prevState = useRef(state);

  useEffect(() => {
    if (state === 'connecting' || state === 'reconnecting') {
      // Pulsing animation for connecting states
      opacity.value = withRepeat(
        withSequence(
          withTiming(0.4, { duration: 600 }),
          withTiming(1, { duration: 600 })
        ),
        -1,
        false
      );
    } else {
      cancelAnimation(opacity);
      opacity.value = 1;
    }

    prevState.current = state;
  }, [state, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  // Don't show when connected unless explicitly requested
  if (state === 'connected' && !showWhenConnected) {
    return null;
  }

  const getStatusConfig = () => {
    switch (state) {
      case 'connected':
        return {
          color: theme.colors.success ?? '#22c55e',
          text: 'Connected',
          dotColor: theme.colors.success ?? '#22c55e',
        };
      case 'connecting':
        return {
          color: theme.colors.warning ?? '#f59e0b',
          text: 'Connecting...',
          dotColor: theme.colors.warning ?? '#f59e0b',
        };
      case 'reconnecting':
        return {
          color: theme.colors.warning ?? '#f59e0b',
          text: 'Reconnecting...',
          dotColor: theme.colors.warning ?? '#f59e0b',
        };
      case 'disconnected':
        return {
          color: theme.colors.error ?? '#ef4444',
          text: 'Disconnected',
          dotColor: theme.colors.error ?? '#ef4444',
        };
    }
  };

  const config = getStatusConfig();

  return (
    <View style={styles.container}>
      <Animated.View style={animatedStyle}>
        <View style={styles.content}>
          <View style={[styles.dot, { backgroundColor: config.dotColor }]} />
          <Text style={[styles.text, { color: config.color }]}>{config.text}</Text>
        </View>
      </Animated.View>
    </View>
  );
}

const createStyles = (theme: any) =>
  StyleSheet.create({
    container: {
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    content: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    dot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      marginRight: 6,
    },
    text: {
      fontSize: 12,
      fontFamily: theme.fonts.regular.fontFamily,
    },
  });

export default ConnectionStatus;
