import { useTheme } from '@react-navigation/native';

export function useCurrentTheme() {
  const theme = useTheme();
  return theme;
}