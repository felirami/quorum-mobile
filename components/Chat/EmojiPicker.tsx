/**
 * EmojiPicker - Full emoji picker with categories
 * All emojis are bundled locally (no remote assets)
 * Supports custom space emojis displayed as images
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Modal,
  Pressable,
  TextInput,
  Image,
} from 'react-native';
import type { Emoji } from '@quilibrium/quorum-shared';

// Custom emoji type for the picker (includes isCustom flag for rendering)
type PickerEmoji = {
  value: string; // For standard: the emoji char. For custom: the emoji ID
  isCustom: boolean;
  imgUrl?: string; // Only for custom emojis
  name?: string; // For display/search
};

// Emoji categories with local emoji data
const EMOJI_CATEGORIES = {
  recent: {
    name: 'Recent',
    icon: '🕐',
    emojis: [] as string[], // Will be populated from usage
  },
  smileys: {
    name: 'Smileys',
    icon: '😀',
    emojis: [
      '😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃',
      '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '☺️', '😚',
      '😙', '🥲', '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭',
      '🤫', '🤔', '🤐', '🤨', '😐', '😑', '😶', '😏', '😒', '🙄',
      '😬', '🤥', '😌', '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕',
      '🤢', '🤮', '🤧', '🥵', '🥶', '🥴', '😵', '🤯', '🤠', '🥳',
      '🥸', '😎', '🤓', '🧐', '😕', '😟', '🙁', '☹️', '😮', '😯',
      '😲', '😳', '🥺', '😦', '😧', '😨', '😰', '😥', '😢', '😭',
      '😱', '😖', '😣', '😞', '😓', '😩', '😫', '🥱', '😤', '😡',
      '😠', '🤬', '😈', '👿', '💀', '☠️', '💩', '🤡', '👹', '👺',
      '👻', '👽', '👾', '🤖', '😺', '😸', '😹', '😻', '😼', '😽',
      '🙀', '😿', '😾',
    ],
  },
  gestures: {
    name: 'Gestures',
    icon: '👋',
    emojis: [
      '👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤌', '🤏', '✌️', '🤞',
      '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '👍',
      '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝',
      '🙏', '✍️', '💅', '🤳', '💪', '🦾', '🦿', '🦵', '🦶', '👂',
      '🦻', '👃', '🧠', '🫀', '🫁', '🦷', '🦴', '👀', '👁️', '👅',
      '👄', '💋', '🩸',
    ],
  },
  people: {
    name: 'People',
    icon: '👶',
    emojis: [
      '👶', '👧', '🧒', '👦', '👩', '🧑', '👨', '👩‍🦱', '🧑‍🦱', '👨‍🦱',
      '👩‍🦰', '🧑‍🦰', '👨‍🦰', '👱‍♀️', '👱', '👱‍♂️', '👩‍🦳', '🧑‍🦳', '👨‍🦳', '👩‍🦲',
      '🧑‍🦲', '👨‍🦲', '🧔', '👵', '🧓', '👴', '👲', '👳‍♀️', '👳', '👳‍♂️',
      '🧕', '👮‍♀️', '👮', '👮‍♂️', '👷‍♀️', '👷', '👷‍♂️', '💂‍♀️', '💂', '💂‍♂️',
      '🕵️‍♀️', '🕵️', '🕵️‍♂️', '👩‍⚕️', '🧑‍⚕️', '👨‍⚕️', '👩‍🌾', '🧑‍🌾', '👨‍🌾', '👩‍🍳',
      '🧑‍🍳', '👨‍🍳', '👩‍🎓', '🧑‍🎓', '👨‍🎓', '👩‍🎤', '🧑‍🎤', '👨‍🎤', '👩‍🏫', '🧑‍🏫',
      '👨‍🏫', '👩‍🏭', '🧑‍🏭', '👨‍🏭', '👩‍💻', '🧑‍💻', '👨‍💻', '👩‍💼', '🧑‍💼', '👨‍💼',
    ],
  },
  nature: {
    name: 'Nature',
    icon: '🐶',
    emojis: [
      '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐻‍❄️', '🐨',
      '🐯', '🦁', '🐮', '🐷', '🐽', '🐸', '🐵', '🙈', '🙉', '🙊',
      '🐒', '🐔', '🐧', '🐦', '🐤', '🐣', '🐥', '🦆', '🦅', '🦉',
      '🦇', '🐺', '🐗', '🐴', '🦄', '🐝', '🪱', '🐛', '🦋', '🐌',
      '🐞', '🐜', '🪰', '🪲', '🪳', '🦟', '🦗', '🕷️', '🕸️', '🦂',
      '🐢', '🐍', '🦎', '🦖', '🦕', '🐙', '🦑', '🦐', '🦞', '🦀',
      '🐡', '🐠', '🐟', '🐬', '🐳', '🐋', '🦈', '🐊', '🐅', '🐆',
      '🦓', '🦍', '🦧', '🦣', '🐘', '🦛', '🦏', '🐪', '🐫', '🦒',
      '🦘', '🦬', '🐃', '🐂', '🐄', '🐎', '🐖', '🐏', '🐑', '🦙',
      '🐐', '🦌', '🐕', '🐩', '🦮', '🐕‍🦺', '🐈', '🐈‍⬛', '🪶', '🐓',
      '🦃', '🦤', '🦚', '🦜', '🦢', '🦩', '🕊️', '🐇', '🦝', '🦨',
      '🦡', '🦫', '🦦', '🦥', '🐁', '🐀', '🐿️', '🦔',
    ],
  },
  food: {
    name: 'Food',
    icon: '🍔',
    emojis: [
      '🍏', '🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🫐',
      '🍈', '🍒', '🍑', '🥭', '🍍', '🥥', '🥝', '🍅', '🍆', '🥑',
      '🥦', '🥬', '🥒', '🌶️', '🫑', '🌽', '🥕', '🫒', '🧄', '🧅',
      '🥔', '🍠', '🥐', '🥯', '🍞', '🥖', '🥨', '🧀', '🥚', '🍳',
      '🧈', '🥞', '🧇', '🥓', '🥩', '🍗', '🍖', '🦴', '🌭', '🍔',
      '🍟', '🍕', '🫓', '🥪', '🥙', '🧆', '🌮', '🌯', '🫔', '🥗',
      '🥘', '🫕', '🥫', '🍝', '🍜', '🍲', '🍛', '🍣', '🍱', '🥟',
      '🦪', '🍤', '🍙', '🍚', '🍘', '🍥', '🥠', '🥮', '🍢', '🍡',
      '🍧', '🍨', '🍦', '🥧', '🧁', '🍰', '🎂', '🍮', '🍭', '🍬',
      '🍫', '🍿', '🍩', '🍪', '🌰', '🥜', '🍯', '🥛', '🍼', '🫖',
      '☕', '🍵', '🧃', '🥤', '🧋', '🍶', '🍺', '🍻', '🥂', '🍷',
      '🥃', '🍸', '🍹', '🧉', '🍾', '🧊', '🥄', '🍴', '🍽️', '🥣',
      '🥡', '🥢', '🧂',
    ],
  },
  activities: {
    name: 'Activities',
    icon: '⚽',
    emojis: [
      '⚽', '🏀', '🏈', '⚾', '🥎', '🎾', '🏐', '🏉', '🥏', '🎱',
      '🪀', '🏓', '🏸', '🏒', '🏑', '🥍', '🏏', '🪃', '🥅', '⛳',
      '🪁', '🏹', '🎣', '🤿', '🥊', '🥋', '🎽', '🛹', '🛼', '🛷',
      '⛸️', '🥌', '🎿', '⛷️', '🏂', '🪂', '🏋️‍♀️', '🏋️', '🏋️‍♂️', '🤼‍♀️',
      '🤼', '🤼‍♂️', '🤸‍♀️', '🤸', '🤸‍♂️', '⛹️‍♀️', '⛹️', '⛹️‍♂️', '🤺', '🤾‍♀️',
      '🤾', '🤾‍♂️', '🏌️‍♀️', '🏌️', '🏌️‍♂️', '🏇', '🧘‍♀️', '🧘', '🧘‍♂️', '🏄‍♀️',
      '🏄', '🏄‍♂️', '🏊‍♀️', '🏊', '🏊‍♂️', '🤽‍♀️', '🤽', '🤽‍♂️', '🚣‍♀️', '🚣',
      '🚣‍♂️', '🧗‍♀️', '🧗', '🧗‍♂️', '🚵‍♀️', '🚵', '🚵‍♂️', '🚴‍♀️', '🚴', '🚴‍♂️',
      '🏆', '🥇', '🥈', '🥉', '🏅', '🎖️', '🏵️', '🎗️', '🎫', '🎟️',
      '🎪', '🤹‍♀️', '🤹', '🤹‍♂️', '🎭', '🩰', '🎨', '🎬', '🎤', '🎧',
      '🎼', '🎹', '🥁', '🪘', '🎷', '🎺', '🪗', '🎸', '🪕', '🎻',
      '🎲', '♟️', '🎯', '🎳', '🎮', '🎰', '🧩',
    ],
  },
  travel: {
    name: 'Travel',
    icon: '🚗',
    emojis: [
      '🚗', '🚕', '🚙', '🚌', '🚎', '🏎️', '🚓', '🚑', '🚒', '🚐',
      '🛻', '🚚', '🚛', '🚜', '🦯', '🦽', '🦼', '🛴', '🚲', '🛵',
      '🏍️', '🛺', '🚨', '🚔', '🚍', '🚘', '🚖', '🚡', '🚠', '🚟',
      '🚃', '🚋', '🚞', '🚝', '🚄', '🚅', '🚈', '🚂', '🚆', '🚇',
      '🚊', '🚉', '✈️', '🛫', '🛬', '🛩️', '💺', '🛰️', '🚀', '🛸',
      '🚁', '🛶', '⛵', '🚤', '🛥️', '🛳️', '⛴️', '🚢', '⚓', '🪝',
      '⛽', '🚧', '🚦', '🚥', '🚏', '🗺️', '🗿', '🗽', '🗼', '🏰',
      '🏯', '🏟️', '🎡', '🎢', '🎠', '⛲', '⛱️', '🏖️', '🏝️', '🏜️',
      '🌋', '⛰️', '🏔️', '🗻', '🏕️', '⛺', '🛖', '🏠', '🏡', '🏘️',
      '🏚️', '🏗️', '🏭', '🏢', '🏬', '🏣', '🏤', '🏥', '🏦', '🏨',
      '🏪', '🏫', '🏩', '💒', '🏛️', '⛪', '🕌', '🕍', '🛕', '🕋',
      '⛩️', '🛤️', '🛣️', '🗾', '🎑', '🏞️', '🌅', '🌄', '🌠', '🎇',
      '🎆', '🌇', '🌆', '🏙️', '🌃', '🌌', '🌉', '🌁',
    ],
  },
  objects: {
    name: 'Objects',
    icon: '💡',
    emojis: [
      '⌚', '📱', '📲', '💻', '⌨️', '🖥️', '🖨️', '🖱️', '🖲️', '🕹️',
      '🗜️', '💽', '💾', '💿', '📀', '📼', '📷', '📸', '📹', '🎥',
      '📽️', '🎞️', '📞', '☎️', '📟', '📠', '📺', '📻', '🎙️', '🎚️',
      '🎛️', '🧭', '⏱️', '⏲️', '⏰', '🕰️', '⌛', '⏳', '📡', '🔋',
      '🔌', '💡', '🔦', '🕯️', '🪔', '🧯', '🛢️', '💸', '💵', '💴',
      '💶', '💷', '🪙', '💰', '💳', '💎', '⚖️', '🪜', '🧰', '🪛',
      '🔧', '🔨', '⚒️', '🛠️', '⛏️', '🪚', '🔩', '⚙️', '🪤', '🧱',
      '⛓️', '🧲', '🔫', '💣', '🧨', '🪓', '🔪', '🗡️', '⚔️', '🛡️',
      '🚬', '⚰️', '🪦', '⚱️', '🏺', '🔮', '📿', '🧿', '💈', '⚗️',
      '🔭', '🔬', '🕳️', '🩹', '🩺', '💊', '💉', '🩸', '🧬', '🦠',
      '🧫', '🧪', '🌡️', '🧹', '🪠', '🧺', '🧻', '🚽', '🚰', '🚿',
      '🛁', '🛀', '🧼', '🪥', '🪒', '🧽', '🪣', '🧴', '🛎️', '🔑',
      '🗝️', '🚪', '🪑', '🛋️', '🛏️', '🛌', '🧸', '🪆', '🖼️', '🪞',
      '🪟', '🛍️', '🛒', '🎁', '🎈', '🎏', '🎀', '🪄', '🪅', '🎊',
      '🎉', '🎎', '🏮', '🎐', '🧧', '✉️', '📩', '📨', '📧', '💌',
      '📥', '📤', '📦', '🏷️', '🪧', '📪', '📫', '📬', '📭', '📮',
      '📯', '📜', '📃', '📄', '📑', '🧾', '📊', '📈', '📉', '🗒️',
      '🗓️', '📆', '📅', '🗑️', '📇', '🗃️', '🗳️', '🗄️', '📋', '📁',
      '📂', '🗂️', '🗞️', '📰', '📓', '📔', '📒', '📕', '📗', '📘',
      '📙', '📚', '📖', '🔖', '🧷', '🔗', '📎', '🖇️', '📐', '📏',
      '🧮', '📌', '📍', '✂️', '🖊️', '🖋️', '✒️', '🖌️', '🖍️', '📝',
      '✏️', '🔍', '🔎', '🔏', '🔐', '🔒', '🔓',
    ],
  },
  symbols: {
    name: 'Symbols',
    icon: '❤️',
    emojis: [
      '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔',
      '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '☮️',
      '✝️', '☪️', '🕉️', '☸️', '✡️', '🔯', '🕎', '☯️', '☦️', '🛐',
      '⛎', '♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐',
      '♑', '♒', '♓', '🆔', '⚛️', '🉑', '☢️', '☣️', '📴', '📳',
      '🈶', '🈚', '🈸', '🈺', '🈷️', '✴️', '🆚', '💮', '🉐', '㊙️',
      '㊗️', '🈴', '🈵', '🈹', '🈲', '🅰️', '🅱️', '🆎', '🆑', '🅾️',
      '🆘', '❌', '⭕', '🛑', '⛔', '📛', '🚫', '💯', '💢', '♨️',
      '🚷', '🚯', '🚳', '🚱', '🔞', '📵', '🚭', '❗', '❕', '❓',
      '❔', '‼️', '⁉️', '🔅', '🔆', '〽️', '⚠️', '🚸', '🔱', '⚜️',
      '🔰', '♻️', '✅', '🈯', '💹', '❇️', '✳️', '❎', '🌐', '💠',
      'Ⓜ️', '🌀', '💤', '🏧', '🚾', '♿', '🅿️', '🛗', '🈳', '🈂️',
      '🛂', '🛃', '🛄', '🛅', '🚹', '🚺', '🚼', '⚧', '🚻', '🚮',
      '🎦', '📶', '🈁', '🔣', 'ℹ️', '🔤', '🔡', '🔠', '🆖', '🆗',
      '🆙', '🆒', '🆕', '🆓', '0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣',
      '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟', '🔢', '#️⃣', '*️⃣', '⏏️', '▶️',
      '⏸️', '⏯️', '⏹️', '⏺️', '⏭️', '⏮️', '⏩', '⏪', '⏫', '⏬',
      '◀️', '🔼', '🔽', '➡️', '⬅️', '⬆️', '⬇️', '↗️', '↘️', '↙️',
      '↖️', '↕️', '↔️', '↪️', '↩️', '⤴️', '⤵️', '🔀', '🔁', '🔂',
      '🔄', '🔃', '🎵', '🎶', '➕', '➖', '➗', '✖️', '♾️', '💲',
      '💱', '™️', '©️', '®️', '👁️‍🗨️', '🔚', '🔙', '🔛', '🔝', '🔜',
      '〰️', '➰', '➿', '✔️', '☑️', '🔘', '🔴', '🟠', '🟡', '🟢',
      '🔵', '🟣', '⚫', '⚪', '🟤', '🔺', '🔻', '🔸', '🔹', '🔶',
      '🔷', '🔳', '🔲', '▪️', '▫️', '◾', '◽', '◼️', '◻️', '🟥',
      '🟧', '🟨', '🟩', '🟦', '🟪', '⬛', '⬜', '🟫', '🔈', '🔇',
      '🔉', '🔊', '🔔', '🔕', '📣', '📢', '💬', '💭', '🗯️', '♠️',
      '♣️', '♥️', '♦️', '🃏', '🎴', '🀄', '🕐', '🕑', '🕒', '🕓',
      '🕔', '🕕', '🕖', '🕗', '🕘', '🕙', '🕚', '🕛', '🕜', '🕝',
      '🕞', '🕟', '🕠', '🕡', '🕢', '🕣', '🕤', '🕥', '🕦', '🕧',
    ],
  },
  flags: {
    name: 'Flags',
    icon: '🏳️',
    emojis: [
      '🏳️', '🏴', '🏴‍☠️', '🏁', '🚩', '🎌', '🏳️‍🌈', '🏳️‍⚧️', '🇺🇳', '🇦🇫',
      '🇦🇱', '🇩🇿', '🇦🇸', '🇦🇩', '🇦🇴', '🇦🇮', '🇦🇶', '🇦🇬', '🇦🇷', '🇦🇲',
      '🇦🇼', '🇦🇺', '🇦🇹', '🇦🇿', '🇧🇸', '🇧🇭', '🇧🇩', '🇧🇧', '🇧🇾', '🇧🇪',
      '🇧🇿', '🇧🇯', '🇧🇲', '🇧🇹', '🇧🇴', '🇧🇦', '🇧🇼', '🇧🇷', '🇮🇴', '🇻🇬',
      '🇧🇳', '🇧🇬', '🇧🇫', '🇧🇮', '🇰🇭', '🇨🇲', '🇨🇦', '🇮🇨', '🇨🇻', '🇧🇶',
      '🇰🇾', '🇨🇫', '🇹🇩', '🇨🇱', '🇨🇳', '🇨🇽', '🇨🇨', '🇨🇴', '🇰🇲', '🇨🇬',
      '🇨🇩', '🇨🇰', '🇨🇷', '🇨🇮', '🇭🇷', '🇨🇺', '🇨🇼', '🇨🇾', '🇨🇿', '🇩🇰',
      '🇩🇯', '🇩🇲', '🇩🇴', '🇪🇨', '🇪🇬', '🇸🇻', '🇬🇶', '🇪🇷', '🇪🇪', '🇸🇿',
      '🇪🇹', '🇪🇺', '🇫🇰', '🇫🇴', '🇫🇯', '🇫🇮', '🇫🇷', '🇬🇫', '🇵🇫', '🇹🇫',
      '🇬🇦', '🇬🇲', '🇬🇪', '🇩🇪', '🇬🇭', '🇬🇮', '🇬🇷', '🇬🇱', '🇬🇩', '🇬🇵',
      '🇬🇺', '🇬🇹', '🇬🇬', '🇬🇳', '🇬🇼', '🇬🇾', '🇭🇹', '🇭🇳', '🇭🇰', '🇭🇺',
      '🇮🇸', '🇮🇳', '🇮🇩', '🇮🇷', '🇮🇶', '🇮🇪', '🇮🇲', '🇮🇱', '🇮🇹', '🇯🇲',
      '🇯🇵', '🎌', '🇯🇪', '🇯🇴', '🇰🇿', '🇰🇪', '🇰🇮', '🇽🇰', '🇰🇼', '🇰🇬',
      '🇱🇦', '🇱🇻', '🇱🇧', '🇱🇸', '🇱🇷', '🇱🇾', '🇱🇮', '🇱🇹', '🇱🇺', '🇲🇴',
      '🇲🇬', '🇲🇼', '🇲🇾', '🇲🇻', '🇲🇱', '🇲🇹', '🇲🇭', '🇲🇶', '🇲🇷', '🇲🇺',
      '🇾🇹', '🇲🇽', '🇫🇲', '🇲🇩', '🇲🇨', '🇲🇳', '🇲🇪', '🇲🇸', '🇲🇦', '🇲🇿',
      '🇲🇲', '🇳🇦', '🇳🇷', '🇳🇵', '🇳🇱', '🇳🇨', '🇳🇿', '🇳🇮', '🇳🇪', '🇳🇬',
      '🇳🇺', '🇳🇫', '🇰🇵', '🇲🇰', '🇲🇵', '🇳🇴', '🇴🇲', '🇵🇰', '🇵🇼', '🇵🇸',
      '🇵🇦', '🇵🇬', '🇵🇾', '🇵🇪', '🇵🇭', '🇵🇳', '🇵🇱', '🇵🇹', '🇵🇷', '🇶🇦',
      '🇷🇪', '🇷🇴', '🇷🇺', '🇷🇼', '🇼🇸', '🇸🇲', '🇸🇹', '🇸🇦', '🇸🇳', '🇷🇸',
      '🇸🇨', '🇸🇱', '🇸🇬', '🇸🇽', '🇸🇰', '🇸🇮', '🇬🇸', '🇸🇧', '🇸🇴', '🇿🇦',
      '🇰🇷', '🇸🇸', '🇪🇸', '🇱🇰', '🇧🇱', '🇸🇭', '🇰🇳', '🇱🇨', '🇵🇲', '🇻🇨',
      '🇸🇩', '🇸🇷', '🇸🇪', '🇨🇭', '🇸🇾', '🇹🇼', '🇹🇯', '🇹🇿', '🇹🇭', '🇹🇱',
      '🇹🇬', '🇹🇰', '🇹🇴', '🇹🇹', '🇹🇳', '🇹🇷', '🇹🇲', '🇹🇨', '🇹🇻', '🇻🇮',
      '🇺🇬', '🇺🇦', '🇦🇪', '🇬🇧', '🏴󠁧󠁢󠁥󠁮󠁧󠁿', '🏴󠁧󠁢󠁳󠁣󠁴󠁿', '🏴󠁧󠁢󠁷󠁬󠁳󠁿', '🇺🇸', '🇺🇾', '🇺🇿',
      '🇻🇺', '🇻🇦', '🇻🇪', '🇻🇳', '🇼🇫', '🇪🇭', '🇾🇪', '🇿🇲', '🇿🇼',
    ],
  },
};

type CategoryKey = keyof typeof EMOJI_CATEGORIES | 'custom';

// Emoji name/keyword mappings for search
const EMOJI_KEYWORDS: Record<string, string[]> = {
  '😀': ['grinning', 'smile', 'happy'],
  '😃': ['smiley', 'happy', 'smile'],
  '😄': ['smile', 'happy', 'grin'],
  '😁': ['grin', 'happy', 'smile', 'beam'],
  '😆': ['laughing', 'satisfied', 'laugh'],
  '😅': ['sweat', 'smile', 'nervous'],
  '🤣': ['rofl', 'laugh', 'rolling'],
  '😂': ['joy', 'laugh', 'tears', 'lol'],
  '🙂': ['slightly smiling', 'smile'],
  '🙃': ['upside down', 'silly'],
  '😉': ['wink', 'flirt'],
  '😊': ['blush', 'smile', 'happy'],
  '😇': ['angel', 'innocent', 'halo'],
  '🥰': ['love', 'hearts', 'adore'],
  '😍': ['heart eyes', 'love', 'adore'],
  '🤩': ['star struck', 'excited', 'stars'],
  '😘': ['kiss', 'love', 'heart'],
  '😗': ['kiss', 'smooch'],
  '😚': ['kiss', 'blush'],
  '😙': ['kiss', 'smile'],
  '🥲': ['happy tears', 'touched'],
  '😋': ['yum', 'delicious', 'tongue'],
  '😛': ['tongue', 'playful'],
  '😜': ['wink', 'tongue', 'crazy'],
  '🤪': ['zany', 'crazy', 'goofy'],
  '😝': ['tongue', 'squint'],
  '🤑': ['money', 'rich', 'dollar'],
  '🤗': ['hug', 'hugging'],
  '🤭': ['oops', 'giggle', 'cover'],
  '🤫': ['shush', 'quiet', 'secret'],
  '🤔': ['thinking', 'hmm', 'wonder'],
  '🤐': ['zipper', 'quiet', 'secret'],
  '🤨': ['raised eyebrow', 'skeptical'],
  '😐': ['neutral', 'meh'],
  '😑': ['expressionless', 'blank'],
  '😶': ['no mouth', 'silent'],
  '😏': ['smirk', 'sly'],
  '😒': ['unamused', 'annoyed'],
  '🙄': ['eye roll', 'annoyed'],
  '😬': ['grimace', 'awkward'],
  '😌': ['relieved', 'peaceful'],
  '😔': ['pensive', 'sad'],
  '😪': ['sleepy', 'tired'],
  '🤤': ['drool', 'hungry'],
  '😴': ['sleep', 'zzz', 'tired'],
  '😷': ['mask', 'sick'],
  '🤒': ['thermometer', 'sick', 'fever'],
  '🤕': ['bandage', 'hurt', 'injured'],
  '🤢': ['nauseous', 'sick', 'green'],
  '🤮': ['vomit', 'sick', 'throw up'],
  '🤧': ['sneeze', 'sick', 'tissue'],
  '🥵': ['hot', 'sweating'],
  '🥶': ['cold', 'freezing'],
  '🥴': ['woozy', 'drunk', 'dizzy'],
  '😵': ['dizzy', 'dead'],
  '🤯': ['mind blown', 'exploding', 'shocked'],
  '🤠': ['cowboy', 'yeehaw'],
  '🥳': ['party', 'celebrate', 'birthday'],
  '😎': ['cool', 'sunglasses'],
  '🤓': ['nerd', 'glasses'],
  '😕': ['confused', 'puzzled'],
  '😟': ['worried', 'concerned'],
  '🙁': ['sad', 'frown'],
  '☹️': ['frown', 'sad'],
  '😮': ['open mouth', 'surprised'],
  '😯': ['hushed', 'surprised'],
  '😲': ['astonished', 'shocked'],
  '😳': ['flushed', 'embarrassed'],
  '🥺': ['pleading', 'puppy eyes'],
  '😦': ['frown', 'open mouth'],
  '😧': ['anguished'],
  '😨': ['fearful', 'scared'],
  '😰': ['anxious', 'sweat'],
  '😥': ['sad', 'relieved'],
  '😢': ['cry', 'sad', 'tear'],
  '😭': ['sob', 'crying', 'sad'],
  '😱': ['scream', 'horror', 'scared'],
  '😖': ['confounded'],
  '😣': ['persevere'],
  '😞': ['disappointed', 'sad'],
  '😓': ['downcast', 'sweat'],
  '😩': ['weary', 'tired'],
  '😫': ['tired'],
  '🥱': ['yawn', 'tired', 'sleepy'],
  '😤': ['triumph', 'huffing', 'angry'],
  '😡': ['angry', 'mad', 'rage'],
  '😠': ['angry', 'mad'],
  '🤬': ['cursing', 'swearing', 'angry'],
  '😈': ['devil', 'evil', 'smiling'],
  '👿': ['devil', 'angry', 'evil'],
  '💀': ['skull', 'dead', 'death'],
  '☠️': ['skull', 'crossbones', 'death'],
  '💩': ['poop', 'poo'],
  '🤡': ['clown'],
  '👹': ['ogre', 'monster'],
  '👺': ['goblin', 'monster'],
  '👻': ['ghost', 'boo'],
  '👽': ['alien', 'ufo'],
  '👾': ['alien', 'monster', 'game'],
  '🤖': ['robot', 'bot'],
  '😺': ['cat', 'smile'],
  '😸': ['cat', 'grin'],
  '😹': ['cat', 'joy', 'laugh'],
  '😻': ['cat', 'heart eyes', 'love'],
  '😼': ['cat', 'smirk'],
  '😽': ['cat', 'kiss'],
  '🙀': ['cat', 'weary'],
  '😿': ['cat', 'cry'],
  '😾': ['cat', 'angry'],
  '👋': ['wave', 'hello', 'hi', 'bye'],
  '🤚': ['raised hand', 'stop'],
  '🖐️': ['hand', 'fingers'],
  '✋': ['hand', 'stop', 'high five'],
  '🖖': ['vulcan', 'spock'],
  '👌': ['ok', 'okay', 'perfect'],
  '🤌': ['pinched fingers', 'italian'],
  '🤏': ['pinch', 'small'],
  '✌️': ['peace', 'victory'],
  '🤞': ['crossed fingers', 'luck'],
  '🤟': ['love you', 'rock'],
  '🤘': ['rock', 'horns'],
  '🤙': ['call me', 'hang loose'],
  '👈': ['point left'],
  '👉': ['point right'],
  '👆': ['point up'],
  '🖕': ['middle finger', 'fuck'],
  '👇': ['point down'],
  '☝️': ['point up'],
  '👍': ['thumbs up', 'like', 'yes', 'good'],
  '👎': ['thumbs down', 'dislike', 'no', 'bad'],
  '✊': ['fist', 'punch'],
  '👊': ['punch', 'fist bump'],
  '🤛': ['fist left'],
  '🤜': ['fist right'],
  '👏': ['clap', 'applause'],
  '🙌': ['raised hands', 'celebration'],
  '👐': ['open hands'],
  '🤲': ['palms up'],
  '🤝': ['handshake', 'deal'],
  '🙏': ['pray', 'thanks', 'please', 'namaste'],
  '✍️': ['write', 'writing'],
  '💅': ['nail polish'],
  '🤳': ['selfie'],
  '💪': ['muscle', 'strong', 'flex', 'bicep'],
  '❤️': ['heart', 'love', 'red'],
  '🧡': ['heart', 'orange'],
  '💛': ['heart', 'yellow'],
  '💚': ['heart', 'green'],
  '💙': ['heart', 'blue'],
  '💜': ['heart', 'purple'],
  '🖤': ['heart', 'black'],
  '🤍': ['heart', 'white'],
  '🤎': ['heart', 'brown'],
  '💔': ['broken heart', 'heartbreak'],
  '💕': ['hearts', 'love'],
  '💖': ['sparkling heart', 'love'],
  '💗': ['growing heart', 'love'],
  '💘': ['cupid', 'arrow', 'heart'],
  '💝': ['gift heart', 'love'],
  '💞': ['revolving hearts', 'love'],
  '💓': ['heartbeat', 'love'],
  '💟': ['heart decoration', 'love'],
  '🔥': ['fire', 'hot', 'lit'],
  '⭐': ['star'],
  '🌟': ['star', 'glowing'],
  '✨': ['sparkles', 'magic', 'stars'],
  '💯': ['hundred', '100', 'perfect'],
  '✅': ['check', 'done', 'yes'],
  '❌': ['x', 'no', 'wrong'],
  '❓': ['question'],
  '❗': ['exclamation'],
  '💬': ['speech bubble', 'comment', 'chat'],
  '👀': ['eyes', 'look', 'see'],
  '👁️': ['eye'],
  '👅': ['tongue'],
  '👄': ['lips', 'mouth', 'kiss'],
  '🐶': ['dog', 'puppy'],
  '🐱': ['cat', 'kitty'],
  '🐭': ['mouse'],
  '🐹': ['hamster'],
  '🐰': ['rabbit', 'bunny'],
  '🦊': ['fox'],
  '🐻': ['bear'],
  '🐼': ['panda'],
  '🐨': ['koala'],
  '🐯': ['tiger'],
  '🦁': ['lion'],
  '🐮': ['cow'],
  '🐷': ['pig'],
  '🐸': ['frog'],
  '🐵': ['monkey'],
  '🙈': ['see no evil', 'monkey'],
  '🙉': ['hear no evil', 'monkey'],
  '🙊': ['speak no evil', 'monkey'],
  '🐔': ['chicken'],
  '🐧': ['penguin'],
  '🐦': ['bird'],
  '🦆': ['duck'],
  '🦅': ['eagle'],
  '🦉': ['owl'],
  '🐺': ['wolf'],
  '🐴': ['horse'],
  '🦄': ['unicorn', 'magic'],
  '🐝': ['bee', 'honeybee'],
  '🦋': ['butterfly'],
  '🐌': ['snail'],
  '🐛': ['bug', 'caterpillar'],
  '🐢': ['turtle'],
  '🐍': ['snake'],
  '🐙': ['octopus'],
  '🦐': ['shrimp'],
  '🦀': ['crab'],
  '🐠': ['fish'],
  '🐬': ['dolphin'],
  '🐳': ['whale'],
  '🦈': ['shark'],
  '🐘': ['elephant'],
  '🦒': ['giraffe'],
  '🐪': ['camel'],
  '🍎': ['apple', 'red'],
  '🍊': ['orange', 'tangerine'],
  '🍋': ['lemon'],
  '🍌': ['banana'],
  '🍉': ['watermelon'],
  '🍇': ['grapes'],
  '🍓': ['strawberry'],
  '🍑': ['peach'],
  '🍒': ['cherry', 'cherries'],
  '🥑': ['avocado'],
  '🍕': ['pizza'],
  '🍔': ['burger', 'hamburger'],
  '🍟': ['fries', 'french fries'],
  '🌭': ['hotdog', 'hot dog'],
  '🍿': ['popcorn'],
  '🍩': ['donut', 'doughnut'],
  '🍪': ['cookie'],
  '🎂': ['cake', 'birthday'],
  '🍰': ['cake', 'slice'],
  '🍫': ['chocolate'],
  '🍬': ['candy'],
  '🍭': ['lollipop'],
  '🍺': ['beer'],
  '🍻': ['beers', 'cheers'],
  '🥂': ['champagne', 'cheers', 'toast'],
  '🍷': ['wine'],
  '🍸': ['cocktail', 'martini'],
  '☕': ['coffee', 'tea', 'hot'],
  '🍵': ['tea'],
  '⚽': ['soccer', 'football'],
  '🏀': ['basketball'],
  '🏈': ['football', 'american'],
  '⚾': ['baseball'],
  '🎾': ['tennis'],
  '🏐': ['volleyball'],
  '🎱': ['pool', 'billiards', '8ball'],
  '🏓': ['ping pong', 'table tennis'],
  '🎯': ['target', 'bullseye', 'dart'],
  '🎮': ['game', 'video game', 'controller'],
  '🎲': ['dice', 'game'],
  '🎰': ['slot machine', 'casino'],
  '🏆': ['trophy', 'winner', 'champion'],
  '🥇': ['gold medal', 'first', 'winner'],
  '🥈': ['silver medal', 'second'],
  '🥉': ['bronze medal', 'third'],
  '🎤': ['microphone', 'karaoke', 'sing'],
  '🎧': ['headphones', 'music'],
  '🎵': ['music', 'note'],
  '🎶': ['music', 'notes'],
  '🎸': ['guitar'],
  '🎹': ['piano', 'keyboard'],
  '🥁': ['drum'],
  '🎺': ['trumpet'],
  '🎻': ['violin'],
  '🎬': ['movie', 'clapper', 'film'],
  '🎨': ['art', 'paint', 'palette'],
  '🚗': ['car', 'automobile'],
  '🚕': ['taxi', 'cab'],
  '🚌': ['bus'],
  '🚎': ['trolleybus'],
  '🏎️': ['racing car', 'race'],
  '🚓': ['police car'],
  '🚑': ['ambulance'],
  '🚒': ['fire truck', 'fire engine'],
  '🚲': ['bike', 'bicycle'],
  '🛵': ['scooter', 'motor'],
  '🏍️': ['motorcycle'],
  '✈️': ['airplane', 'plane', 'flight'],
  '🚀': ['rocket', 'launch', 'space'],
  '🛸': ['ufo', 'alien'],
  '🚁': ['helicopter'],
  '⛵': ['sailboat', 'boat'],
  '🚢': ['ship', 'cruise'],
  '⏰': ['alarm', 'clock', 'time'],
  '⏳': ['hourglass', 'time'],
  '🔋': ['battery'],
  '💡': ['light bulb', 'idea'],
  '🔦': ['flashlight', 'torch'],
  '💰': ['money bag', 'rich'],
  '💵': ['money', 'dollar', 'cash'],
  '💳': ['credit card'],
  '💎': ['diamond', 'gem'],
  '🔧': ['wrench', 'tool'],
  '🔨': ['hammer', 'tool'],
  '🔩': ['nut and bolt'],
  '⚙️': ['gear', 'settings'],
  '🔫': ['gun', 'pistol'],
  '💣': ['bomb'],
  '🔪': ['knife'],
  '🗡️': ['sword'],
  '🛡️': ['shield'],
  '🔮': ['crystal ball', 'magic'],
  '💊': ['pill', 'medicine'],
  '💉': ['syringe', 'vaccine', 'shot'],
  '🌡️': ['thermometer', 'temperature'],
  '🚽': ['toilet'],
  '🚿': ['shower'],
  '🛁': ['bathtub', 'bath'],
  '🔑': ['key'],
  '🗝️': ['old key'],
  '🚪': ['door'],
  '🛋️': ['couch', 'sofa'],
  '🛏️': ['bed'],
  '🎁': ['gift', 'present'],
  '🎈': ['balloon'],
  '🎉': ['party', 'celebrate', 'tada'],
  '🎊': ['confetti', 'celebrate'],
  '✉️': ['envelope', 'email', 'mail'],
  '📧': ['email', 'e-mail'],
  '📱': ['phone', 'mobile', 'cell'],
  '💻': ['laptop', 'computer'],
  '🖥️': ['computer', 'desktop'],
  '⌨️': ['keyboard'],
  '🖱️': ['mouse', 'computer'],
  '📷': ['camera'],
  '📸': ['camera', 'flash'],
  '📹': ['video camera'],
  '📺': ['tv', 'television'],
  '📻': ['radio'],
  '📞': ['phone', 'telephone'],
  '📡': ['satellite', 'antenna'],
  '📚': ['books'],
  '📖': ['book', 'open'],
  '📝': ['memo', 'note', 'write'],
  '✏️': ['pencil'],
  '🖊️': ['pen'],
  '📌': ['pushpin', 'pin'],
  '📎': ['paperclip'],
  '✂️': ['scissors', 'cut'],
  '🔍': ['search', 'magnifying glass'],
  '🔎': ['search', 'magnifying glass'],
  '🔒': ['lock', 'locked'],
  '🔓': ['unlock', 'unlocked'],
  '☀️': ['sun', 'sunny'],
  '🌙': ['moon', 'crescent'],
  '⭐': ['star'],
  '🌈': ['rainbow'],
  '☁️': ['cloud', 'cloudy'],
  '⛈️': ['storm', 'thunder'],
  '🌧️': ['rain', 'rainy'],
  '❄️': ['snow', 'snowflake', 'cold'],
  '🌊': ['wave', 'ocean', 'water'],
  '🌸': ['cherry blossom', 'flower', 'spring'],
  '🌹': ['rose', 'flower'],
  '🌻': ['sunflower', 'flower'],
  '🌺': ['hibiscus', 'flower'],
  '🌷': ['tulip', 'flower'],
  '🌱': ['seedling', 'plant', 'grow'],
  '🌲': ['evergreen', 'tree', 'pine'],
  '🌳': ['tree'],
  '🌴': ['palm tree', 'tropical'],
  '🌵': ['cactus', 'desert'],
  '🍀': ['four leaf clover', 'luck', 'lucky'],
  '🍁': ['maple leaf', 'fall', 'autumn'],
  '🍂': ['fallen leaf', 'fall', 'autumn'],
  '🍃': ['leaf', 'wind'],
  '🎄': ['christmas tree', 'xmas'],
  '🎃': ['jack o lantern', 'halloween', 'pumpkin'],
  '🎅': ['santa', 'christmas'],
  '🤶': ['mrs claus', 'christmas'],
  '🎆': ['fireworks'],
  '🎇': ['sparkler', 'fireworks'],
};

/**
 * Search emojis by keyword
 */
function searchEmojis(query: string, emojis: string[]): string[] {
  const lowerQuery = query.toLowerCase();
  return emojis.filter((emoji) => {
    const keywords = EMOJI_KEYWORDS[emoji];
    if (!keywords) return false;
    return keywords.some((kw) => kw.includes(lowerQuery));
  });
}

interface EmojiPickerProps {
  visible: boolean;
  onClose: () => void;
  onSelectEmoji: (emoji: string) => void;
  theme: any;
  recentEmojis?: string[];
  customEmojis?: Emoji[]; // Space-specific custom emojis
}

export function EmojiPicker({
  visible,
  onClose,
  onSelectEmoji,
  theme,
  recentEmojis = [],
  customEmojis = [],
}: EmojiPickerProps) {
  const [selectedCategory, setSelectedCategory] = useState<CategoryKey>(
    customEmojis.length > 0 ? 'custom' : 'smileys'
  );
  const [searchQuery, setSearchQuery] = useState('');
  const styles = createStyles(theme);

  // Convert custom emojis to PickerEmoji format
  const customPickerEmojis = useMemo((): PickerEmoji[] => {
    return customEmojis.map((e) => ({
      value: e.id, // Use ID for custom emojis (like desktop)
      isCustom: true,
      imgUrl: e.imgUrl,
      name: e.name,
    }));
  }, [customEmojis]);

  // Convert standard emojis to PickerEmoji format
  const getStandardEmojis = useCallback((emojis: string[]): PickerEmoji[] => {
    return emojis.map((e) => ({
      value: e,
      isCustom: false,
      name: e,
    }));
  }, []);

  const handleEmojiPress = useCallback((emoji: PickerEmoji) => {
    // For custom emojis, send the ID; for standard, send the character
    onSelectEmoji(emoji.value);
    onClose();
  }, [onSelectEmoji, onClose]);

  // Build categories including custom if available
  const categories = useMemo(() => {
    const standardCategories = Object.entries(EMOJI_CATEGORIES) as [keyof typeof EMOJI_CATEGORIES, typeof EMOJI_CATEGORIES[keyof typeof EMOJI_CATEGORIES]][];

    if (customEmojis.length > 0) {
      // Add custom category at the beginning (after recent)
      const result: [CategoryKey, { name: string; icon: string | React.ReactNode }][] = [
        ['recent', { name: 'Recent', icon: '🕐' }],
        ['custom', { name: 'Custom', icon: '⭐' }],
        ...standardCategories.filter(([key]) => key !== 'recent'),
      ];
      return result;
    }

    return standardCategories as [CategoryKey, { name: string; icon: string }][];
  }, [customEmojis.length]);

  // Get emojis for selected category
  const displayEmojis = useMemo((): PickerEmoji[] => {
    if (selectedCategory === 'custom') {
      return customPickerEmojis;
    }
    if (selectedCategory === 'recent') {
      return getStandardEmojis(recentEmojis);
    }
    if (selectedCategory in EMOJI_CATEGORIES) {
      return getStandardEmojis(EMOJI_CATEGORIES[selectedCategory as keyof typeof EMOJI_CATEGORIES].emojis);
    }
    return [];
  }, [selectedCategory, customPickerEmojis, recentEmojis, getStandardEmojis]);

  // Filter by search if query exists
  const filteredEmojis = useMemo((): PickerEmoji[] => {
    if (!searchQuery) return displayEmojis;

    // Get all standard emojis (deduplicated)
    const allStandardEmojis = Object.values(EMOJI_CATEGORIES)
      .flatMap(cat => cat.emojis)
      .filter((emoji, index, self) => self.indexOf(emoji) === index);

    // Search standard emojis by keywords
    const matchedStandard = searchEmojis(searchQuery, allStandardEmojis)
      .map((e): PickerEmoji => ({ value: e, isCustom: false, name: e }));

    // Search custom emojis by name
    const query = searchQuery.toLowerCase();
    const matchedCustom = customPickerEmojis.filter(
      (e) => e.name?.toLowerCase().includes(query)
    );

    return [...matchedCustom, ...matchedStandard];
  }, [searchQuery, displayEmojis, customPickerEmojis]);

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Emoji</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Search */}
          <View style={styles.searchContainer}>
            <TextInput
              style={styles.searchInput}
              placeholder="Search emoji..."
              placeholderTextColor={theme.colors.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>

          {/* Category tabs */}
          {!searchQuery && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.categoryTabs}
              contentContainerStyle={styles.categoryTabsContent}
            >
              {categories.map(([key, category]) => (
                <TouchableOpacity
                  key={key}
                  style={[
                    styles.categoryTab,
                    selectedCategory === key && styles.categoryTabActive,
                  ]}
                  onPress={() => setSelectedCategory(key)}
                >
                  <Text style={styles.categoryTabEmoji}>{category.icon}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          {/* Emoji grid */}
          <ScrollView
            style={styles.emojiGrid}
            contentContainerStyle={styles.emojiGridContent}
          >
            {filteredEmojis.length === 0 ? (
              <Text style={styles.emptyText}>
                {selectedCategory === 'recent'
                  ? 'No recent emojis'
                  : selectedCategory === 'custom'
                  ? 'No custom emojis'
                  : 'No emojis found'}
              </Text>
            ) : (
              <View style={styles.emojiRow}>
                {filteredEmojis.map((emoji, index) => (
                  <TouchableOpacity
                    key={`${emoji.value}-${index}`}
                    style={styles.emojiButton}
                    onPress={() => handleEmojiPress(emoji)}
                  >
                    {emoji.isCustom && emoji.imgUrl ? (
                      <Image
                        source={{ uri: emoji.imgUrl }}
                        style={styles.customEmojiImage}
                        resizeMode="contain"
                      />
                    ) : (
                      <Text style={styles.emoji}>{emoji.value}</Text>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (theme: any) => StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  container: {
    backgroundColor: theme.colors.surface1 ?? theme.colors.background,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '60%',
    minHeight: 300,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border ?? theme.colors.surface3,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.textStrong ?? theme.colors.textMain,
  },
  closeButton: {
    padding: 4,
  },
  closeButtonText: {
    fontSize: 20,
    color: theme.colors.textMuted,
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  searchInput: {
    backgroundColor: theme.colors.surface2 ?? theme.colors.surface3,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 16,
    color: theme.colors.textMain,
  },
  categoryTabs: {
    maxHeight: 44,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border ?? theme.colors.surface3,
  },
  categoryTabsContent: {
    paddingHorizontal: 8,
  },
  categoryTab: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginHorizontal: 2,
    borderRadius: 8,
  },
  categoryTabActive: {
    backgroundColor: theme.colors.surface3 ?? theme.colors.surface2,
  },
  categoryTabEmoji: {
    fontSize: 22,
  },
  emojiGrid: {
    flex: 1,
  },
  emojiGridContent: {
    padding: 8,
  },
  emojiRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  emojiButton: {
    width: '12.5%', // 8 columns
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emoji: {
    fontSize: 28,
  },
  customEmojiImage: {
    width: 28,
    height: 28,
    borderRadius: 4,
  },
  emptyText: {
    textAlign: 'center',
    color: theme.colors.textMuted,
    marginTop: 24,
    fontSize: 14,
  },
});

export default EmojiPicker;
