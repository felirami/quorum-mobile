// Fallback for using MaterialIcons on Android and web.

import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { SymbolViewProps, SymbolWeight } from 'expo-symbols';
import { ComponentProps } from 'react';
import { OpaqueColorValue, type StyleProp, type TextStyle } from 'react-native';

type IconMapping = Record<SymbolViewProps['name'], ComponentProps<typeof MaterialIcons>['name']>;
export type IconSymbolName = keyof typeof MAPPING;

/**
 * Add your SF Symbols to Material Icons mappings here.
 * - see Material Icons in the [Icons Directory](https://icons.expo.fyi).
 * - see SF Symbols in the [SF Symbols](https://developer.apple.com/sf-symbols/) app.
 */
const MAPPING = {
  'house.fill': 'home',
  'paperplane.fill': 'send',
  'chevron.left.forwardslash.chevron.right': 'code',
  'chevron.right': 'chevron-right',
  'chevron.left': 'chevron-left',
  'chevron.up': 'expand-less',
  'chevron.down': 'expand-more',
  'wallet.bifold.fill': 'wallet',
  // Onboarding icons
  'lock.shield.fill': 'security',
  'shield.checkered': 'verified-user',
  'globe': 'public',
  'hand.raised.fill': 'pan-tool',
  'key.fill': 'vpn-key',
  'plus.circle.fill': 'add-circle',
  'rectangle.grid.2x2': 'apps',
  'number': 'numbers',
  'exclamationmark.circle.fill': 'error',
  'exclamationmark.circle': 'error-outline',
  'eye.fill': 'visibility',
  'eye': 'visibility',
  'eye.slash.fill': 'visibility-off',
  'eye.slash': 'visibility-off',
  'doc.on.doc': 'content-copy',
  'exclamationmark.triangle.fill': 'warning',
  'exclamationmark.triangle': 'warning',
  'checkmark.circle.fill': 'check-circle',
  'checkmark': 'check',
  'person.fill': 'person',
  'person.2.fill': 'group',
  'bolt.fill': 'flash-on',
  'server.rack': 'storage',
  'doc.on.clipboard': 'content-paste',
  'info.circle': 'info',
  'info.circle.fill': 'info',
  'camera.fill': 'photo-camera',
  'photo': 'photo-library',
  'camera': 'camera-alt',
  // UserPanel icons
  'waveform.path.ecg': 'graphic-eq',
  'square.grid.2x2': 'grid-view',
  'banknote.fill': 'account-balance-wallet',
  'mic.fill': 'mic',
  'headphones': 'headset',
  'gearshape.fill': 'settings',
  'gearshape': 'settings',
  // Chat icons
  'xmark.circle.fill': 'cancel',
  'xmark': 'close',
  'line.3.horizontal': 'menu',
  'arrow.left': 'arrow-back',
  'plus': 'add',
  'face.smiling': 'emoji-emotions',
  'photo.fill': 'image',
  // Browser icons
  'arrow.clockwise': 'refresh',
  'exclamationmark.shield.fill': 'gpp-maybe',
  'square.and.arrow.up': 'share',
  'safari': 'open-in-browser',
  // Communication icons
  'bubble.left.and.bubble.right': 'forum',
  'bubble.left.and.bubble.right.fill': 'forum',
  'bubble.left': 'chat-bubble-outline',
  'phone.fill': 'phone',
  'video.fill': 'videocam',
  'square.and.pencil': 'edit',
  'magnifyingglass': 'search',
  'paperclip': 'attach-file',
  'at': 'alternate-email',
  'heart.fill': 'favorite',
  // Wallet icons
  'arrow.up.circle.fill': 'arrow-circle-up',
  'arrow.down.circle.fill': 'arrow-circle-down',
  'arrow.2.squarepath': 'swap-horiz',
  'arrow.2.circlepath': 'sync',
  // Media icons
  'play.fill': 'play-arrow',
  'pause.fill': 'pause',
  // Social/Profile icons
  'star.fill': 'star',
  'mappin': 'place',
  'crown.fill': 'workspace-premium',
  'pencil': 'edit',
  'shield.fill': 'shield',
  'doc.text.fill': 'description',
  'trash.fill': 'delete',
  'arrow.counterclockwise': 'restore',
  // Status icons
  'wifi.slash': 'wifi-off',
  // Additional icons
  'arrow.right.circle.fill': 'arrow-circle-right',
  'link': 'link',
  'link.badge.plus': 'add-link',
  'person.2': 'group',
  'person.3.fill': 'groups',
  'person.badge.plus': 'person-add',
  'play.circle.fill': 'play-circle-filled',
  'questionmark': 'help-outline',
  'shield': 'shield',
  'star': 'star-outline',
  'trash': 'delete-outline',
  'sparkles': 'auto-awesome',
} as IconMapping;

/**
 * An icon component that uses native SF Symbols on iOS, and Material Icons on Android and web.
 * This ensures a consistent look across platforms, and optimal resource usage.
 * Icon `name`s are based on SF Symbols and require manual mapping to Material Icons.
 */
export function IconSymbol({
  name,
  size = 24,
  color,
  style,
}: {
  name: IconSymbolName;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<TextStyle>;
  weight?: SymbolWeight;
}) {
  return <MaterialIcons color={color} size={size} name={MAPPING[name]} style={style} />;
}
