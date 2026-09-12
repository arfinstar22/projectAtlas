/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // ATLAS Dark Green Theme
        atlas: {
          50: '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#86efac',
          400: '#4ade80',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d',
          800: '#166534',
          900: '#14532d',
          950: '#052e16',
        },
        // Dark backgrounds
        dark: {
          50: '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#86efac',
          400: '#4ade80',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d',
          800: '#166534',
          900: '#14532d',
          950: '#052e16',
        },
        // Surface colors
        surface: {
          950: '#050a07',
          900: '#0a120d',
          850: '#0d1812',
          800: '#0f1a13',
          750: '#111d14',
          700: '#132219',
          650: '#162a1c',
          600: '#1a2e20',
          550: '#1d3523',
          500: '#1f3a26',
          400: '#2a4a3a',
          300: '#3a5a4a',
        },
        // Border colors
        border: {
          dark: '#1e3a2a',
          DEFAULT: '#2a4a3a',
          light: '#3a5a4a',
          neon: '#00ff88',
        },
        // Primary accent - Neon Green
        primary: {
          50: '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#86efac',
          400: '#4ade80',
          500: '#22c55e',
          600: '#16a34a',
          650: '#14b84a',
          700: '#15803d',
          800: '#166534',
          900: '#14532d',
          950: '#052e16',
          neon: '#00ff88',
          'neon-dim': '#00cc6a',
        },
      },
      textColor: {
        surface: {
          950: '#050a07',
          900: '#0a120d',
          850: '#0d1812',
          800: '#0f1a13',
          750: '#111d14',
          700: '#132219',
          650: '#162a1c',
          600: '#1a2e20',
          550: '#1d3523',
          500: '#1f3a26',
          400: '#2a4a3a',
          300: '#3a5a4a',
          100: '#f5f7f6',
        },
      },
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
        ],
        mono: [
          'JetBrains Mono',
          'Fira Code',
          'Consolas',
          'Monospace',
        ],
      },
      boxShadow: {
        'primary': '0 4px 14px 0 rgb(34 197 94 / 0.3)',
        'primary-hover': '0 6px 20px 0 rgb(34 197 94 / 0.4)',
        'neon': '0 0 20px rgb(0 255 136 / 0.4)',
        'neon-sm': '0 0 10px rgb(0 255 136 / 0.3)',
      },
      animation: {
        'fade-in': 'fadeIn 200ms ease-out',
        'slide-in': 'slideIn 200ms ease-out',
        'slide-up': 'slideUp 200ms ease-out',
        'pulse-neon': 'pulseNeon 2s ease-in-out infinite',
      },
      keyframes: {
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
        pulseNeon: {
          '0%, 100%': { boxShadow: '0 0 5px rgb(0 255 136 / 0.3), 0 0 10px rgb(0 255 136 / 0.2)' },
          '50%': { boxShadow: '0 0 20px rgb(0 255 136 / 0.5), 0 0 30px rgb(0 255 136 / 0.3)' },
        },
      },
    },
  },
  plugins: [],
  darkMode: 'class'
}