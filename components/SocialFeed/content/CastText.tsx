import React from 'react';
import { Text, TextStyle } from 'react-native';

interface CastTextProps {
  text: string;
  style?: TextStyle;
  theme: any;
  onMentionPress?: (username: string) => void;
  onChannelPress?: (channelKey: string) => void;
  onLinkPress?: (url: string) => void;
}

type TextPart = {
  type: 'text' | 'mention' | 'channel' | 'link';
  value: string;
};

/**
 * Renders cast text with tappable @mentions, /channels, and links.
 */
export function CastText({
  text,
  style,
  theme,
  onMentionPress,
  onChannelPress,
  onLinkPress,
}: CastTextProps) {
  // Match URLs, @mentions (after whitespace/start), and /channels (after whitespace/start)
  // URLs are matched first to prevent their paths being parsed as channels
  const combinedRegex = /(https?:\/\/[^\s]+)|(?<=^|[\s])(@[a-zA-Z0-9._-]+)|(?<=^|[\s])(\/[a-zA-Z0-9_-]+)/g;
  const parts: TextPart[] = [];
  let lastIndex = 0;
  let match;

  while ((match = combinedRegex.exec(text)) !== null) {
    // Add text before this match
    if (match.index > lastIndex) {
      parts.push({ type: 'text', value: text.slice(lastIndex, match.index) });
    }

    // Add the match itself
    if (match[1]) {
      // URL
      parts.push({ type: 'link', value: match[1] });
    } else if (match[2]) {
      // @mention
      parts.push({ type: 'mention', value: match[2].slice(1) }); // Remove @ prefix
    } else if (match[3]) {
      // /channel
      parts.push({ type: 'channel', value: match[3].slice(1) }); // Remove / prefix
    }

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push({ type: 'text', value: text.slice(lastIndex) });
  }

  return (
    <Text style={style}>
      {parts.map((part, index) => {
        if (part.type === 'link') {
          return (
            <Text
              key={index}
              style={{ color: theme.colors.accent }}
              onPress={() => onLinkPress?.(part.value)}
            >
              {part.value}
            </Text>
          );
        } else if (part.type === 'mention') {
          return (
            <Text
              key={index}
              style={{ color: theme.colors.accent }}
              onPress={() => onMentionPress?.(part.value)}
            >
              @{part.value}
            </Text>
          );
        } else if (part.type === 'channel') {
          return (
            <Text
              key={index}
              style={{ color: theme.colors.accent }}
              onPress={() => onChannelPress?.(part.value)}
            >
              /{part.value}
            </Text>
          );
        }
        return <Text key={index}>{part.value}</Text>;
      })}
    </Text>
  );
}

export default CastText;
