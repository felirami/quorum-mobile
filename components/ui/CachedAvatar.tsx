/**
 * CachedAvatar - Drop-in replacement for Image when displaying profile pictures
 * Uses expo-image with disk caching to avoid reloading on every feed view
 */

import React from 'react';
import { Image, ImageStyle } from 'expo-image';
import { StyleProp, ImageSourcePropType } from 'react-native';

interface CachedAvatarProps {
  source: ImageSourcePropType | { uri: string } | null | undefined;
  style?: StyleProp<ImageStyle>;
  fallback?: ImageSourcePropType;
}

// Default fallback avatar
const DEFAULT_FALLBACK = require('@/assets/images/quorum-symbol-bg-blue.png');

/**
 * CachedAvatar uses expo-image with disk caching for profile pictures.
 * This prevents reloading avatars every time the feed is viewed.
 */
export function CachedAvatar({ source, style, fallback = DEFAULT_FALLBACK }: CachedAvatarProps) {
  // Handle null/undefined source or empty uri
  const hasValidSource = source &&
    (typeof source === 'number' || // require() returns number
     (typeof source === 'object' && 'uri' in source && source.uri));

  return (
    <Image
      source={hasValidSource ? source : fallback}
      style={style}
      cachePolicy="disk"
      transition={100}
      contentFit="cover"
    />
  );
}

export default CachedAvatar;
