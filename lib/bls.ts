// Live U.S. labor-market figures from the BLS Public Data API (JOLTS survey).
//
// - Set BLS_API_KEY in .env.local (and in your hosting settings). It is read on
//   the server only and never sent to the browser. Without a key the free v1
//   API is used, which has lower daily limits.
// - Results are cached for 6 hours. BLS publishes JOLTS once a month, so new
//   figures appear on the site within a few hours of release.
// - If BLS can't be reached, the last good result keeps being served. If there
//   has never been a good result, the home page falls back to lib/stats.ts.
//
// Docs: https://www.bls.gov/developers/api_signature_v2.htm
import { unstable_cache } from 'next/cache'

// Series IDs: JT + S (seasonally adjusted) + 000000 (total nonfarm) + 00 (U.S.)
// + 00000 (all areas) + 00 (all sizes) + data element + L (level) or R (rate).
export const JOLTS_SERIES = [
  { key: 'ld', id: 'JTS000000000000000LDL', label: 'Layoffs & discharges', unit: 'thousands' },
  { key: 'ldr', id: 'JTS000000000000000LDR', label: 'Layoffs & discharges rate', unit: 'percent' },
  { key: 'jo', id: 'JTS000000000000000JOL', label: 'Job openings', unit: 'thousands' },
  { key: 'qu', id: 'JTS000000000000000QUL', label: 'Quits', unit: 'thousands' },
] as const

export type JoltsUnit = 'thousands' | 'percent'

export interface JoltsPoint {
  month: string // "2026-08"
  value: number
  preliminary: boolean
}

export interface JoltsSeries {
  key: string
  id: string
  label: string
  unit: JoltsUnit
  points: JoltsPoint[] // oldest first, up to 24 months
}

export interface JoltsData {
  series: JoltsSeries[]
  latestMonth: string // "2026-08"
  fetchedAt: string // ISO time of the last successful fetch
}

const MONTHS_SHOWN = 24

interface BlsResponse {
  status: string
  message?: string[]
  Results?: {
    series?: {
      seriesID: string
      data: { year: string; period: string; value: string; footnotes?: ({ code?: string } | null)[] }[]
    }[]
  }
}

async function fetchJolts(): Promise<JoltsData> {
  const key = process.env.BLS_API_KEY?.trim()
  const url = key
    ? 'https://api.bls.gov/publicAPI/v2/timeseries/data/'
    : 'https://api.bls.gov/publicAPI/v1/timeseries/data/'
  const year = new Date().getUTCFullYear()

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      seriesid: JOLTS_SERIES.map((s) => s.id),
      startyear: String(year - 2),
      endyear: String(year),
      ...(key ? { registrationkey: key } : {}),
    }),
  })
  if (!res.ok) throw new Error(`BLS API HTTP ${res.status}`)

  const json = (await res.json()) as BlsResponse
  if (json.status !== 'REQUEST_SUCCEEDED') {
    throw new Error(`BLS API: ${json.status} ${(json.message || []).join(' ')}`)
  }

  const byId = new Map((json.Results?.series || []).map((s) => [s.seriesID, s]))
  const series: JoltsSeries[] = JOLTS_SERIES.map((def) => {
    const raw = byId.get(def.id)
    if (!raw) throw new Error(`BLS API: series ${def.id} missing`)
    const points = raw.data
      // M01-M12 are months; M13 is an annual average.
      .filter((d) => /^M(0[1-9]|1[0-2])$/.test(d.period))
      .map((d) => ({
        month: `${d.year}-${d.period.slice(1)}`,
        value: Number(d.value),
        preliminary: (d.footnotes || []).some((f) => f?.code === 'P'),
      }))
      .filter((p) => Number.isFinite(p.value))
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-MONTHS_SHOWN)
    if (points.length < 2) throw new Error(`BLS API: not enough data for ${def.id}`)
    return { key: def.key, id: def.id, label: def.label, unit: def.unit, points }
  })

  return {
    series,
    latestMonth: series[0].points[series[0].points.length - 1].month,
    fetchedAt: new Date().toISOString(),
  }
}

// Cached for 6 hours. If a refresh fails, Next keeps serving the previous
// result, so the section never goes blank because BLS is briefly down.
const cachedJolts = unstable_cache(fetchJolts, ['bls-jolts-v1'], { revalidate: 6 * 60 * 60 })

export async function getJolts(): Promise<JoltsData | null> {
  try {
    return await cachedJolts()
  } catch (e) {
    console.error('[getJolts] BLS fetch failed, using fallback figures:', e)
    return null
  }
}

// ---------------------------------------------------------------------------
// Formatting

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

// "2026-08" -> "August 2026" (or "Aug 2026" when short)
export function monthLabel(month: string, short = false): string {
  const [y, m] = month.split('-').map(Number)
  const name = MONTH_NAMES[m - 1] || ''
  return `${short ? name.slice(0, 3) : name} ${y}`
}

// 1640 (thousands) -> "1.64M"; 812 -> "812K"; 1.0 (percent) -> "1.0%"
export function formatJolts(value: number, unit: JoltsUnit): string {
  if (unit === 'percent') return `${value.toFixed(1)}%`
  if (value >= 1000) return `${(value / 1000).toFixed(2).replace(/\.?0+$/, '')}M`
  return `${Math.round(value)}K`
}

// "Down from 1.70M in July"
export function changeNote(s: JoltsSeries): string {
  const n = s.points.length
  const cur = s.points[n - 1]
  const prev = s.points[n - 2]
  const prevMonth = MONTH_NAMES[Number(prev.month.slice(5)) - 1]
  const a = formatJolts(cur.value, s.unit)
  const b = formatJolts(prev.value, s.unit)
  if (a === b) return `Unchanged from ${prevMonth}`
  return `${cur.value > prev.value ? 'Up' : 'Down'} from ${b} in ${prevMonth}`
}
