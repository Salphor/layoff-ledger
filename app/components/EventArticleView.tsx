import { Calendar, ExternalLink, FileText, Info, MapPin, Newspaper, Users } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { LayoffEvent } from '@/lib/types'
import { asStringList, formatDate } from '@/lib/site'
import { isWarnSource, toDisplaySources } from '@/lib/sources'

const NOT_DISCLOSED = 'Not disclosed'

// Merge what the database holds with what the generated article found.
export function resolveFacts(event: LayoffEvent) {
  const a = event.article?.facts
  const locations = asStringList(event.locations)
  const departments = asStringList(event.departments)
  const roles = asStringList(event.roles)

  const rawEmployees = event.employees_affected || a?.employees_affected || null
  const employees = rawEmployees && rawEmployees > 0 ? rawEmployees : null
  const employeeText = event.employee_count_text || a?.employee_count_text || null

  return {
    announced: event.date_announced || event.notice_date || a?.announced_date || null,
    effective: event.effective_date || a?.effective_date || null,
    affected:
      employees != null ? employees.toLocaleString() : employeeText ? employeeText : NOT_DISCLOSED,
    locations: locations.length ? locations : a?.locations || [],
    departments: departments.length ? departments : a?.departments || [],
    roles: roles.length ? roles : a?.roles || [],
    reason: event.reason_provided || a?.reason_provided || null,
  }
}

export function isWarnEvent(event: LayoffEvent): boolean {
  return !!event.article?.is_warn_notice || (event.sources || []).some(isWarnSource)
}

function Fact({ icon: Icon, label, value, accent = false }: { icon: LucideIcon; label: string; value: string; accent?: boolean }) {
  const missing = value === NOT_DISCLOSED
  return (
    <div>
      <dt className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-brand-navy/50">
        <Icon size={12} /> {label}
      </dt>
      <dd
        className={`text-sm font-semibold ${
          missing ? 'font-medium text-brand-navy/45' : accent ? 'text-brand-green' : 'text-brand-navy'
        }`}
      >
        {value}
      </dd>
    </div>
  )
}

export default function EventArticleView({ event, companyName }: { event: LayoffEvent; companyName: string }) {
  const article = event.article
  const facts = resolveFacts(event)
  const warn = isWarnEvent(event)
  const sources = toDisplaySources(event.sources)
  const writeUpPending = !article && (warn || event.source_count >= 3)

  const headline = article?.headline || `${companyName}: layoff event reported`
  const summary = article?.summary || event.summary

  const extraRows: { label: string; value: string }[] = []
  if (facts.departments.length) extraRows.push({ label: 'Departments', value: facts.departments.join(', ') })
  if (facts.roles.length) extraRows.push({ label: 'Roles', value: facts.roles.join(', ') })

  return (
    <div>
      <h3 className="text-2xl font-bold leading-snug tracking-tight text-brand-navy sm:text-3xl">{headline}</h3>

      <dl className="mt-6 grid grid-cols-2 gap-6 border-y border-brand-tan/60 py-6 md:grid-cols-4">
        <Fact icon={Calendar} label="Announced" value={facts.announced ? formatDate(facts.announced) : NOT_DISCLOSED} />
        <Fact icon={Calendar} label="Effective" value={facts.effective ? formatDate(facts.effective) : NOT_DISCLOSED} />
        <Fact icon={Users} label="Employees affected" value={facts.affected} accent />
        <Fact icon={MapPin} label="Locations" value={facts.locations.length ? facts.locations.join(', ') : NOT_DISCLOSED} />
      </dl>

      <div className="mt-6">
        <p className="text-base leading-relaxed text-brand-navy/85">{summary}</p>

        {facts.affected === NOT_DISCLOSED && (
          <p className="mt-4 flex items-start gap-2 text-sm font-medium text-brand-navy/70">
            <Info size={16} className="mt-0.5 shrink-0 text-brand-gold" />
            No employee count was found in the sources we reviewed.
          </p>
        )}

        {article && article.key_points.length > 0 && (
          <ul className="mt-5 space-y-2.5">
            {article.key_points.map((point, i) => (
              <li key={i} className="flex gap-3 text-sm leading-relaxed text-brand-navy/80">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-gold" />
                {point}
              </li>
            ))}
          </ul>
        )}

        {extraRows.length > 0 && (
          <dl className="mt-5 space-y-2 text-sm">
            {extraRows.map((r) => (
              <div key={r.label} className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
                <dt className="w-28 shrink-0 font-semibold text-brand-navy/60">{r.label}</dt>
                <dd className="text-brand-navy/85">{r.value}</dd>
              </div>
            ))}
          </dl>
        )}

        {facts.reason && (
          <blockquote className="mt-6 rounded-r-lg border-l-4 border-brand-gold bg-brand-canvas/60 p-4 text-sm leading-relaxed">
            <strong className="font-semibold">Reason given:</strong> {facts.reason}
          </blockquote>
        )}

        {warn && (
          <div className="mt-6 flex gap-3 rounded-lg border border-brand-tan bg-brand-tan/20 p-4 text-sm leading-relaxed text-brand-navy/85">
            <Info size={18} className="mt-0.5 shrink-0 text-brand-green" />
            <p>
              <strong className="font-semibold">About WARN notices.</strong> A WARN notice is an official advance
              notice that an employer files before a layoff or closure. These filings often contain limited detail, and
              more information about this layoff may become available in the future. We update this page as new
              sources are found.
            </p>
          </div>
        )}

        {writeUpPending && (
          <p className="mt-4 text-xs italic text-brand-navy/55">
            A detailed write-up for this event is still being prepared.
          </p>
        )}
      </div>

      {/* Sources */}
      <div className="mt-8">
        <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-navy/60">
          Sources &middot; investigate for yourself
        </h4>
        {sources.length === 0 ? (
          <p className="mt-3 text-sm italic text-brand-navy/55">No source links are available for this event yet.</p>
        ) : (
          <ul className="mt-3 space-y-2.5">
            {sources.map((s) => {
              const Icon = s.kind === 'warn' ? FileText : Newspaper
              const inner = (
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
                      <span className="block text-sm font-semibold text-brand-navy">
                        {s.label}
                        {s.count && s.count > 1 ? (
                          <span className="ml-2 text-xs font-medium text-brand-navy/50">{s.count} filings</span>
                        ) : null}
                      </span>
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
              const cls =
                'flex items-center justify-between gap-4 rounded-lg border border-brand-tan/60 bg-white p-3.5 transition'
              return (
                <li key={s.key}>
                  {s.href ? (
                    <a
                      href={s.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`${cls} hover:border-brand-green/50 hover:shadow-card`}
                    >
                      {inner}
                    </a>
                  ) : (
                    <div className={cls}>{inner}</div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
