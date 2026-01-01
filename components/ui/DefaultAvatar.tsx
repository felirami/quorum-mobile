/**
 * DefaultAvatar - Deterministic avatar based on address hash
 * No external API calls - generates colors locally
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface DefaultAvatarProps {
  address: string;
  size: number;
  style?: any;
}

// Generate a deterministic color from a string
function hashToColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
    hash = hash & hash;
  }

  // Generate HSL color with good saturation and lightness for visibility
  const h = Math.abs(hash % 360);
  const s = 65 + (Math.abs((hash >> 8) % 20)); // 65-85%
  const l = 45 + (Math.abs((hash >> 16) % 15)); // 45-60%

  return `hsl(${h}, ${s}%, ${l}%)`;
}

// Get initials from address
function getInitials(address: string): string {
  if (!address) return '?';

  // Username format (@user)
  if (address.startsWith('@')) {
    return address.slice(1, 3).toUpperCase();
  }

  // Base58 address - use first 2 chars
  return address.slice(0, 2).toUpperCase();
}

export function DefaultAvatar({ address, size, style }: DefaultAvatarProps) {
  const backgroundColor = useMemo(() => hashToColor(address || ''), [address]);
  const initials = useMemo(() => getInitials(address || ''), [address]);
  const fontSize = size * 0.4;

  return (
    <View
      style={[
        styles.container,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor,
        },
        style,
      ]}
    >
      <Text style={[styles.initials, { fontSize }]}>{initials}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    color: '#ffffff',
    fontWeight: '600',
  },
});

export default DefaultAvatar;
