import type { AppTheme } from '@/theme';
import React, { useRef, useEffect } from 'react';
import { StyleSheet, TextInput, TouchableOpacity, View, Text } from 'react-native';
import { IconSymbol } from '@/components/ui/IconSymbol';

interface SearchBarProps {
  query: string;
  onChangeQuery: (text: string) => void;
  onClose: () => void;
  resultCount: number;
  onNavigateToResult?: (index: number) => void;
  theme: AppTheme;
}

export const SearchBar = React.memo(function SearchBar({
  query,
  onChangeQuery,
  onClose,
  resultCount,
  theme,
}: SearchBarProps) {
  const inputRef = useRef<TextInput>(null);
  const styles = createStyles(theme);

  useEffect(() => {
    // Auto-focus when mounted
    const timer = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.inputRow}>
        <IconSymbol name="magnifyingglass" color={theme.colors.textMuted} size={16} />
        <TextInput
          ref={inputRef}
          style={styles.input}
          value={query}
          onChangeText={onChangeQuery}
          placeholder="Search messages..."
          placeholderTextColor={theme.colors.textMuted}
          returnKeyType="search"
          autoCapitalize="none"
          autoCorrect={false}
        />
        {query.length > 0 && (
          <Text style={styles.resultCount}>
            {resultCount} {resultCount === 1 ? 'result' : 'results'}
          </Text>
        )}
        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
          <IconSymbol name="xmark" color={theme.colors.textMuted} size={16} />
        </TouchableOpacity>
      </View>
    </View>
  );
});

const createStyles = (theme: AppTheme) => StyleSheet.create({
  container: {
    backgroundColor: theme.colors.surface3,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface5,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  input: {
    flex: 1,
    color: theme.colors.textMain,
    fontSize: 14,
    marginLeft: 8,
    fontFamily: theme.fonts.regular.fontFamily,
    paddingVertical: 2,
  },
  resultCount: {
    color: theme.colors.textMuted,
    fontSize: 12,
    marginRight: 8,
    fontFamily: theme.fonts.regular.fontFamily,
  },
  closeButton: {
    padding: 4,
  },
});

export default SearchBar;
