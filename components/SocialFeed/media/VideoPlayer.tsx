import { logger } from '@quilibrium/quorum-shared';
import React, { useRef, useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { Audio, ResizeMode, Video } from 'expo-av';
import { IconSymbol } from '@/components/ui/IconSymbol';
import { SCREEN_WIDTH, SCREEN_HEIGHT, formatDuration } from '../utils';

// Configure audio to play even when silent switch is on
let audioModeConfigured = false;
async function ensureAudioMode() {
  if (audioModeConfigured) return;
  try {
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
    });
    audioModeConfigured = true;
  } catch (e) {
    logger.warn('[VideoPlayer] Failed to set audio mode:', e);
  }
}

interface VideoPlayerProps {
  url: string;
  thumbnailUrl: string;
  width?: number;
  height?: number;
  duration?: number;
  theme: any;
}

/**
 * Video player with thumbnail preview and tap to play/pause.
 */
export function VideoPlayer({
  url,
  thumbnailUrl,
  width,
  height,
  duration,
  theme,
}: VideoPlayerProps) {
  const videoRef = useRef<Video>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const aspectRatio = width && height ? height / width : 9 / 16;
  const calculatedHeight = Math.min(SCREEN_WIDTH * aspectRatio, SCREEN_HEIGHT * 0.8);

  const handleTap = async () => {
    if (!hasStarted) {
      // First tap - start playing
      await ensureAudioMode();
      setHasStarted(true);
      setIsPlaying(true);
      await videoRef.current?.playAsync();
    } else if (isPlaying) {
      // Tap while playing - pause
      await videoRef.current?.pauseAsync();
      setIsPlaying(false);
    } else {
      // Tap while paused - resume
      await videoRef.current?.playAsync();
      setIsPlaying(true);
    }
  };

  return (
    <Pressable onPress={handleTap} style={{ position: 'relative' }}>
      {!hasStarted ? (
        <>
          <Image
            source={{ uri: thumbnailUrl }}
            style={{
              width: SCREEN_WIDTH,
              height: calculatedHeight,
              backgroundColor: theme.colors.surface3,
            }}
            resizeMode="cover"
          />
          {/* Play button overlay */}
          <View
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              justifyContent: 'center',
              alignItems: 'center',
            }}
            pointerEvents="none"
          >
            <View
              style={{
                width: 60,
                height: 60,
                borderRadius: 30,
                backgroundColor: 'rgba(0, 0, 0, 0.6)',
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <IconSymbol name="play.fill" color="#fff" size={28} />
            </View>
          </View>
          {/* Duration badge */}
          {duration && duration > 0 && (
            <View
              style={{
                position: 'absolute',
                bottom: 8,
                right: 8,
                backgroundColor: 'rgba(0, 0, 0, 0.7)',
                paddingHorizontal: 6,
                paddingVertical: 2,
                borderRadius: 4,
              }}
            >
              <Text style={{ color: '#fff', fontSize: 12, fontWeight: '500' }}>
                {formatDuration(duration)}
              </Text>
            </View>
          )}
        </>
      ) : (
        <>
          <Video
            ref={videoRef}
            source={{ uri: url }}
            style={{
              width: SCREEN_WIDTH,
              height: calculatedHeight,
              backgroundColor: theme.colors.surface3,
            }}
            resizeMode={ResizeMode.CONTAIN}
            shouldPlay={true}
            isLooping={false}
            useNativeControls={false}
            onPlaybackStatusUpdate={(status) => {
              if (status.isLoaded && status.didJustFinish) {
                setIsPlaying(false);
                setHasStarted(false);
                videoRef.current?.setPositionAsync(0);
              }
            }}
          />
          {/* Pause indicator overlay - shown when paused */}
          {!isPlaying && (
            <View
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                justifyContent: 'center',
                alignItems: 'center',
              }}
              pointerEvents="none"
            >
              <View
                style={{
                  width: 60,
                  height: 60,
                  borderRadius: 30,
                  backgroundColor: 'rgba(0, 0, 0, 0.6)',
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
              >
                <IconSymbol name="play.fill" color="#fff" size={28} />
              </View>
            </View>
          )}
        </>
      )}
    </Pressable>
  );
}

export default VideoPlayer;
