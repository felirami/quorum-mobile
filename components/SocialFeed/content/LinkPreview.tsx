import React from 'react';
import { Image, Text, TouchableOpacity, View } from 'react-native';

interface LinkPreviewProps {
  url?: string;
  title?: string;
  description?: string;
  domain?: string;
  image?: string;
  useLargeImage?: boolean;
  theme: any;
  onPress?: () => void;
}

/**
 * URL preview card with optional image.
 */
export function LinkPreview({
  url,
  title,
  description,
  domain,
  image,
  useLargeImage,
  theme,
  onPress,
}: LinkPreviewProps) {
  if (!title) return null;

  const handlePress = () => {
    onPress?.();
  };

  if (useLargeImage && image) {
    return (
      <TouchableOpacity
        style={{
          backgroundColor: theme.colors.surface2,
          borderRadius: 12,
          overflow: 'hidden',
          marginHorizontal: 12,
        }}
        onPress={handlePress}
        activeOpacity={0.8}
      >
        <Image
          source={{ uri: image }}
          style={{
            width: '100%',
            height: 180,
            backgroundColor: theme.colors.surface3,
          }}
          resizeMode="cover"
        />
        <View style={{ padding: 12 }}>
          <Text
            style={{
              color: theme.colors.textStrong,
              fontSize: 15,
              fontWeight: '600',
              marginBottom: 4,
            }}
            numberOfLines={2}
          >
            {title}
          </Text>
          {description && (
            <Text
              style={{
                color: theme.colors.textMuted,
                fontSize: 13,
                lineHeight: 18,
                marginBottom: 4,
              }}
              numberOfLines={2}
            >
              {description}
            </Text>
          )}
          {domain && (
            <Text style={{ color: theme.colors.textMuted, fontSize: 12 }}>
              {domain}
            </Text>
          )}
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={{
        backgroundColor: theme.colors.surface2,
        borderRadius: 12,
        overflow: 'hidden',
        marginHorizontal: 12,
        flexDirection: 'row',
      }}
      onPress={handlePress}
      activeOpacity={0.8}
    >
      {image && (
        <Image
          source={{ uri: image }}
          style={{
            width: 100,
            height: 100,
            backgroundColor: theme.colors.surface3,
          }}
          resizeMode="cover"
        />
      )}
      <View style={{ flex: 1, padding: 12, justifyContent: 'center' }}>
        <Text
          style={{
            color: theme.colors.textStrong,
            fontSize: 14,
            fontWeight: '600',
            marginBottom: 4,
          }}
          numberOfLines={2}
        >
          {title}
        </Text>
        {description && (
          <Text
            style={{
              color: theme.colors.textMuted,
              fontSize: 12,
              lineHeight: 16,
              marginBottom: 4,
            }}
            numberOfLines={2}
          >
            {description}
          </Text>
        )}
        {domain && (
          <Text style={{ color: theme.colors.textMuted, fontSize: 11 }}>
            {domain}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

export default LinkPreview;
