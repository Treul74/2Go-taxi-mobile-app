/**
 * 2Go Design System - Color Palette & Theme Configuration
 * 
 * Primary:   #26344F   // Headings, primary text, main buttons
 * Accent:    #FE5035   // CTA buttons, active states, brand highlights
 * Background:#E7F1F9   // App background
 * Secondary: #7B8387   // Metadata, placeholders
 * Success:   #00D26A
 * Warning:   #FFB800
 * Error:     #EF4444
 */

import { Platform } from 'react-native';

// 2Go Brand Colors
export const colors = {
  primary: '#26344F',
  accent: '#FE5035',
  background: '#E7F1F9',
  secondary: '#7B8387',
  success: '#00D26A',
  warning: '#FFB800',
  error: '#EF4444',
  white: '#FFFFFF',
  black: '#000000',
  // Shades for UI depth
  primaryLight: '#3D4F6A',
  primaryDark: '#1A2435',
  accentLight: '#FF7A64',
  accentDark: '#D9412A',
  backgroundDark: '#D4E5F0',
  gray: {
    50: '#F8FAFC',
    100: '#F1F5F9',
    200: '#E2E8F0',
    300: '#CBD5E1',
    400: '#94A3B8',
    500: '#64748B',
    600: '#475569',
    700: '#334155',
    800: '#1E293B',
    900: '#0F172A',
  },
} as const;

// Tab bar colors using 2Go palette
export const Colors = {
  light: {
    text: colors.primary,
    background: colors.background,
    tint: colors.accent,
    icon: colors.secondary,
    tabIconDefault: colors.secondary,
    tabIconSelected: colors.accent,
    card: colors.white,
    border: colors.gray[200],
  },
  dark: {
    text: colors.white,
    background: colors.primaryDark,
    tint: colors.accent,
    icon: colors.gray[400],
    tabIconDefault: colors.gray[400],
    tabIconSelected: colors.accent,
    card: colors.gray[800],
    border: colors.gray[700],
  },
};

// Design tokens
export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  '2xl': 48,
  '3xl': 64,
} as const;

export const borderRadius = {
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  '2xl': 40,
  '3xl': 48,
  full: 9999,
} as const;

export const shadows = {
  sm: {
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  md: {
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
  lg: {
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 16,
    elevation: 8,
  },
  xl: {
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.20,
    shadowRadius: 24,
    elevation: 12,
  },
} as const;

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});

// Animation durations
export const animation = {
  fast: 150,
  normal: 300,
  slow: 500,
} as const;
