import React from 'react';
import { Image, Text, TouchableOpacity, View } from 'react-native';
import { IconSymbol } from '@/components/ui/IconSymbol';
import { SCREEN_WIDTH } from '../utils';

interface FrameEmbedProps {
  imageUrl: string;
  buttonTitle: string;
  actionUrl: string;
  theme: any;
  onPress: () => void;
}

/**
 * Farcaster Frame (mini-app) embed display.
 */
export function FrameEmbed({
  imageUrl,
  buttonTitle,
  actionUrl,
  theme,
  onPress,
}: FrameEmbedProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.9}
      style={{ overflow: 'hidden' }}
    >
      <Image
        source={{ uri: imageUrl }}
        style={{
          width: SCREEN_WIDTH,
          height: SCREEN_WIDTH * 0.525, // Standard frame aspect ratio
          backgroundColor: theme.colors.surface3,
        }}
        resizeMode="cover"
      />
      <View
        style={{
          backgroundColor: theme.colors.surface2,
          paddingVertical: 12,
          paddingHorizontal: 16,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          borderTopWidth: 1,
          borderTopColor: theme.colors.surface3,
        }}
      >
        <Text
          style={{
            color: theme.colors.textStrong,
            fontSize: 15,
            fontWeight: '600',
          }}
        >
          {buttonTitle}
        </Text>
        <IconSymbol
          name="arrow.up.right"
          color={theme.colors.textMuted}
          size={14}
          style={{ marginLeft: 6 }}
        />
      </View>
    </TouchableOpacity>
  );
}

export default FrameEmbed;
