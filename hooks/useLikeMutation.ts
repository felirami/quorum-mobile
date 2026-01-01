import { useMutation, useQueryClient } from '@tanstack/react-query';
import { likeCast, unlikeCast } from '@/services/farcasterClient';
import { queryKeys } from '@/services/api';

interface LikeMutationVariables {
  castHash: string;
  action: 'like' | 'unlike';
}

interface LikeMutationContext {
  previousData: unknown;
}

/**
 * Mutation hook for liking/unliking casts with optimistic updates.
 * Automatically updates the feed cache and reverts on failure.
 */
export function useLikeMutation(token: string) {
  const queryClient = useQueryClient();

  return useMutation<void, Error, LikeMutationVariables, LikeMutationContext>({
    mutationFn: async ({ castHash, action }) => {
      if (action === 'like') {
        await likeCast({ token, castHash });
      } else {
        await unlikeCast({ token, castHash });
      }
    },

    onMutate: async ({ castHash, action }) => {
      // Cancel any outgoing refetches to avoid overwriting optimistic update
      await queryClient.cancelQueries({ queryKey: queryKeys.farcaster.feed(token) });

      // Snapshot the previous value
      const previousData = queryClient.getQueryData(queryKeys.farcaster.feed(token));

      // Optimistically update the cache
      queryClient.setQueryData(queryKeys.farcaster.feed(token), (old: any) => {
        if (!old?.pages) return old;

        return {
          ...old,
          pages: old.pages.map((page: any) => ({
            ...page,
            items: page.items?.map((item: any) => {
              if (item.cast?.hash === castHash) {
                const currentCount = item.cast.reactions?.count ?? 0;
                const newCount = action === 'like' ? currentCount + 1 : Math.max(0, currentCount - 1);
                return {
                  ...item,
                  cast: {
                    ...item.cast,
                    reactions: {
                      ...item.cast.reactions,
                      count: newCount,
                    },
                    viewerContext: {
                      ...item.cast.viewerContext,
                      reacted: action === 'like',
                    },
                  },
                };
              }
              return item;
            }),
          })),
        };
      });

      return { previousData };
    },

    onError: (_err, _variables, context) => {
      // Revert to previous state on error
      if (context?.previousData) {
        queryClient.setQueryData(queryKeys.farcaster.feed(token), context.previousData);
      }
    },

    onSettled: () => {
      // Always refetch after mutation to ensure sync with server
      queryClient.invalidateQueries({ queryKey: queryKeys.farcaster.feed(token) });
    },
  });
}

export default useLikeMutation;
