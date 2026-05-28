/**
 * IconPicker - Modal for selecting channel icons and colors
 */

import type { AppTheme } from '@/theme';
import React, { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { BaseModal } from '@/components/shared';
import { IconSymbol, type IconSymbolName } from '@/components/ui/IconSymbol';

const ICON_OPTIONS: IconSymbolName[] = [
  'number',
  'bubble.left',
  'star.fill',
  'heart.fill',
  'bolt.fill',
  'lock.fill',
  'globe',
  'camera.fill',
  'play.fill',
  'magnifyingglass',
  'bookmark.fill',
  'bell.fill',
  'person.2.fill',
  'shield.fill',
  'sparkles',
  'doc.text.fill',
  'link',
  'tag.fill',
  'chart.bar.fill',
  'gearshape.fill',
];

const COLOR_OPTIONS = [
  '#3b82f6',
  '#ef4444',
  '#22c55e',
  '#f59e0b',
  '#8b5cf6',
  '#ec4899',
  '#06b6d4',
  '#f97316',
];

interface IconPickerProps {
  visible: boolean;
  onClose: () => void;
  selectedIcon?: string;
  selectedColor?: string;
  onSelect: (icon: string, color: string) => void;
  onClear: () => void;
  theme: AppTheme;
}

export function IconPicker({
  visible,
  onClose,
  selectedIcon,
  selectedColor,
  onSelect,
  onClear,
  theme,
}: IconPickerProps) {
  const [pickedIcon, setPickedIcon] = useState<string>(selectedIcon || 'number');
  const [pickedColor, setPickedColor] = useState<string>(selectedColor || COLOR_OPTIONS[0]);
  const styles = createStyles(theme);

  const handleConfirm = () => {
    onSelect(pickedIcon, pickedColor);
    onClose();
  };

  const handleClear = () => {
    onClear();
    onClose();
  };

  return (
    <BaseModal visible={visible} onClose={onClose} height={0.55}>
      <View style={styles.container}>
        <Text style={styles.title}>Channel Icon</Text>

        {/* Preview */}
        <View style={styles.previewContainer}>
          <View style={[styles.previewCircle, { backgroundColor: pickedColor + '20' }]}>
            <IconSymbol name={pickedIcon as IconSymbolName} size={28} color={pickedColor} />
          </View>
        </View>

        {/* Icon Grid */}
        <Text style={styles.sectionLabel}>Icon</Text>
        <ScrollView style={styles.iconGrid} showsVerticalScrollIndicator={false}>
          <View style={styles.gridRow}>
            {ICON_OPTIONS.map((icon) => (
              <TouchableOpacity
                key={icon}
                style={[
                  styles.iconCell,
                  pickedIcon === icon && { backgroundColor: pickedColor + '20', borderColor: pickedColor },
                ]}
                onPress={() => setPickedIcon(icon)}
              >
                <IconSymbol
                  name={icon}
                  size={20}
                  color={pickedIcon === icon ? pickedColor : theme.colors.textMuted}
                />
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        {/* Color Row */}
        <Text style={styles.sectionLabel}>Color</Text>
        <View style={styles.colorRow}>
          {COLOR_OPTIONS.map((color) => (
            <TouchableOpacity
              key={color}
              style={[
                styles.colorSwatch,
                { backgroundColor: color },
                pickedColor === color && styles.colorSwatchActive,
              ]}
              onPress={() => setPickedColor(color)}
            />
          ))}
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <TouchableOpacity style={styles.clearButton} onPress={handleClear}>
            <Text style={styles.clearButtonText}>Reset</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.confirmButton, { backgroundColor: pickedColor }]} onPress={handleConfirm}>
            <Text style={styles.confirmButtonText}>Apply</Text>
          </TouchableOpacity>
        </View>
      </View>
    </BaseModal>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    container: {
      paddingHorizontal: 20,
      paddingTop: 8,
      flex: 1,
    },
    title: {
      fontSize: 18,
      fontFamily: theme.fonts.bold.fontFamily,
      fontWeight: theme.fonts.bold.fontWeight,
      color: theme.colors.textMain,
      textAlign: 'center',
      marginBottom: 16,
    },
    previewContainer: {
      alignItems: 'center',
      marginBottom: 16,
    },
    previewCircle: {
      width: 56,
      height: 56,
      borderRadius: 28,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sectionLabel: {
      fontSize: 12,
      fontFamily: theme.fonts.bold.fontFamily,
      fontWeight: theme.fonts.bold.fontWeight,
      color: theme.colors.textMuted,
      letterSpacing: 0.5,
      marginBottom: 8,
      textTransform: 'uppercase',
    },
    iconGrid: {
      maxHeight: 160,
      marginBottom: 16,
    },
    gridRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    iconCell: {
      width: 44,
      height: 44,
      borderRadius: 10,
      backgroundColor: theme.colors.surface3,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: 'transparent',
    },
    colorRow: {
      flexDirection: 'row',
      gap: 10,
      marginBottom: 20,
    },
    colorSwatch: {
      width: 32,
      height: 32,
      borderRadius: 16,
    },
    colorSwatchActive: {
      borderWidth: 3,
      borderColor: '#fff',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.3,
      shadowRadius: 3,
      elevation: 4,
    },
    actions: {
      flexDirection: 'row',
      gap: 12,
    },
    clearButton: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 10,
      backgroundColor: theme.colors.surface3,
      alignItems: 'center',
    },
    clearButtonText: {
      fontSize: 15,
      fontFamily: theme.fonts.medium.fontFamily,
      fontWeight: theme.fonts.medium.fontWeight,
      color: theme.colors.textMain,
    },
    confirmButton: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 10,
      alignItems: 'center',
    },
    confirmButtonText: {
      fontSize: 15,
      fontFamily: theme.fonts.medium.fontFamily,
      fontWeight: theme.fonts.medium.fontWeight,
      color: '#fff',
    },
  });
