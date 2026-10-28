import type { Config } from 'tailwindcss'

// Signal design system (LayoffLedger style guide, direction G).
// Black, white and one electric lime. Square corners, 2px black rules.
const config: Config = {
  content: [
    './app/*.{js,ts,jsx,tsx,mdx}',
    './app/components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/layoffs/**/*.{js,ts,jsx,tsx,mdx}',
    './app/companies/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        ink: '#0A0A0A', // text, rules, buttons, bands
        muted: '#555555', // secondary text (7.5:1 on white)
        bone: '#F2F2EF', // page background
        lime: '#C6F432', // button text on black, marker behind numbers. Never text on white.
        'lime-tint': '#EEF9C8', // "what to do next" block
        ultra: '#2F2FE4', // links and source names only
        grey: '#BDBDB6', // secondary text on black
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
