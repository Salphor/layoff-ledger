import { ExternalLink, FileText, Newspaper } from 'lucide-react'
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

export default function LayoffEventBlock({
  event,
  companyName,
  showHeadline = true,
}: {
  event: LayoffEvent
  companyName: string
  showHeadline?: boolean
}) {
  const sources = toDisplaySources(event.sources)

  return (
    <div>
      {showHeadline && (
        <>
          <h3 className="text-2xl font-bold leading-snug tracking-tight text-brand-navy sm:text-3xl">
            {layoffHeadline(companyName, event.employees_affected)}
          </h3>
          <p className="mt-2 text-sm text-brand-navy/55">Announced {formatDate(eventDate(event), 'long')}</p>
        </>
      )}

      <h4 className="mt-6 text-xs font-semibold uppercase tracking-[0.14em] text-brand-navy/60">Relevant articles</h4>
      {sources.length === 0 ? (
        <p className="mt-3 text-sm italic text-brand-navy/55">No article links are available for this event yet.</p>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {sources.map((s) => {
            const Icon = s.kind === 'warn' ? FileText : Newspaper
            const row = (
              <>
                <span className="flex min-w-0 items-start gap-3">
                  <span
                    className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${
                      s.kind === 'warn' ? 'bg-brand-green text-brand-gold' : 'bg-brand-tan/40 text-brand-green'
                    }`}
                  >
                    <Icon size={15} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-brand-navy">{s.label}</span>
                    {s.title && <span className="block truncate text-sm text-brand-navy/65">{s.title}</span>}
                  </span>
                </span>
                {s.href ? (
                  <ExternalLink size={15} className="shrink-0 text-brand-green" />
                ) : (
                  <span className="shrink-0 text-xs text-brand-navy/45">Link unavailable</span>
                )}
              </>
            )
            const cls = 'flex items-center justify-between gap-4 rounded-lg border border-brand-tan/60 bg-white p-3.5 transition'
            return (
              <li key={s.key}>
                {s.href ? (
                  <a
                    href={s.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`${cls} hover:border-brand-green/50 hover:shadow-card`}
                  >
                    {row}
                  </a>
                ) : (
                  <div className={cls}>{row}</div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
