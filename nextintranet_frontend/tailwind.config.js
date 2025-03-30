/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
      "./src/**/*.{html,ts}",
      "./node_modules/primeng/**/*.{js,ts,jsx,tsx}"
  ],
  presets: [
      require('tailwindcss-primeui')
  ],
  theme: {
      extend: {},
  },
  plugins: [],
}