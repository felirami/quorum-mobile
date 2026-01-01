import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { IconSymbol } from '@/components/ui/IconSymbol';

interface CastActionsProps {
  castHash: string;
  likeCount: number;
  replyCount: number;
  recastCount: number;
  isLiked: boolean;
  isRecast: boolean;
  theme: any;
  likeStates: Map<string, { liked: boolean; count: number }>;
  onLikeToggle: (castHash: string, currentlyLiked: boolean, currentCount: number) => void;
  onReplyPress?: () => void;
}

/**
 * Like, reply, and recast action buttons for a cast.
 */
export function CastActions({
  castHash,
  likeCount,
  replyCount,
  recastCount,
  isLiked,
  isRecast,
  theme,
  likeStates,
  onLikeToggle,
  onReplyPress,
}: CastActionsProps) {
  const optimistic = likeStates.get(castHash);
  const liked = optimistic?.liked ?? isLiked;
  const count = optimistic?.count ?? likeCount;

  return (
    <View style={{ flexDirection: 'row', gap: 16, marginTop: 4 }}>
      <TouchableOpacity
        style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
        onPress={() => onLikeToggle(castHash, liked, count)}
      >
        <IconSymbol
          name={liked ? 'heart.fill' : 'heart'}
          color={liked ? theme.colors.danger : theme.colors.textMuted}
          size={16}
        />
        {count > 0 && (
          <Text style={{ color: theme.colors.textMuted, fontSize: 13 }}>
            {count}
          </Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
        onPress={onReplyPress}
      >
        <IconSymbol name="bubble.left" color={theme.colors.textMuted} size={16} />
        {replyCount > 0 && (
          <Text style={{ color: theme.colors.textMuted, fontSize: 13 }}>
            {replyCount}
          </Text>
        )}
      </TouchableOpacity>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <IconSymbol
          name={isRecast ? 'arrowshape.turn.up.right.fill' : 'arrowshape.turn.up.right'}
          color={isRecast ? theme.colors.success : theme.colors.textMuted}
          size={16}
        />
        {recastCount > 0 && (
          <Text style={{ color: theme.colors.textMuted, fontSize: 13 }}>
            {recastCount}
          </Text>
        )}
      </View>
    </View>
  );
}

export default CastActions;
