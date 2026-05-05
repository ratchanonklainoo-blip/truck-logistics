import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Sarabun', 'sans-serif'],
        sarabun: ['Sarabun', 'sans-serif'],
      },
      colors: {
        navy: {
          50:  '#f0f4f9',
          100: '#d9e4f0',
          200: '#b3c8e1',
          300: '#8dacd1',
          400: '#6790c2',
          500: '#4174b2',
          600: '#2e5d9a',
          700: '#1e3a5f',  // primary navy
          800: '#172d4a',
          900: '#0f2035',
        },
      },
      screens: {
        'print': { raw: 'print' },
      },
    },
  },
  plugins: [],
};

export default config;
