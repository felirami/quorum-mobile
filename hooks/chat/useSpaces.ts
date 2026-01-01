/**
 * useSpaces hook wrapper
 */

import { useSpaces as useSpacesBase, useSpace as useSpaceBase, useSpaceMembers as useSpaceMembersBase } from '@quilibrium/quorum-shared';
import { useStorageAdapter } from '../../context/StorageContext';

export function useSpaces(options?: { enabled?: boolean }) {
  const storage = useStorageAdapter();
  return useSpacesBase({
    storage,
    enabled: options?.enabled,
  });
}

export function useSpace(spaceId: string | undefined, options?: { enabled?: boolean }) {
  const storage = useStorageAdapter();
  return useSpaceBase({
    storage,
    spaceId,
    enabled: options?.enabled,
  });
}

export function useSpaceMembers(spaceId: string | undefined, options?: { enabled?: boolean }) {
  const storage = useStorageAdapter();
  return useSpaceMembersBase({
    storage,
    spaceId,
    enabled: options?.enabled,
  });
}
