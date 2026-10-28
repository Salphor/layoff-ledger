import Link from 'next/link'
import { ArrowRight, ArrowUpRight } from 'lucide-react'
import type { LayoffEvent } from '@/lib/types'
import { formatDate } from '@/lib/site'
import { toDisplaySources } from '@/lib/sources'

// "Netflix announces layoff affecting 1,000 workers"
// If no number is known: "Netflix announces Layoffs"
export function layoffHeadline(companyName: string, employees: number | null | undefined): string {
  if (employees && employees > 0) {
    const n = employees.toLocaleString('en-US')
    return `${companyName} announces layoff affecting ${n} ${employees === 1 ? 'worker' : 'workers'}`
  }
  return `${companyName} announces Layoffs`
}

export function eventDate(event: LayoffEvent): string {
  return event.date_announced || event.announcement_date || event.notice_date || event.created_at
}

// Numbered source rows: official WARN filings first, then news.
export function SourceList({ event }: { event: LayoffEvent }) {
  const sources = toDisplaySources(event.sources)
  if (sources.length === 0) {
    return <p className="text-sm text-muted">No article links are available for this event yet.</p>
  }
  return (
    <ol className="border-2 border-line bg-surface">
      {sources.map((s, i) => {
        const body = (
          <>
            <span className="font-mono text-sm font-bold tabular-nums">{String(i + 1).padStart(2, '0')}</span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2">
                <span className={`text-sm font-bold ${s.href ? 'text-ultra' : ''}`}>{s.label}</span>
                {s.kind === 'warn' && <span className="pill bg-lime text-coal">WARN notice</span>}
              </span>
              {s.title && <span className="mt-0.5 block text-[15px] leading-snug">{s.title}</span>}
              {s.date && <span className="mt-1 block font-mono text-xs text-muted">{formatDate(s.date)}</span>}
            </span>
            {s.href ? (
              <ArrowUpRight size={18} className="shrink-0" aria-hidden="true" />
            ) : (
              <span className="shrink-0 font-mono text-xs text-muted">No link</span>
            )}
          </>
        )
        const cls = 'flex items-start gap-4 px-4 py-4 sm:px-5'
        return (
          <li key={s.key} className="border-b-2 border-line last:border-b-0">
            {s.href ? (
              <a href={s.href} target="_blank" rel="noopener noreferrer" className={`${cls} transition-colors hover:bg-lime-tint`}>
                {body}
              </a>
            ) : (
              <div className={cls}>{body}</div>
            )}
          </li>
        )
      })}
    </ol>
  )
}

// Compact block used on the company page.
export default function LayoffEventBlock({
  event,
  companyName,
  showHeadline = true,
}: {
  event: LayoffEvent
  companyName: string
  showHeadline?: boolean
}) {
  return (
    <div>
      {showHeadline && (
        <>
          <p className="label">[ Announced ] {formatDate(eventDate(event), 'long')}</p>
          <h3 className="mt-2 text-2xl font-bold leading-[1.1] tracking-display sm:text-[32px]">
            {layoffHeadline(companyName, event.employees_affected)}
          </h3>
        </>
      )}
      {event.summary && <p className="mt-4 max-w-3xl text-[17px] leading-relaxed">{event.summary}</p>}

      <p className="label mt-6 mb-3">[ Sources ]</p>
      <SourceList event={event} />

      {event.event_path && (
        <Link href={event.event_path} className="btn-secondary mt-5">
          Full record and next steps <ArrowRight size={16} />
        </Link>
      )}
    </div>
  )
}
