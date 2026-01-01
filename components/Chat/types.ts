/**
 * Display types for Chat components
 *
 * These types represent what the UI needs to render, abstracting away
 * the differences between mock data and real API data.
 */

import { ImageSourcePropType } from 'react-native';
import type { Message as SharedMessage, Space, Channel, SpaceMember, MessageSendStatus } from '@quilibrium/quorum-shared';
import type { DirectCastMessage } from '@/services/farcasterClient';

// Message type categories for rendering
export type MessageRenderType =
  | 'post'      // Regular text message
  | 'system'    // Join/leave/kick events
  | 'embed'     // Image/video
  | 'sticker'   // Sticker
  | 'deleted';  // Deleted message placeholder

// Reaction display info
export interface DisplayReaction {
  emoji: string;
  count: number;
  memberIds: string[];
  hasReacted: boolean; // Whether current user reacted
}

// Display-oriented message for rendering
export interface DisplayMessage {
  id: string;
  userId: string;
  userName: string;
  userAvatar: ImageSourcePropType | string;
  timestamp: number;
  timeString: string;
  content: string;
  hasLink?: boolean;
  link?: string;
  linkText?: string;
  // Send status for optimistic updates
  sendStatus?: MessageSendStatus;
  sendError?: string;
  // Original message if available
  originalMessage?: SharedMessage;
  // Render type for different message displays
  renderType: MessageRenderType;
  // System message specific
  systemEventType?: 'join' | 'leave' | 'kick';
  // Embed/media specific
  imageUrl?: string;
  thumbnailUrl?: string;
  videoUrl?: string;
  mediaWidth?: number;
  mediaHeight?: number;
  // Sticker specific
  stickerId?: string;
  // Reactions on this message
  reactions?: DisplayReaction[];
  // Edit info
  isEdited?: boolean;
  editedAt?: number;
  // Reply info
  isReply?: boolean;
  replyToMessageId?: string;
  replyToAuthor?: string;
}

// Display-oriented server/space for rendering
export interface DisplayServer {
  id: string;
  name: string;
  icon: ImageSourcePropType | string;
  unread: boolean;
  // Original space if available
  originalSpace?: Space;
}

// Display-oriented channel for rendering
export interface DisplayChannel {
  id: string;
  name: string;
  unread: boolean;
  topic?: string;
  // Original channel if available
  originalChannel?: Channel;
}

// Member lookup map
export type MemberMap = Record<string, SpaceMember>;

/**
 * Format timestamp to display string
 */
export function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

// Image URL pattern - matches common image hosting URLs
const IMAGE_URL_PATTERN = /https?:\/\/[^\s]+\.(?:jpg|jpeg|png|gif|webp)(?:\?[^\s]*)?/gi;
const TENOR_GIF_PATTERN = /https?:\/\/(?:media\.tenor\.com|c\.tenor\.com)[^\s]+/gi;
// Cloudflare image delivery URLs (used by Farcaster)
const IMAGE_DELIVERY_PATTERN = /https?:\/\/imagedelivery\.net\/[^\s]+/gi;

/**
 * Extract image URLs from text content
 */
export function extractImageUrls(text: string): string[] {
  const urls: string[] = [];

  // Match standard image extensions
  const imageMatches = text.match(IMAGE_URL_PATTERN) || [];
  urls.push(...imageMatches);

  // Match Tenor GIF URLs (don't always have .gif extension)
  const tenorMatches = text.match(TENOR_GIF_PATTERN) || [];
  urls.push(...tenorMatches);

  // Match Cloudflare image delivery URLs (used by Farcaster)
  const imageDeliveryMatches = text.match(IMAGE_DELIVERY_PATTERN) || [];
  urls.push(...imageDeliveryMatches);

  // Deduplicate
  return [...new Set(urls)];
}

/**
 * Strip image URLs from text content
 */
export function stripImageUrls(text: string): string {
  return text
    .replace(IMAGE_URL_PATTERN, '')
    .replace(TENOR_GIF_PATTERN, '')
    .replace(IMAGE_DELIVERY_PATTERN, '')
    .replace(/\[Media\]/gi, '') // Also strip [Media] placeholder
    .trim();
}

/**
 * Extract display text from message content
 */
export function getMessageText(message: SharedMessage, memberName?: string): string {
  const content = message.content;
  if (content.type === 'post') {
    const text = content.text;
    return Array.isArray(text) ? text.join('\n') : text;
  }
  if (content.type === 'event') {
    return content.text;
  }
  if (content.type === 'sticker') {
    return '';  // Stickers render visually
  }
  if (content.type === 'embed') {
    return '';  // Embeds render visually
  }
  if (content.type === 'join') {
    return `${memberName ?? 'Someone'} joined the space`;
  }
  if (content.type === 'leave') {
    return `${memberName ?? 'Someone'} left the space`;
  }
  if (content.type === 'kick') {
    return `${memberName ?? 'Someone'} was removed from the space`;
  }
  if (content.type === 'edit-message') {
    const text = content.editedText;
    return Array.isArray(text) ? text.join('\n') : text;
  }
  if (content.type === 'remove-message') {
    return 'This message was deleted';
  }
  return '';
}

/**
 * Determine render type from message content
 */
export function getMessageRenderType(message: SharedMessage): MessageRenderType {
  const content = message.content;
  switch (content.type) {
    case 'join':
    case 'leave':
    case 'kick':
    case 'event':
      return 'system';
    case 'embed':
      return 'embed';
    case 'sticker':
      return 'sticker';
    case 'remove-message':
      return 'deleted';
    default:
      return 'post';
  }
}

/**
 * Convert Reaction[] to DisplayReaction[]
 */
export function toDisplayReactions(
  reactions: SharedMessage['reactions'],
  currentUserId?: string
): DisplayReaction[] {
  return reactions.map((r) => ({
    emoji: r.emojiName || r.emojiId,
    count: r.count,
    memberIds: r.memberIds,
    hasReacted: currentUserId ? r.memberIds.includes(currentUserId) : false,
  }));
}

/**
 * Convert shared Message to DisplayMessage
 */
/**
 * Format an address for display when no name is available
 */
function formatAddressDisplay(address: string): string {
  if (!address) return 'Unknown';
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function toDisplayMessage(
  message: SharedMessage,
  members: MemberMap,
  currentUserId?: string
): DisplayMessage {
  const senderId = message.content.senderId;
  const member = members[senderId];
  const memberName = member?.display_name || member?.name || formatAddressDisplay(senderId);
  const content = message.content;
  const renderType = getMessageRenderType(message);

  // Base display message
  const displayMessage: DisplayMessage = {
    id: message.messageId,
    userId: senderId,
    userName: memberName,
    userAvatar: member?.profile_image ?? '',
    timestamp: message.createdDate,
    timeString: formatTime(message.createdDate),
    content: getMessageText(message, memberName),
    sendStatus: message.sendStatus,
    sendError: message.sendError,
    originalMessage: message,
    renderType,
  };

  // Add system event type for system messages
  if (content.type === 'join' || content.type === 'leave' || content.type === 'kick') {
    displayMessage.systemEventType = content.type;
  }

  // Add embed/media info
  if (content.type === 'embed') {
    displayMessage.imageUrl = content.imageUrl;
    displayMessage.thumbnailUrl = content.thumbnailUrl;
    displayMessage.videoUrl = content.videoUrl;
    if (content.width) displayMessage.mediaWidth = parseInt(content.width, 10);
    if (content.height) displayMessage.mediaHeight = parseInt(content.height, 10);
  }

  // Check for embedded image URLs in post text (e.g., from desktop sending "[Media]" with URL)
  if (content.type === 'post' && displayMessage.content) {
    const embeddedImages = extractImageUrls(displayMessage.content);
    if (embeddedImages.length > 0) {
      // Upgrade to embed render type and extract the image
      displayMessage.renderType = 'embed';
      displayMessage.imageUrl = embeddedImages[0];
      // Strip the URL from the display text
      displayMessage.content = stripImageUrls(displayMessage.content);
    }
  }

  // Add sticker info
  if (content.type === 'sticker') {
    displayMessage.stickerId = content.stickerId;
  }

  // Add reactions
  if (message.reactions && message.reactions.length > 0) {
    displayMessage.reactions = toDisplayReactions(message.reactions, currentUserId);
  }

  // Add edit info
  if (message.edits && message.edits.length > 0) {
    displayMessage.isEdited = true;
    displayMessage.editedAt = message.edits[message.edits.length - 1].modifiedDate;
  }

  // Add reply info
  if ('repliesToMessageId' in content && content.repliesToMessageId) {
    displayMessage.isReply = true;
    displayMessage.replyToMessageId = content.repliesToMessageId;
    if (message.replyMetadata?.parentAuthor) {
      const parentMember = members[message.replyMetadata.parentAuthor];
      displayMessage.replyToAuthor =
        parentMember?.display_name || parentMember?.name || formatAddressDisplay(message.replyMetadata.parentAuthor);
    }
  }

  return displayMessage;
}

/**
 * Convert shared Space to DisplayServer
 */
export function toDisplayServer(space: Space): DisplayServer {
  return {
    id: space.spaceId,
    name: space.spaceName,
    // Pass iconUrl as string so ServerSidebar can check if it's a data URI
    icon: space.iconUrl || '',
    unread: false, // Would need to track read state
    originalSpace: space,
  };
}

/**
 * Convert shared Channel to DisplayChannel
 */
export function toDisplayChannel(channel: Channel): DisplayChannel {
  return {
    id: channel.channelId,
    name: channel.channelName,
    unread: (channel.mentionCount ?? 0) > 0,
    topic: channel.channelTopic,
    originalChannel: channel,
  };
}

/**
 * Convert Farcaster DirectCastMessage to DisplayMessage
 */
export function directCastToDisplayMessage(
  message: DirectCastMessage,
  currentUserFid?: number
): DisplayMessage {
  const sender = message.senderContext;
  const pfpUrl = sender?.pfp?.url ?? '';
  const senderName = sender?.displayName ?? sender?.username ?? `fid:${message.senderFid}`;

  // Determine render type based on message type
  let renderType: MessageRenderType = 'post';
  let systemEventType: 'join' | 'leave' | 'kick' | undefined;
  let content = message.message;

  if (message.type === 'group_membership_addition') {
    renderType = 'system';
    systemEventType = 'join';
    // actionTargetUserContext contains who was added, senderContext is who invited them
    const target = message.actionTargetUserContext;
    const targetName = target?.displayName ?? target?.username ?? `fid:${message.message}`;
    content = `${targetName} joined the conversation`;
  } else if (message.type === 'group_membership_removal') {
    renderType = 'system';
    systemEventType = 'leave';
    // actionTargetUserContext contains who was removed
    const target = message.actionTargetUserContext;
    const targetName = target?.displayName ?? target?.username ?? `fid:${message.message}`;
    content = `${targetName} left the conversation`;
  } else if (message.type === 'group_name_change') {
    renderType = 'system';
    content = `${senderName} changed the group name`;
  }

  // Check if message is deleted
  if (message.isDeleted) {
    renderType = 'deleted';
    content = 'This message was deleted';
  }

  const displayMessage: DisplayMessage = {
    id: message.messageId,
    userId: String(sender?.fid ?? message.senderFid),
    userName: senderName,
    userAvatar: pfpUrl,
    timestamp: message.serverTimestamp,
    timeString: formatTime(message.serverTimestamp),
    content,
    renderType,
    systemEventType,
  };

  // Check for embedded image URLs in message text (e.g., imagedelivery.net)
  if (renderType === 'post' && content) {
    const embeddedImages = extractImageUrls(content);
    if (embeddedImages.length > 0) {
      displayMessage.renderType = 'embed';
      displayMessage.imageUrl = embeddedImages[0];
      // Strip the URL from the display text
      displayMessage.content = stripImageUrls(content);
    }
  }

  // Add reactions if present
  if (message.reactions && message.reactions.length > 0) {
    const viewerReactions = message.viewerContext?.reactions ?? [];
    displayMessage.reactions = message.reactions.map((r) => ({
      emoji: r.reaction,
      count: r.count,
      memberIds: [],
      hasReacted: viewerReactions.includes(r.reaction),
    }));
  }

  // Add reply info
  if (message.inReplyTo) {
    displayMessage.isReply = true;
    displayMessage.replyToMessageId = message.inReplyTo.messageId;
    displayMessage.replyToAuthor =
      message.inReplyTo.senderContext?.displayName ??
      message.inReplyTo.senderContext?.username ??
      `fid:${message.inReplyTo.senderFid}`;
  }

  return displayMessage;
}
