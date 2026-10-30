// Site identity. Change the name here and it updates everywhere.
export const SITE_NAME = 'LayoffLedger'
export const SITE_TAGLINE = 'Source-linked records of U.S. layoffs, and what to do next.'

export const JOBQUE_URL = 'https://jobque.ai'

// Placeholder promo details shown on company pages until the real ones exist.
// Edit these two values and every company page updates.
export const JOBQUE_COUPON = 'placeholder'
export const JOBQUE_DISCOUNT = 'placeholder' // shown as "<value>% discount"

// Date-only strings (e.g. "2026-10-09") are parsed as UTC; format in UTC so
// the displayed day never shifts by timezone.
export function formatDate(
  value: string | null | undefined,
  style: 'long' | 'short' = 'short'
): string {
  if (!value) return 'Not disclosed'
  const d = new Date(value)
  if (isNaN(d.getTime())) return 'Not disclosed'
  return d.toLocaleDateString('en-US', {
    month: style === 'long' ? 'long' : 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

// Build a safe URL to a company page. Slugs created by the collector can
// contain characters like "(", ")" and "&", so percent-encode all of them.
export function companyHref(company?: { slug?: string | null } | null): string {
  if (!company?.slug) return '/layoffs'
  const safe = encodeURIComponent(company.slug).replace(
    /[!'()*]/g,
    (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase()
  )
  return `/companies/${safe}`
}

// Locations/departments/roles are stored as JSON; normalise to string[].
export function asStringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean)
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value)
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean)
    } catch {}
  }
  return []
}

// The date an event is ordered by everywhere on the site.
export function eventSortTime(e: {
  date_announced: string | null
  announcement_date?: string | null
  notice_date: string | null
  created_at: string
}): number {
  return new Date(e.date_announced || e.announcement_date || e.notice_date || e.created_at).getTime()
}

// ---------------------------------------------------------------------------
// Per-event URLs: /companies/<company-slug>/<event-slug>
//
// A company's only layoff in a month gets "october-2026". When it has several
// in one month (often different locations), each gets the day and the place:
// "june-25-2026-kern-county-ca". Two that still match get "-2", "-3"...
// Old month-only links are redirected by the event page (eventForOldSlug).

const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
]

export interface SlugInput {
  id: string
  date_announced: string | null
  notice_date: string | null
  created_at: string
  locations?: string[] | string | null
}

// The date the URL is built from. Uses only columns every event row has.
export function slugDate(e: SlugInput): Date {
  return new Date(e.date_announced || e.notice_date || e.created_at)
}

// "Kern County, CA" -> "kern-county-ca"
function placeSlug(e: SlugInput): string {
  const first = asStringList(e.locations)[0] || ''
  return first.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)
}

export function assignEventSlugs(events: SlugInput[]): Record<string, string> {
  const sorted = [...events].sort((a, b) => {
    const d = slugDate(a).getTime() - slugDate(b).getTime()
    return d !== 0 ? d : a.id.localeCompare(b.id)
  })
  const monthKey = (d: Date) => `${d.getUTCFullYear()}-${d.getUTCMonth()}`
  const perMonth = new Map<string, number>()
  for (const e of sorted) {
    const d = slugDate(e)
    if (!isNaN(d.getTime())) perMonth.set(monthKey(d), (perMonth.get(monthKey(d)) || 0) + 1)
  }

  const used = new Set<string>()
  const out: Record<string, string> = {}
  for (const e of sorted) {
    const d = slugDate(e)
    if (isNaN(d.getTime())) {
      out[e.id] = e.id
      continue
    }
    const month = MONTHS[d.getUTCMonth()]
    const year = d.getUTCFullYear()
    let slug = `${month}-${year}`
    if ((perMonth.get(monthKey(d)) || 0) > 1) {
      const place = placeSlug(e)
      slug = `${month}-${d.getUTCDate()}-${year}${place ? `-${place}` : ''}`
    }
    if (used.has(slug)) {
      let n = 2
      while (used.has(`${slug}-${n}`)) n++
      slug = `${slug}-${n}`
    }
    used.add(slug)
    out[e.id] = slug
  }
  return out
}

// An event slug that no longer exists ("october-2026" after a second October
// event arrived, or "october-21-2026" from before places were added) -> the
// id of the event it most likely meant, or null.
export function eventForOldSlug(events: SlugInput[], slugs: Record<string, string>, wanted: string): string | null {
  const ids = Object.keys(slugs)
  const prefix = ids.filter((id) => slugs[id].startsWith(`${wanted}-`))
  if (prefix.length) return prefix.sort((a, b) => slugs[a].localeCompare(slugs[b]))[0]
  const m = wanted.match(/^([a-z]+)-(\d{4})$/)
  if (!m || !MONTHS.includes(m[1])) return null
  const inMonth = events
    .filter((e) => {
      const d = slugDate(e)
      return MONTHS[d.getUTCMonth()] === m[1] && d.getUTCFullYear() === Number(m[2])
    })
    .sort((a, b) => slugDate(a).getTime() - slugDate(b).getTime())
  return inMonth[0]?.id || null
}

export function eventHref(
  company: { slug?: string | null } | null | undefined,
  eventSlug: string | null | undefined
): string {
  const base = companyHref(company)
  if (!company?.slug || !eventSlug) return base
  return `${base}/${encodeURIComponent(eventSlug)}`
}

// "October 2026"
export function monthYear(value: string | null | undefined): string {
  if (!value) return ''
  const d = new Date(value)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

// 2026-10-21 (Signal uses ISO dates in mono labels)
export function isoDate(value: string | null | undefined): string {
  if (!value) return '—'
  const d = new Date(value)
  if (isNaN(d.getTime())) return '—'
  return d.toISOString().slice(0, 10)
}

export function workersCount(e: { employees_affected: number | null; employee_count_text?: string | null }): string | null {
  if (e.employees_affected && e.employees_affected > 0) return e.employees_affected.toLocaleString('en-US')
  if (e.employee_count_text && e.employee_count_text.trim()) return e.employee_count_text.trim()
  return null
}

// Absolute site URL for canonical links, social previews and the sitemap.
// Set NEXT_PUBLIC_SITE_URL in your hosting settings once you have a domain.
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/$/, '')
