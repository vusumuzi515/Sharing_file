/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx,css}'],
  theme: {
    extend: {
      colors: {
        /** Monochrome corporate theme (Inyatsi Group Holdings artwork). */
        brand: {
          DEFAULT: '#0a0a0a',
          light: '#262626',
          dark: '#000000',
          muted: '#737373',
          line: '#d4d4d4',
          wash: '#f5f5f5',
        },
        primary: { DEFAULT: '#0a0a0a', light: '#262626' },
        accent: { DEFAULT: '#404040', light: '#e5e5e5' },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        serif: ['Crimson Pro', 'Georgia', 'Times New Roman', 'serif'],
      },
      boxShadow: {
        'card': '0 1px 3px 0 rgb(0 0 0 / 0.05), 0 1px 2px -1px rgb(0 0 0 / 0.05)',
        'card-hover': '0 4px 6px -1px rgb(0 0 0 / 0.07), 0 2px 4px -2px rgb(0 0 0 / 0.05)',
      },
    },
  },
  plugins: [],
};
