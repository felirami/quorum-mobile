import type { AppTheme } from '@/theme';
import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { IconSymbol } from '@/components/ui/IconSymbol';
import { LikeIcon, getLikeIconType } from './LikeIcon';

interface CastActionsProps {
  castHash: string;
  castText: string;
  likeCount: number;
  replyCount: number;
  recastCount: number;
  isLiked: boolean;
  isRecast: boolean;
  theme: AppTheme;
  likeStates: Map<string, { liked: boolean; count: number }>;
  onLikeToggle: (castHash: string, currentlyLiked: boolean, currentCount: number) => void;
  onReplyPress?: () => void;
}

/**
 * Like, reply, and recast action buttons for a cast.
 */
export const CastActions = React.memo(function CastActions({
  castHash,
  castText,
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

  // Determine the like icon type based on cast text
  const likeIconType = useMemo(() => getLikeIconType(castText), [castText]);

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.actionButton}
        onPress={() => onLikeToggle(castHash, liked, count)}
      >
        <LikeIcon
          type={likeIconType}
          isLiked={liked}
          color={theme.colors.textMuted}
          activeColor={theme.colors.danger}
          size={16}
        />
        {count > 0 && (
          <Text style={[styles.countText, { color: theme.colors.textMuted }]}>
            {count}
          </Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.actionButton}
        onPress={onReplyPress}
      >
        <IconSymbol name="bubble.left" color={theme.colors.textMuted} size={16} />
        {replyCount > 0 && (
          <Text style={[styles.countText, { color: theme.colors.textMuted }]}>
            {replyCount}
          </Text>
        )}
      </TouchableOpacity>

      <View style={styles.actionButton}>
        <IconSymbol
          name={isRecast ? 'arrowshape.turn.up.right.fill' : 'arrowshape.turn.up.right'}
          color={isRecast ? theme.colors.success : theme.colors.textMuted}
          size={16}
        />
        {recastCount > 0 && (
          <Text style={[styles.countText, { color: theme.colors.textMuted }]}>
            {recastCount}
          </Text>
        )}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 4,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  countText: {
    fontSize: 13,
  },
});

export default CastActions;
