import React, { useEffect, useState } from 'react';
import { Image, ImageStyle, TouchableOpacity, StyleProp } from 'react-native';
import { SCREEN_WIDTH, imageDimensionCache } from '../utils';

interface AutoHeightImageProps {
  uri: string;
  maxHeight: number;
  maxWidth?: number;
  style?: StyleProp<ImageStyle>;
  onPress?: () => void;
}

/**
 * Image component that automatically calculates height based on aspect ratio.
 * Uses cached dimensions to prevent layout shifts during scroll.
 */
export function AutoHeightImage({
  uri,
  maxHeight,
  maxWidth = SCREEN_WIDTH,
  style,
  onPress,
}: AutoHeightImageProps) {
  const cacheKey = `${uri}:${maxWidth}`;
  const cachedDimensions = imageDimensionCache.get(cacheKey);
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>({
    width: maxWidth,
    height: cachedDimensions ?? 250,
  });

  useEffect(() => {
    // Skip if already cached
    if (imageDimensionCache.has(cacheKey)) {
      const cachedHeight = imageDimensionCache.get(cacheKey)!;
      setDimensions({ width: maxWidth, height: cachedHeight });
      return;
    }

    Image.getSize(
      uri,
      (imgWidth, imgHeight) => {
        const aspectRatio = imgHeight / imgWidth;
        const calculatedHeight = Math.min(maxWidth * aspectRatio, maxHeight);
        imageDimensionCache.set(cacheKey, calculatedHeight);
        setDimensions({ width: maxWidth, height: calculatedHeight });
      },
      () => {
        imageDimensionCache.set(cacheKey, 250);
        setDimensions({ width: maxWidth, height: 250 }); // fallback
      }
    );
  }, [uri, maxHeight, maxWidth, cacheKey]);

  const imageElement = (
    <Image
      source={{ uri }}
      style={[style, { width: dimensions.width, height: dimensions.height }]}
      resizeMode="cover"
    />
  );

  if (onPress) {
    return (
      <TouchableOpacity activeOpacity={0.9} onPress={onPress}>
        {imageElement}
      </TouchableOpacity>
    );
  }

  return imageElement;
}

export default AutoHeightImage;
