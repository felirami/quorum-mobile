/**
 * Utility to derive a one-line text preview from a Message's content.
 * Used by the unified inbox for space activity previews.
 */

import type { Message, MessageContent } from '@quilibrium/quorum-shared';

const STICKER_PREFIX = '🎨 ';
const EMBED_PREFIX = '📷 ';
const VIDEO_PREFIX = '📹 ';

export function messagePreview(message: Message | { content?: unknown } | null | undefined): string {
  if (!message) return '';
  const content = (message as Message).content as MessageContent | undefined;
  if (!content) return '';

  if (typeof content === 'string') return content;
  if (typeof content !== 'object') return '';

  const c = content as MessageContent & Record<string, unknown>;
  const type = c.type;

  switch (type) {
    case 'post':
    case 'event': {
      const text = c.text;
      if (Array.isArray(text)) return text.join('');
      return typeof text === 'string' ? text : '';
    }
    case 'embed': {
      if (c.videoUrl) return `${VIDEO_PREFIX}Video`;
      return `${EMBED_PREFIX}Image`;
    }
    case 'sticker':
      return `${STICKER_PREFIX}Sticker`;
    case 'reaction':
      return `Reacted ${c.reaction ?? ''}`.trim();
    case 'join':
      return 'Joined';
    case 'leave':
      return 'Left';
    case 'kick':
      return 'Kicked a member';
    case 'update-profile':
      return 'Updated profile';
    case 'remove-message':
      return 'Message removed';
    default:
      return '';
  }
}

/**
 * Sender name helper — returns the sender's display name when possible, or
 * a short-form of the address otherwise.
 */
export function messageSenderName(
  senderAddress: string | undefined,
  currentUserAddress: string | undefined,
  memberMap?: Record<string, { display_name?: string; name?: string }>
): string | undefined {
  if (!senderAddress) return undefined;
  if (currentUserAddress && senderAddress === currentUserAddress) return 'You';
  const member = memberMap?.[senderAddress];
  const name = member?.display_name || member?.name;
  if (name) return name;
  if (senderAddress.length > 12) return `${senderAddress.slice(0, 8)}...`;
  return senderAddress;
}
