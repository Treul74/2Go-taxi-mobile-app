/** @type {import('tailwindcss').Config} */
module.exports = {
  // NativeWind v4 configuration
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      // 2Go Brand Colors
      colors: {
        primary: {
          DEFAULT: '#26344F',
          light: '#3D4F6A',
          dark: '#1A2435',
        },
        accent: {
          DEFAULT: '#FE5035',
          light: '#FF7A64',
          dark: '#D9412A',
        },
        background: {
          DEFAULT: '#E7F1F9',
          dark: '#D4E5F0',
        },
        secondary: '#7B8387',
        success: '#00D26A',
        warning: '#FFB800',
        error: '#EF4444',
      },
      // Extreme rounded corners as per design spec
      borderRadius: {
        '4xl': '32px',
        '5xl': '40px',
        '6xl': '48px',
      },
      // Soft shadow presets
      boxShadow: {
        'card': '0 4px 8px rgba(38, 52, 79, 0.12)',
        'card-lg': '0 8px 16px rgba(38, 52, 79, 0.16)',
        'card-xl': '0 12px 24px rgba(38, 52, 79, 0.20)',
        'float': '0 16px 32px rgba(38, 52, 79, 0.24)',
      },
      // Font family tokens
      fontFamily: {
        sans: ['System', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
