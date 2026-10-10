import type { Config } from 'tailwindcss'

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
        brand: {
          green: '#2C5F3E',
          'green-dark': '#1F4A2F',
          gold: '#CBA95D',
          canvas: '#F1F1F1',
          tan: '#DDC6A4',
          navy: '#142238',
          'navy-light': '#1E3250',
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(20,34,56,0.04), 0 1px 3px rgba(20,34,56,0.06)',
        lift: '0 4px 6px -1px rgba(20,34,56,0.06), 0 12px 24px -6px rgba(20,34,56,0.12)',
      },
    },
  },
  plugins: [],
}
export default config