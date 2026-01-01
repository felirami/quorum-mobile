/**
 * useChannelManagement - Hooks for managing space channels
 *
 * Provides:
 * - useAddChannel: Create a new channel
 * - useUpdateChannel: Update channel properties
 * - useDeleteChannel: Delete a channel
 * - usePinChannel: Pin/unpin a channel
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getSpace, saveSpace, saveSpaceKey } from '@/services/config/spaceStorage';
import { getMMKVAdapter } from '@/services/storage/mmkvAdapter';
import { NativeCryptoProvider } from '@/services/crypto/native-provider';
import { bytesToHex } from '@quilibrium/quorum-shared';
import type { Space, Channel, Group } from '@quilibrium/quorum-shared';
import { sha256 } from '@noble/hashes/sha2';
import bs58 from 'bs58';
import * as multihashes from 'multihashes';

/**
 * Derive address from public key using multihash
 */
function deriveAddress(publicKeyBytes: Uint8Array): string {
  const hash = sha256(publicKeyBytes);
  const mhash = multihashes.encode(hash, 'sha2-256');
  return bs58.encode(mhash);
}

interface AddChannelParams {
  spaceId: string;
  groupIndex: number;
  channelName: string;
  channelTopic?: string;
  isReadOnly?: boolean;
  managerRoleIds?: string[];
  icon?: string;
  iconColor?: string;
}

/**
 * Add a new channel to a space group
 */
export function useAddChannel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: AddChannelParams): Promise<Channel> => {
      const space = getSpace(params.spaceId);
      if (!space) {
        throw new Error('Space not found');
      }

      if (params.groupIndex < 0 || params.groupIndex >= space.groups.length) {
        throw new Error('Invalid group index');
      }

      const cryptoProvider = new NativeCryptoProvider();
      const timestamp = Date.now();

      // Generate channel keypair
      const channelKeypair = await cryptoProvider.generateEd448();
      const channelAddress = deriveAddress(new Uint8Array(channelKeypair.public_key));
      const channelPublicKeyHex = bytesToHex(new Uint8Array(channelKeypair.public_key));
      const channelPrivateKeyHex = bytesToHex(new Uint8Array(channelKeypair.private_key));

      // Create new channel
      const newChannel: Channel = {
        channelId: channelAddress,
        spaceId: params.spaceId,
        channelName: params.channelName,
        channelTopic: params.channelTopic ?? '',
        createdDate: timestamp,
        modifiedDate: timestamp,
        isReadOnly: params.isReadOnly,
        managerRoleIds: params.managerRoleIds,
        icon: params.icon,
        iconColor: params.iconColor,
      };

      // Update space with new channel
      const updatedGroups = space.groups.map((group, index) => {
        if (index === params.groupIndex) {
          return {
            ...group,
            channels: [...group.channels, newChannel],
          };
        }
        return group;
      });

      const updatedSpace: Space = {
        ...space,
        groups: updatedGroups,
        modifiedDate: timestamp,
      };

      // Save channel key
      saveSpaceKey({
        spaceId: params.spaceId,
        keyId: channelAddress,
        publicKey: channelPublicKeyHex,
        privateKey: channelPrivateKeyHex,
      });

      // Save space to both storages
      saveSpace(updatedSpace);
      const adapter = getMMKVAdapter();
      await adapter.saveSpace(updatedSpace);

      return newChannel;
    },
    onSuccess: (_, params) => {
      queryClient.invalidateQueries({ queryKey: ['channels', params.spaceId] });
      queryClient.invalidateQueries({ queryKey: ['spaces'] });
    },
  });
}

interface UpdateChannelParams {
  spaceId: string;
  channelId: string;
  channelName?: string;
  channelTopic?: string;
  isReadOnly?: boolean;
  managerRoleIds?: string[];
  icon?: string;
  iconColor?: string;
}

/**
 * Update an existing channel
 */
export function useUpdateChannel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: UpdateChannelParams): Promise<Channel> => {
      const space = getSpace(params.spaceId);
      if (!space) {
        throw new Error('Space not found');
      }

      let foundChannel: Channel | undefined;
      const updatedGroups = space.groups.map(group => ({
        ...group,
        channels: group.channels.map(channel => {
          if (channel.channelId === params.channelId) {
            foundChannel = {
              ...channel,
              channelName: params.channelName ?? channel.channelName,
              channelTopic: params.channelTopic ?? channel.channelTopic,
              isReadOnly: params.isReadOnly ?? channel.isReadOnly,
              managerRoleIds: params.managerRoleIds ?? channel.managerRoleIds,
              icon: params.icon ?? channel.icon,
              iconColor: params.iconColor ?? channel.iconColor,
              modifiedDate: Date.now(),
            };
            return foundChannel;
          }
          return channel;
        }),
      }));

      if (!foundChannel) {
        throw new Error('Channel not found');
      }

      const updatedSpace: Space = {
        ...space,
        groups: updatedGroups,
        modifiedDate: Date.now(),
      };

      saveSpace(updatedSpace);
      const adapter = getMMKVAdapter();
      await adapter.saveSpace(updatedSpace);

      return foundChannel;
    },
    onSuccess: (_, params) => {
      queryClient.invalidateQueries({ queryKey: ['channels', params.spaceId] });
      queryClient.invalidateQueries({ queryKey: ['spaces'] });
    },
  });
}

interface DeleteChannelParams {
  spaceId: string;
  channelId: string;
}

/**
 * Delete a channel from a space
 */
export function useDeleteChannel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: DeleteChannelParams): Promise<void> => {
      const space = getSpace(params.spaceId);
      if (!space) {
        throw new Error('Space not found');
      }

      // Don't allow deleting the default channel
      if (params.channelId === space.defaultChannelId) {
        throw new Error('Cannot delete the default channel');
      }

      const updatedGroups = space.groups.map(group => ({
        ...group,
        channels: group.channels.filter(c => c.channelId !== params.channelId),
      }));

      const updatedSpace: Space = {
        ...space,
        groups: updatedGroups,
        modifiedDate: Date.now(),
      };

      saveSpace(updatedSpace);
      const adapter = getMMKVAdapter();
      await adapter.saveSpace(updatedSpace);
    },
    onSuccess: (_, params) => {
      queryClient.invalidateQueries({ queryKey: ['channels', params.spaceId] });
      queryClient.invalidateQueries({ queryKey: ['spaces'] });
    },
  });
}

interface PinChannelParams {
  spaceId: string;
  channelId: string;
  isPinned: boolean;
}

/**
 * Pin or unpin a channel
 */
export function usePinChannel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: PinChannelParams): Promise<void> => {
      const space = getSpace(params.spaceId);
      if (!space) {
        throw new Error('Space not found');
      }

      const timestamp = Date.now();
      const updatedGroups = space.groups.map(group => ({
        ...group,
        channels: group.channels.map(channel => {
          if (channel.channelId === params.channelId) {
            return {
              ...channel,
              isPinned: params.isPinned,
              pinnedAt: params.isPinned ? timestamp : undefined,
              modifiedDate: timestamp,
            };
          }
          return channel;
        }),
      }));

      const updatedSpace: Space = {
        ...space,
        groups: updatedGroups,
        modifiedDate: timestamp,
      };

      saveSpace(updatedSpace);
      const adapter = getMMKVAdapter();
      await adapter.saveSpace(updatedSpace);
    },
    onSuccess: (_, params) => {
      queryClient.invalidateQueries({ queryKey: ['channels', params.spaceId] });
    },
  });
}

interface AddGroupParams {
  spaceId: string;
  groupName: string;
  icon?: string;
  iconColor?: string;
}

/**
 * Add a new channel group to a space
 */
export function useAddGroup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: AddGroupParams): Promise<Group> => {
      const space = getSpace(params.spaceId);
      if (!space) {
        throw new Error('Space not found');
      }

      const newGroup: Group = {
        groupName: params.groupName,
        channels: [],
        icon: params.icon,
        iconColor: params.iconColor,
      };

      const updatedSpace: Space = {
        ...space,
        groups: [...space.groups, newGroup],
        modifiedDate: Date.now(),
      };

      saveSpace(updatedSpace);
      const adapter = getMMKVAdapter();
      await adapter.saveSpace(updatedSpace);

      return newGroup;
    },
    onSuccess: (_, params) => {
      queryClient.invalidateQueries({ queryKey: ['channels', params.spaceId] });
      queryClient.invalidateQueries({ queryKey: ['spaces'] });
    },
  });
}

interface DeleteGroupParams {
  spaceId: string;
  groupIndex: number;
}

/**
 * Delete a channel group from a space
 */
export function useDeleteGroup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: DeleteGroupParams): Promise<void> => {
      const space = getSpace(params.spaceId);
      if (!space) {
        throw new Error('Space not found');
      }

      if (params.groupIndex < 0 || params.groupIndex >= space.groups.length) {
        throw new Error('Invalid group index');
      }

      // Check if group contains the default channel
      const group = space.groups[params.groupIndex];
      if (group.channels.some(c => c.channelId === space.defaultChannelId)) {
        throw new Error('Cannot delete group containing the default channel');
      }

      const updatedGroups = space.groups.filter((_, index) => index !== params.groupIndex);

      const updatedSpace: Space = {
        ...space,
        groups: updatedGroups,
        modifiedDate: Date.now(),
      };

      saveSpace(updatedSpace);
      const adapter = getMMKVAdapter();
      await adapter.saveSpace(updatedSpace);
    },
    onSuccess: (_, params) => {
      queryClient.invalidateQueries({ queryKey: ['channels', params.spaceId] });
      queryClient.invalidateQueries({ queryKey: ['spaces'] });
    },
  });
}
