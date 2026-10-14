import { getCompanyBySlug, getCompanyEvents } from '@/lib/api'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronDown, ChevronRight, Globe, History, ShieldCheck, FileText } from 'lucide-react'
import EventArticleView, { isWarnEvent, resolveFacts } from '@/app/components/EventArticleView'
import JobQueCta from '@/app/components/JobQueCta'
import { formatDate } from '@/lib/site'
import type { LayoffEvent } from '@/lib/types'

export const revalidate = 300

export async function generateMetadata({ params }: { params: { company_slug: string } }) {
  const company = await getCompanyBySlug(params.company_slug)
  return { title: company ? `${company.canonical_name} Layoffs` : 'Company not found' }
}

function EventBadge({ event }: { event: LayoffEvent }) {
  if (isWarnEvent(event)) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-tan/40 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-brand-green">
        <FileText size={12} /> Official WARN notice
      </span>
    )
  }
  if (event.status === 'verified' || event.source_count >= 3) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-green/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-brand-green">
        <ShieldCheck size={12} /> Verified &middot; {event.source_count} sources
      </span>
    )
  }
  return null
}

export default async function CompanyPage({
  params,
  searchParams,
}: {
  params: { company_slug: string }
  searchParams: { event?: string }
}) {
  const company = await getCompanyBySlug(params.company_slug)
  if (!company) notFound()

  // Newest first. The first one is the page's current article.
  const events = await getCompanyEvents(company.id)
  if (!events.length) notFound()

  const [latest, ...history] = events
  const initial = company.canonical_name.trim().charAt(0).toUpperCase()

  return (
    <>
      {/* Header band */}
      <section className="relative overflow-hidden bg-gradient-to-br from-brand-green via-brand-green-dark to-brand-green-dark text-white">
        <div className="bg-grid absolute inset-0" />
        <div className="container-page relative py-12">
          <nav className="mb-6 flex items-center gap-1.5 text-xs text-white/60" aria-label="Breadcrumb">
            <Link href="/layoffs" className="hover:text-white">Layoffs</Link>
            <ChevronRight size={12} />
            <span className="truncate text-white/85">{company.canonical_name}</span>
          </nav>
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-white/10 text-2xl font-bold text-brand-gold ring-1 ring-white/20">
              {initial}
            </div>
            <div className="min-w-0">
              <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{company.canonical_name}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-white/70">
                {company.website_domain && (
                  <span className="inline-flex items-center gap-1.5 text-brand-gold">
                    <Globe size={14} /> {company.website_domain}
                  </span>
                )}
                <span>
                  {events.length} layoff event{events.length === 1 ? '' : 's'} tracked
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="container-page max-w-4xl py-10">
        {/* Current (latest) event */}
        <article className="card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-brand-green px-6 py-3 text-white">
            <span className="text-sm font-semibold">Latest layoff &middot; {formatDate(resolveFacts(latest).announced || latest.created_at, 'long')}</span>
            <EventBadge event={latest} />
          </div>
          <div className="p-6 sm:p-8">
            <EventArticleView event={latest} companyName={company.canonical_name} />
            <div className="mt-8">
              <JobQueCta />
            </div>
          </div>
        </article>

        {/* History */}
        <section className="mt-14" aria-labelledby="history-heading">
          <div className="mb-5 flex items-center gap-3">
            <History size={20} className="text-brand-green" />
            <h2 id="history-heading" className="text-xl font-bold tracking-tight">
              Layoff history
            </h2>
            {history.length > 0 && (
              <span className="rounded-full bg-brand-tan/40 px-2.5 py-0.5 text-xs font-semibold text-brand-green">
                {history.length} earlier event{history.length === 1 ? '' : 's'}
              </span>
            )}
          </div>

          {history.length === 0 ? (
            <p className="card p-6 text-sm text-brand-navy/65">
              This is the first layoff event we have recorded for {company.canonical_name}. If another one is found, it
              will become the main article above and this one will move into this history list.
            </p>
          ) : (
            <div className="space-y-3">
              {history.map((evt) => {
                const f = resolveFacts(evt)
                return (
                  <details
                    key={evt.id}
                    id={`event-${evt.id}`}
                    open={searchParams.event === evt.id}
                    className="card group overflow-hidden"
                  >
                    <summary className="flex cursor-pointer items-center justify-between gap-4 px-5 py-4 transition hover:bg-brand-canvas/60">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-brand-navy">
                          {evt.article?.headline || `${company.canonical_name}: layoff event reported`}
                        </p>
                        <p className="mt-0.5 text-xs text-brand-navy/55">
                          {formatDate(f.announced || evt.created_at, 'long')} &middot; Employees affected: {f.affected}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <span className="hidden sm:block">
                          <EventBadge event={evt} />
                        </span>
                        <ChevronDown size={18} className="text-brand-navy/40 transition group-open:rotate-180" />
                      </div>
                    </summary>
                    <div className="border-t border-brand-tan/60 p-5 sm:p-7">
                      <EventArticleView event={evt} companyName={company.canonical_name} />
                    </div>
                  </details>
                )
              })}
            </div>
          )}
        </section>
      </div>
    </>
  )
}
