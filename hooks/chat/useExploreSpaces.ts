/**
 * useExploreSpaces - Hook for browsing the space directory
 */

import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getQuorumClient } from '@/services/api/quorumClient';
import type { DirectoryEntry } from '@/services/api/quorumClient';

const PAGE_SIZE = 20;
const DEBOUNCE_MS = 300;

export type SpaceCategory = 'community' | 'gaming' | 'tech' | 'crypto' | 'social' | 'education' | 'other';

export const SPACE_CATEGORIES: { label: string; value: SpaceCategory | null }[] = [
  { label: 'All', value: null },
  { label: 'Community', value: 'community' },
  { label: 'Gaming', value: 'gaming' },
  { label: 'Tech', value: 'tech' },
  { label: 'Crypto', value: 'crypto' },
  { label: 'Social', value: 'social' },
  { label: 'Education', value: 'education' },
  { label: 'Other', value: 'other' },
];

export function useExploreSpaces() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [category, setCategory] = useState<SpaceCategory | null>(null);
  const [offset, setOffset] = useState(0);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setOffset(0); // Reset pagination on new search
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  // Reset pagination on category change
  useEffect(() => {
    setOffset(0);
  }, [category]);

  const queryKey = useMemo(
    () => ['exploreSpaces', debouncedSearch, category, offset],
    [debouncedSearch, category, offset]
  );

  const { data, isLoading, error, refetch } = useQuery({
    queryKey,
    queryFn: async () => {
      const client = getQuorumClient();
      return client.exploreSpaces({
        search: debouncedSearch || undefined,
        category: category || undefined,
        offset,
        limit: PAGE_SIZE,
      });
    },
    staleTime: 60000,
  });

  const loadMore = () => {
    if (data?.has_more) {
      setOffset((prev) => prev + PAGE_SIZE);
    }
  };

  return {
    entries: data?.entries ?? [],
    total: data?.total ?? 0,
    hasMore: data?.has_more ?? false,
    isLoading,
    error,
    search,
    setSearch,
    category,
    setCategory,
    loadMore,
    refetch,
    offset,
  };
}
