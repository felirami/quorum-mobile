import React from 'react';
import { Image, Text, TouchableOpacity, View } from 'react-native';
import type { EmbeddedCast } from '@/hooks/useFarcasterFeed';

const AVATAR_FALLBACK = require('@/assets/images/quorum-symbol-bg-blue.png');

interface QuoteCastProps {
  cast: EmbeddedCast;
  theme: any;
  onPress?: () => void;
}

/**
 * Embedded/quoted cast display.
 */
export function QuoteCast({ cast, theme, onPress }: QuoteCastProps) {
  const hasImage = cast.embeds?.images && cast.embeds.images.length > 0;

  return (
    <TouchableOpacity
      style={{
        backgroundColor: theme.colors.surface2,
        borderRadius: 12,
        overflow: 'hidden',
        marginHorizontal: 12,
        borderWidth: 1,
        borderColor: theme.colors.surface3,
      }}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View style={{ padding: 12 }}>
        {/* Author row */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
          <Image
            source={
              cast.author.pfp?.url
                ? { uri: cast.author.pfp.url }
                : AVATAR_FALLBACK
            }
            style={{
              width: 24,
              height: 24,
              borderRadius: 12,
              marginRight: 8,
              backgroundColor: theme.colors.surface3,
            }}
          />
          <Text
            style={{
              color: theme.colors.textStrong,
              fontWeight: '600',
              fontSize: 14,
            }}
          >
            {cast.author.displayName}
          </Text>
          <Text
            style={{
              color: theme.colors.textMuted,
              fontSize: 13,
              marginLeft: 4,
            }}
          >
            @{cast.author.username}
          </Text>
        </View>
        {/* Cast text */}
        <Text
          style={{
            color: theme.colors.textMain,
            fontSize: 14,
            lineHeight: 20,
          }}
          numberOfLines={4}
        >
          {cast.text}
        </Text>
      </View>
      {/* Image preview */}
      {hasImage && cast.embeds?.images?.[0]?.url && (
        <Image
          source={{ uri: cast.embeds.images[0].url }}
          style={{
            width: '100%',
            height: 150,
            backgroundColor: theme.colors.surface3,
          }}
          resizeMode="cover"
        />
      )}
    </TouchableOpacity>
  );
}

export default QuoteCast;
