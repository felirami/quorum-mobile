import React, { useCallback, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { AutoHeightImage } from './AutoHeightImage';
import { SCREEN_WIDTH } from '../utils';

interface ImageCarouselProps {
  urls: string[];
  maxHeight: number;
  theme: any;
  onImagePress?: (url: string) => void;
}

/**
 * Horizontal scrollable image carousel with pagination dots.
 */
export function ImageCarousel({
  urls,
  maxHeight,
  theme,
  onImagePress,
}: ImageCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);

  const handleScroll = useCallback((event: any) => {
    const contentOffsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(contentOffsetX / SCREEN_WIDTH);
    setActiveIndex(index);
  }, []);

  return (
    <View>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
        {urls.map((url, index) => (
          <AutoHeightImage
            key={index}
            uri={url}
            maxHeight={maxHeight}
            style={{ backgroundColor: theme.colors.surface3 }}
            onPress={onImagePress ? () => onImagePress(url) : undefined}
          />
        ))}
      </ScrollView>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'center',
          alignItems: 'center',
          paddingVertical: 12,
          gap: 6,
        }}
      >
        {urls.map((_, index) => (
          <View
            key={index}
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor:
                index === activeIndex
                  ? theme.colors.textMain
                  : theme.colors.surface4,
            }}
          />
        ))}
      </View>
    </View>
  );
}

export default ImageCarousel;
