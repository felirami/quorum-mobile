import { useMutation, useQueryClient } from '@tanstack/react-query';
import { postFarcasterCast } from '@/services/farcasterClient';
import { queryKeys } from '@/services/api';

interface PostMutationVariables {
  text: string;
  embeds?: any[];
}

/**
 * Mutation hook for posting new casts.
 * Invalidates feed cache after successful post.
 */
export function usePostMutation(token: string) {
  const queryClient = useQueryClient();

  return useMutation<void, Error, PostMutationVariables>({
    mutationFn: async ({ text, embeds }) => {
      await postFarcasterCast({
        token,
        text,
        embeds,
      });
    },

    onSuccess: () => {
      // Invalidate feed to show the new post
      queryClient.invalidateQueries({ queryKey: queryKeys.farcaster.feed(token) });
    },
  });
}

export default usePostMutation;
