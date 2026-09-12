/**
 * ATLAS Design System
 * 
 * A consistent design system for the ATLAS Document Intelligence application.
 * Ensures visual coherence, accessibility, and maintainability across all components.
 */

// ============================================
// COLORS
// ============================================

export const colors = {
  // Primary brand colors
  primary: {
    50: '#eff6ff',
    100: '#dbeafe',
    200: '#bfdbfe',
    300: '#93c5fd',
    400: '#60a5fa',
    500: '#3b82f6',
    600: '#2563eb',
    700: '#1d4ed8',
    800: '#1e40af',
    900: '#1e3a5f',
    950: '#172554',
  },

  // Neutral grays
  neutral: {
    0: '#ffffff',
    50: '#fafafa',
    100: '#f5f5f5',
    200: '#e5e5e5',
    300: '#d4d4d4',
    400: '#a3a3a3',
    500: '#737373',
    600: '#525252',
    700: '#404040',
    800: '#262626',
    900: '#171717',
    950: '#0a0a0a',
  },

  // Semantic colors
  success: {
    light: '#22c55e',
    DEFAULT: '#16a34a',
    dark: '#15803d',
    bg: '#f0fdf4',
    bgDark: '#052e16',
    border: '#bbf7d0',
    borderDark: '#14532d',
  },

  warning: {
    light: '#facc15',
    DEFAULT: '#eab308',
    dark: '#ca8a04',
    bg: '#fefce8',
    bgDark: '#3f3100',
    border: '#fef08a',
    borderDark: '#713f12',
  },

  error: {
    light: '#f87171',
    DEFAULT: '#ef4444',
    dark: '#dc2626',
    bg: '#fef2f2',
    bgDark: '#450a0a',
    border: '#fecaca',
    borderDark: '#7f1d1d',
  },

  info: {
    light: '#38bdf8',
    DEFAULT: '#0ea5e9',
    dark: '#0284c7',
    bg: '#eff6ff',
    bgDark: '#082f49',
    border: '#bae6fd',
    borderDark: '#0c4a6e',
  },
} as const;

// ============================================
// SPACING
// ============================================

export const spacing = {
  0: '0',
  1: '0.25rem',   // 4px
  2: '0.5rem',    // 8px
  3: '0.75rem',   // 12px
  4: '1rem',      // 16px
  5: '1.25rem',   // 20px
  6: '1.5rem',    // 24px
  8: '2rem',      // 32px
  10: '2.5rem',   // 40px
  12: '3rem',     // 48px
  16: '4rem',     // 64px
  20: '5rem',     // 80px
  24: '6rem',     // 96px,
} as const;

// ============================================
// BORDER RADIUS
// ============================================

export const borderRadius = {
  none: '0',
  sm: '0.25rem',    // 4px
  DEFAULT: '0.375rem', // 6px
  md: '0.5rem',     // 8px
  lg: '0.75rem',    // 12px
  xl: '1rem',       // 16px
  '2xl': '1.5rem',  // 24px
  full: '9999px',
} as const;

// ============================================
// SHADOWS
// ============================================

export const shadows = {
  none: 'none',
  sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
  DEFAULT: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
  md: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
  lg: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
  xl: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
  '2xl': '0 25px 50px -12px rgb(0 0 0 / 0.25)',
  inner: 'inset 0 2px 4px 0 rgb(0 0 0 / 0.05)',
  
  // Colored shadows for primary actions
  primary: '0 4px 14px 0 rgb(59 130 246 / 0.3)',
  primaryHover: '0 6px 20px 0 rgb(59 130 246 / 0.4)',
} as const;

// ============================================
// TYPOGRAPHY
// ============================================

export const typography = {
  fontFamily: {
    sans: [
      'Inter',
      'system-ui',
      '-apple-system',
      'BlinkMacSystemFont',
      'Segoe UI',
      'Roboto',
      'Helvetica Neue',
      'Arial',
      'sans-serif',
    ].join(', '),
    mono: [
      'JetBrains Mono',
      'Fira Code',
      'Consolas',
      'Monospace',
    ].join(', '),
  },

  fontSize: {
    xs: ['0.75rem', { lineHeight: '1rem' }],       // 12px
    sm: ['0.875rem', { lineHeight: '1.25rem' }],   // 14px
    base: ['1rem', { lineHeight: '1.5rem' }],      // 16px
    lg: ['1.125rem', { lineHeight: '1.75rem' }],   // 18px
    xl: ['1.25rem', { lineHeight: '1.75rem' }],    // 20px
    '2xl': ['1.5rem', { lineHeight: '2rem' }],     // 24px
    '3xl': ['1.875rem', { lineHeight: '2.25rem' }], // 30px
    '4xl': ['2.25rem', { lineHeight: '2.5rem' }],  // 36px
    '5xl': ['3rem', { lineHeight: '1' }],          // 48px
  },

  fontWeight: {
    normal: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
  },

  lineHeight: {
    tight: '1.25',
    normal: '1.5',
    relaxed: '1.75',
  },
} as const;

// ============================================
// TRANSITIONS
// ============================================

export const transitions = {
  fast: '150ms ease',
  DEFAULT: '200ms ease',
  slow: '300ms ease',
} as const;

// ============================================
// Z-INDEX
// ============================================

export const zIndex = {
  hide: -1,
  base: 0,
  dropdown: 100,
  sticky: 200,
  fixed: 300,
  modalBackdrop: 400,
  modal: 500,
  popover: 600,
  tooltip: 700,
  toast: 800,
} as const;

// ============================================
// BREAKPOINTS
// ============================================

export const breakpoints = {
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px',
} as const;

// ============================================
// COMPONENT STYLE VARIANTS
// ============================================

export const buttonVariants = {
  primary: `
    inline-flex items-center justify-center gap-2
    px-4 py-2.5 text-sm font-medium text-white
    bg-primary-600 border border-transparent
    rounded-lg shadow-sm
    hover:bg-primary-700 hover:shadow-primary
    focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2
    disabled:opacity-50 disabled:cursor-not-allowed
    transition-colors duration-200
  `,
  secondary: `
    inline-flex items-center justify-center gap-2
    px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300
    bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600
    rounded-lg shadow-sm
    hover:bg-gray-50 dark:hover:bg-gray-700
    focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2
    disabled:opacity-50 disabled:cursor-not-allowed
    transition-colors duration-200
  `,
  outline: `
    inline-flex items-center justify-center gap-2
    px-4 py-2.5 text-sm font-medium text-primary-600 dark:text-primary-400
    bg-transparent border border-primary-600 dark:border-primary-400
    rounded-lg
    hover:bg-primary-50 dark:hover:bg-primary-900/20
    focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2
    disabled:opacity-50 disabled:cursor-not-allowed
    transition-colors duration-200
  `,
  ghost: `
    inline-flex items-center justify-center gap-2
    px-4 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-400
    bg-transparent border border-transparent
    rounded-lg
    hover:bg-gray-100 dark:hover:bg-gray-800
    focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2
    disabled:opacity-50 disabled:cursor-not-allowed
    transition-colors duration-200
  `,
  danger: `
    inline-flex items-center justify-center gap-2
    px-4 py-2.5 text-sm font-medium text-white
    bg-error-DEFAULT border border-transparent
    rounded-lg shadow-sm
    hover:bg-error-dark hover:shadow-[0_4px_14px_0_rgb(239_68_68_/_0.3)]
    focus:outline-none focus:ring-2 focus:ring-error-DEFAULT focus:ring-offset-2
    disabled:opacity-50 disabled:cursor-not-allowed
    transition-colors duration-200
  `,
} as const;

export const buttonSizes = {
  sm: 'px-3 py-1.5 text-xs gap-1.5',
  md: 'px-4 py-2.5 text-sm gap-2',
  lg: 'px-6 py-3 text-base gap-2',
  icon: 'p-2.5',
} as const;

export const inputVariants = {
  default: `
    w-full px-3 py-2.5 text-sm text-gray-900 dark:text-gray-100
    bg-white dark:bg-gray-700
    border border-gray-300 dark:border-gray-600
    rounded-lg
    placeholder:text-gray-400 dark:placeholder:text-gray-500
    focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent
    disabled:opacity-50 disabled:cursor-not-allowed
    transition-colors duration-200
  `,
  error: `
    w-full px-3 py-2.5 text-sm text-gray-900 dark:text-gray-100
    bg-white dark:bg-gray-700
    border border-error-DEFAULT
    rounded-lg
    placeholder:text-gray-400 dark:placeholder:text-gray-500
    focus:outline-none focus:ring-2 focus:ring-error-DEFAULT focus:border-transparent
    transition-colors duration-200
  `,
} as const;

export const cardVariants = {
  default: `
    bg-white dark:bg-gray-800
    border border-gray-200 dark:border-gray-700
    rounded-xl shadow-sm
  `,
  elevated: `
    bg-white dark:bg-gray-800
    border border-gray-200 dark:border-gray-700
    rounded-xl shadow-lg
  `,
  outlined: `
    bg-white dark:bg-gray-800
    border-2 border-gray-200 dark:border-gray-700
    rounded-xl
  `,
} as const;

export const badgeVariants = {
  default: `
    inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full
    bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300
  `,
  primary: `
    inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full
    bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300
  `,
  success: `
    inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full
    bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400
  `,
  warning: `
    inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full
    bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400
  `,
  error: `
    inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full
    bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400
  `,
  info: `
    inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full
    bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400
  `,
} as const;

// ============================================
// LAYOUT CONSTANTS
// ============================================

export const layout = {
  sidebar: {
    width: '16rem',      // 256px (w-64)
    collapsedWidth: '4rem', // 64px (w-16)
  },
  header: {
    height: '4rem',      // 64px (h-16)
  },
  content: {
    maxWidth: '80rem',   // 1280px (max-w-7xl)
    padding: '1.5rem',   // 24px (p-6)
  },
  container: {
    padding: '1rem',     // 16px (p-4)
    paddingMd: '1.5rem', // 24px (p-6)
    paddingLg: '2rem',   // 32px (p-8)
  },
} as const;

// ============================================
// ANIMATION KEYFRAMES (for Tailwind config)
// ============================================

export const keyframes = {
  spin: {
    '0%': { transform: 'rotate(0deg)' },
    '100%': { transform: 'rotate(360deg)' },
  },
  pulse: {
    '0%, 100%': { opacity: '1' },
    '50%': { opacity: '0.5' },
  },
  bounce: {
    '0%, 100%': { transform: 'translateY(-25%)', animationTimingFunction: 'cubic-bezier(0.8, 0, 1, 1)' },
    '50%': { transform: 'translateY(0)', animationTimingFunction: 'cubic-bezier(0, 0, 0.2, 1)' },
  },
  fadeIn: {
    '0%': { opacity: '0' },
    '100%': { opacity: '1' },
  },
  slideIn: {
    '0%': { transform: 'translateX(-10px)', opacity: '0' },
    '100%': { transform: 'translateX(0)', opacity: '1' },
  },
  slideUp: {
    '0%': { transform: 'translateY(10px)', opacity: '0' },
    '100%': { transform: 'translateY(0)', opacity: '1' },
  },
} as const;

// ============================================
// UTILITY FUNCTIONS
// ============================================

import { clsx, type ClassValue } from 'clsx';

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

// Generate consistent focus styles
export function focusRing(color: 'primary' | 'error' | 'success' = 'primary') {
  const colorMap = {
    primary: 'focus:ring-primary-500',
    error: 'focus:ring-error-DEFAULT',
    success: 'focus:ring-green-500',
  };
  return `focus:outline-none focus:ring-2 ${colorMap[color]} focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-gray-900`;
}

// Generate consistent transition
export function transition(props: string[] = ['all'], duration: keyof typeof transitions = 'DEFAULT') {
  return `transition-${props.join(' transition-')} duration-${duration === 'fast' ? '150' : duration === 'slow' ? '300' : '200'} ease`;
}

// Generate consistent container padding
export function containerPadding(size: 'sm' | 'md' | 'lg' = 'md') {
  const paddingMap = {
    sm: 'p-4',
    md: 'p-6',
    lg: 'p-8',
  };
  return paddingMap[size];
}

export default {
  colors,
  spacing,
  borderRadius,
  shadows,
  typography,
  transitions,
  zIndex,
  breakpoints,
  buttonVariants,
  buttonSizes,
  inputVariants,
  cardVariants,
  badgeVariants,
  layout,
  keyframes,
  cn,
  focusRing,
  transition,
  containerPadding,
};