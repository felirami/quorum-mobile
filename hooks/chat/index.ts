/**
 * Chat hooks - Wrappers around @quilibrium/quorum-shared hooks with storage injection
 */

// Query hooks
export { useSpaces, useSpace, useSpaceMembers } from './useSpaces';
export { useChannels, flattenChannels, findChannel } from './useChannels';
export { useMessages, flattenMessages, useInvalidateMessages } from './useMessages';
export { useConversations, useConversation } from './useConversations';
export type { Conversation, ConversationWithPreview } from './useConversations';

// Farcaster direct cast hooks
export {
  useFarcasterConversations,
  useFarcasterDirectCastMessages,
  useSendFarcasterDirectCast,
  useMarkFarcasterConversationRead,
  useAddFarcasterDirectCastReaction,
  useRemoveFarcasterDirectCastReaction,
  farcasterDCQueryKeys,
} from './useFarcasterDirectCasts';
export type { DirectCastConversation, DirectCastMessage } from './useFarcasterDirectCasts';

// Unified conversations (E2EE + Farcaster)
export { useUnifiedConversations } from './useUnifiedConversations';
export type { UnifiedConversationsResult } from './useUnifiedConversations';

// Mutation hooks
export { useSendMessage } from './useSendMessage';
export { useSendSpaceMessage } from './useSendSpaceMessage';
export { useSendDirectMessage, resetDMSession } from './useSendDirectMessage';
export { useAddReaction, useRemoveReaction } from './useReactions';
export { useAddSpaceReaction, useRemoveSpaceReaction } from './useSpaceReactions';

// Space action hooks
export { useCreateSpace, useJoinSpace, useValidateInvite } from './useSpaceActions';

// Role management hooks
export {
  useRoles,
  useHasPermission,
  useUserPermissions,
  useUserRoles,
  useAddRole,
  useUpdateRole,
  useDeleteRole,
  useAssignRole,
  useRemoveFromRole,
  useToggleRolePermission,
} from './useRoleManagement';

// User kicking hook
export { useUserKicking } from './useUserKicking';

// Channel management hooks
export {
  useAddChannel,
  useUpdateChannel,
  useDeleteChannel,
  usePinChannel,
  useAddGroup,
  useDeleteGroup,
} from './useChannelManagement';

// Space settings hooks
export {
  useUpdateSpace,
  useDeleteSpace,
  useLeaveSpace,
} from './useSpaceSettings';

// Encryption hooks
export {
  useRecipientRegistration,
  useHasEncryptionSession,
  toRecipientInfo,
} from './useRecipientRegistration';

// Invite management hooks
export {
  useGenerateInvite,
  useCopyInviteLink,
  useShareInvite,
  useParseInviteLink,
  isValidInviteLink,
  getShortenedInviteLink,
  parseInviteLink,
} from './useInviteManagement';
