import type { Config } from 'tailwindcss'

// Signal design system (LayoffLedger style guide, direction G).
// Black, white and one electric lime. Square corners, 2px black rules.
const config: Config = {
  darkMode: 'class',
  content: [
    './app/*.{js,ts,jsx,tsx,mdx}',
    './app/components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/layoffs/**/*.{js,ts,jsx,tsx,mdx}',
    './app/companies/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      // Colors are CSS variables (set in app/globals.css) so the same class
      // works in light and dark mode.
      colors: {
        ink: 'rgb(var(--ink) / <alpha-value>)', // text (flips in dark mode)
        line: 'rgb(var(--line) / <alpha-value>)', // 2px rules and borders
        bone: 'rgb(var(--bone) / <alpha-value>)', // page background
        surface: 'rgb(var(--surface) / <alpha-value>)', // cards, tables, inputs
        band: 'rgb(var(--band) / <alpha-value>)', // black bands, footer, dark buttons
        muted: 'rgb(var(--muted) / <alpha-value>)', // secondary text
        'lime-tint': 'rgb(var(--lime-tint) / <alpha-value>)', // "what to do next", row hover
        ultra: 'rgb(var(--ultra) / <alpha-value>)', // links and source names
        lime: '#C6F432', // same in both modes. Never text on a light background.
        coal: '#0A0A0A', // text on lime, in both modes
        grey: '#BDBDB6', // secondary text on black bands
      },
      fontFamily: {
        sans: ['var(--font-grotesk)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'Menlo', 'monospace'],
      },
      letterSpacing: {
        giant: '-0.05em',
        display: '-0.04em',
      },
      borderWidth: {
        3: '3px',
      },
    },
  },
  plugins: [],
}
export default config
