import React, { createContext, useContext, useState, ReactNode } from 'react';
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

  const theme = createTheme(isDark, accentColor);

  const toggleTheme = () => {
    setIsDarkOverride(prev => prev === null ? !isDark : !prev);
  };

  const setIsDark = (dark: boolean) => {
    setIsDarkOverride(dark);
  };

  return (
    <ThemeContext.Provider 
      value={{
        theme,
        isDark,
        accentColor,
        setIsDark,
        setAccentColor,
        toggleTheme,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};