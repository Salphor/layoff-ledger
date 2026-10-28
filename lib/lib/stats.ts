// National labor-market figures from the U.S. Bureau of Labor Statistics (JOLTS).
// Update this file when BLS publishes the next release (usually the last
// Tuesday of the month, ~5 weeks after the reference month).
// Source: https://www.bls.gov/news.release/jolts.nr0.htm

export const JOLTS = {
  period: 'August 2026',
  released: 'Sep 29, 2026',
  sourceUrl: 'https://www.bls.gov/news.release/jolts.nr0.htm',
  stats: [
    { label: 'Layoffs & discharges', value: '1.64M', note: 'Down from 1.70M in July' },
    { label: 'Layoffs & discharges rate', value: '1.0%', note: 'Down from 1.1% in July' },
    { label: 'Job openings', value: '7.1M', note: 'Little changed from July' },
    { label: 'Quits', value: '3.1M', note: 'Unchanged from July' },
  ],
} as const
