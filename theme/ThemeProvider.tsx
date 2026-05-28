import React, { createContext, useCallback, useContext, useMemo, useState, ReactNode } from 'react';
import { useColorScheme as useDeviceColorScheme } from 'react-native';
import { Theme } from '@react-navigation/native';
import { LightTheme, DarkTheme, createTheme, AccentColor } from './themes';

type ThemeContextType = {
  theme: ReturnType<typeof createTheme>;
  isDark: boolean;
  accentColor: AccentColor;
  setIsDark: (isDark: boolean) => void;
  setAccentColor: (color: AccentColor) => void;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

type ThemeProviderProps = {
  children: ReactNode;
  defaultAccentColor?: AccentColor;
  forceTheme?: 'light' | 'dark' | null;
};

export const CustomThemeProvider: React.FC<ThemeProviderProps> = ({ 
  children, 
  defaultAccentColor = 'blue',
  forceTheme = null 
}) => {
  const deviceColorScheme = useDeviceColorScheme();
  const [isDarkOverride, setIsDarkOverride] = useState<boolean | null>(null);
  const [accentColor, setAccentColor] = useState<AccentColor>(defaultAccentColor);

  const isDark = forceTheme
    ? forceTheme === 'dark'
    : isDarkOverride !== null
      ? isDarkOverride
      : deviceColorScheme === 'dark';

  const theme = useMemo(() => createTheme(isDark, accentColor), [isDark, accentColor]);

  const toggleTheme = useCallback(() => {
    setIsDarkOverride(prev => prev === null ? !isDark : !prev);
  }, [isDark]);

  const setIsDarkCb = useCallback((dark: boolean) => {
    setIsDarkOverride(dark);
  }, []);

  const value = useMemo(() => ({
    theme,
    isDark,
    accentColor,
    setIsDark: setIsDarkCb,
    setAccentColor,
    toggleTheme,
  }), [theme, isDark, accentColor, setIsDarkCb, setAccentColor, toggleTheme]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};