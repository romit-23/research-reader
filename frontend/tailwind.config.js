/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        sepia: {
          50: '#fbf8f1',
          100: '#f6f0e2',
          200: '#eddcc1',
          300: '#e3c59d',
          400: '#d7a876',
          500: '#cc8e55',
          600: '#bf7645',
          700: '#9f5e3a',
          800: '#804c33',
          900: '#43261a',
        },
      },
    },
  },
  plugins: [],
}
