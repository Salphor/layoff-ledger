export const JOBQUE_URL = 'https://jobque.ai'

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

// Placeholder promo code shown on company pages until the real one exists.
export const JOBQUE_COUPON = 'JobqueDiscount'

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
  notice_date: string | null
  created_at: string
}): number {
  return new Date(e.date_announced || e.notice_date || e.created_at).getTime()
}
