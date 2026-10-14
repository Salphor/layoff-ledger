import type { Source } from './types'

// Official state WARN registries. The collector stores WARN sources with
// placeholder ".local" URLs, so we link to the real government pages instead.
const WARN_REGISTRIES: Record<string, { name: string; url: string }> = {
  wa: { name: 'Washington State WARN Database', url: 'https://esd.wa.gov/about-employees/WARN' },
  ca: { name: 'California EDD WARN Report', url: 'https://edd.ca.gov/en/jobs_and_training/layoff_services_warn' },
  ny: { name: 'New York State WARN Dashboard', url: 'https://dol.ny.gov/warn-dashboard' },
  tx: {
    name: 'Texas Workforce Commission WARN Notices',
    url: 'https://www.twc.texas.gov/businesses/worker-adjustment-and-retraining-notification-warn-notices',
  },
}

export interface DisplaySource {
  key: string
  kind: 'warn' | 'news'
  label: string // publisher / registry name
  title: string | null
  href: string | null
  date: string | null
  count?: number // number of WARN filings collapsed into this row
}

export function isSafeUrl(url: string | null | undefined): url is string {
  if (!url) return false
  try {
    const p = new URL(url)
    return (p.protocol === 'http:' || p.protocol === 'https:') && !p.hostname.endsWith('.local')
  } catch {
    return false
  }
}

export function isWarnSource(s: Source): boolean {
  return !!s.source_key && s.source_key.startsWith('warn-')
}

function warnState(s: Source): string {
  return (s.warn_state || s.source_key?.replace('warn-', '') || '').toLowerCase()
}

// Turns raw source rows into clean, clickable entries: official WARN filings
// are grouped per state (one link to the registry), news sources stay separate.
export function toDisplaySources(sources: Source[] = []): DisplaySource[] {
  const warnByState = new Map<string, DisplaySource>()
  const news: DisplaySource[] = []

  for (const s of sources) {
    if (isWarnSource(s)) {
      const state = warnState(s)
      const registry = WARN_REGISTRIES[state]
      const existing = warnByState.get(state)
      if (existing) {
        existing.count = (existing.count || 1) + 1
        continue
      }
      warnByState.set(state, {
        key: `warn-${state || s.source_id}`,
        kind: 'warn',
        label: registry?.name || `${state.toUpperCase() || 'State'} WARN Registry`,
        title: 'Official WARN notice filed with the state',
        href: registry?.url || null,
        date: s.published_at,
        count: 1,
      })
    } else {
      news.push({
        key: `news-${s.source_id}`,
        kind: 'news',
        label: s.publisher || 'News source',
        title: s.title,
        href: isSafeUrl(s.url) ? s.url : null,
        date: s.published_at,
      })
    }
  }

  news.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime())
  return [...Array.from(warnByState.values()), ...news]
}
