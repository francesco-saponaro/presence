/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        // Light Mode
        "milk": "#FAF7F2",
        "surface-light": "#EBE6DF",
        "text-dark": "#2A1800",
        // Dark Mode
        "espresso": "#261B10",
        "surface-dark": "#3A2A1A",
        "text-light": "#FDFBF7",
        // Accents
        "tan": "#D6B588",
        "greige": "#C6C0B9",
        "brown-mid": "#705E46",
        "brown-dark": "#422701",
      },
      fontFamily: {
        "serif-display": ["DMSerifDisplay-Regular"],
        "sans-body": ["DMSans-Regular"],
        "sans-medium": ["DMSans-Medium"],
        "sans-bold": ["DMSans-Bold"],
      },
    },
  },
  plugins: [],
};
