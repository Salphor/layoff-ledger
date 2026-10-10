import { getCompanyBySlug, getCompanyEvents } from '@/lib/api'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Calendar, ChevronDown, ChevronRight, ExternalLink, Globe, MapPin, Users, type LucideIcon } from 'lucide-react'
import JobQueCampaignCard from '@/app/components/JobQueCampaignCard'
import { formatDate } from '@/lib/site'

export default async function CompanyPage({
  params,
  searchParams,
}: {
  params: { company_slug: string }
  searchParams: { event?: string }
}) {
  const company = await getCompanyBySlug(params.company_slug)
  if (!company) notFound()

  const events = await getCompanyEvents(company.id)
  if (!events.length) notFound()

  // Find selected event, fallback to newest
  const activeEvent = searchParams.event
    ? events.find((e) => e.event_slug === searchParams.event) || events[0]
    : events[0]

  const isLatest = activeEvent.id === events[0].id

  // Safe URL helper to respect strict brief guidelines
  const isSafeUrl = (url: string) => {
    if (!url) return false
    try {
      const p = new URL(url)
      return (p.protocol === 'http:' || p.protocol === 'https:') && !p.hostname.endsWith('.local')
    } catch {
      return false
    }
  }

  const initial = company.canonical_name.trim().charAt(0).toUpperCase()

  return (
    <>
      {/* Header band */}
      <section className="relative overflow-hidden bg-brand-navy text-white">
        <div className="bg-grid absolute inset-0" />
        <div className="container-page relative py-12">
          <nav className="mb-6 flex items-center gap-1.5 text-xs text-white/55" aria-label="Breadcrumb">
            <Link href="/layoffs" className="hover:text-white">Layoffs</Link>
            <ChevronRight size={12} />
            <span className="truncate text-white/80">{company.canonical_name}</span>
          </nav>
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-brand-green text-2xl font-bold text-brand-gold ring-1 ring-white/10">
              {initial}
            </div>
            <div className="min-w-0">
              <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{company.canonical_name}</h1>
              {company.website_domain && (
                <p className="mt-1.5 inline-flex items-center gap-1.5 text-sm text-brand-gold">
                  <Globe size={14} /> {company.website_domain}
                </p>
              )}
            </div>
          </div>
        </div>
      </section>

      <div className="container-page max-w-4xl py-10">
        {/* History selector */}
        {events.length > 1 && (
          <div className="mb-5 flex justify-end">
            <details className="group relative">
              <summary className="card flex cursor-pointer items-center gap-2 px-4 py-2 text-sm font-medium transition hover:border-brand-green/40">
                Bulletin history <ChevronDown size={14} className="transition group-open:rotate-180" />
              </summary>
              <div className="absolute right-0 top-full z-10 mt-2 w-72 overflow-hidden rounded-xl border border-brand-navy/10 bg-white shadow-lift">
                {events.map((evt) => (
                  <Link
                    href={`/companies/${company.slug}?event=${evt.event_slug}`}
                    key={evt.id}
                    className={`flex items-center justify-between px-4 py-3 text-sm hover:bg-[#F6F6F4] ${
                      evt.id === activeEvent.id ? 'border-l-4 border-brand-gold bg-[#F6F6F4] font-semibold' : 'border-l-4 border-transparent'
                    }`}
                  >
                    {formatDate(evt.date_announced || evt.created_at)}
                    {evt.id === events[0].id && (
                      <span className="rounded-full bg-brand-green px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">Latest</span>
                    )}
                  </Link>
                ))}
              </div>
            </details>
          </div>
        )}

        {/* Bulletin */}
        <article className="card mb-12 overflow-hidden">
          <div className={`flex items-center justify-between px-6 py-3 text-white ${isLatest ? 'bg-brand-green' : 'bg-brand-navy-light'}`}>
            <span className="text-sm font-semibold">{isLatest ? 'Latest bulletin' : 'Historical bulletin'}</span>
            <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-white/65">Radar event data</span>
          </div>

          <div className="p-6 sm:p-8">
            <dl className="mb-8 grid grid-cols-2 gap-6 border-b border-brand-navy/10 pb-8 md:grid-cols-4">
              <Fact icon={Calendar} label="Announced" value={formatDate(activeEvent.date_announced)} />
              <Fact icon={Calendar} label="Effective" value={formatDate(activeEvent.effective_date)} />
              <Fact
                icon={Users}
                label="Affected"
                value={activeEvent.employees_affected?.toLocaleString() || activeEvent.employee_count_text || 'Not disclosed'}
                accent
              />
              <Fact
                icon={MapPin}
                label="Locations"
                value={activeEvent.locations?.length ? activeEvent.locations.join(', ') : 'Not disclosed'}
              />
            </dl>

            <div className="mb-8">
              <h2 className="text-lg font-bold">Event summary</h2>
              <p className="mt-3 text-base leading-relaxed text-brand-navy/80">{activeEvent.summary}</p>

              {activeEvent.reason_provided && (
                <blockquote className="mt-6 rounded-r-lg border-l-4 border-brand-gold bg-[#F6F6F4] p-4 text-sm leading-relaxed">
                  <strong className="font-semibold not-italic">The company stated:</strong>{' '}
                  <span className="italic">&ldquo;{activeEvent.reason_provided}&rdquo;</span>
                </blockquote>
              )}
            </div>

            {/* Sources */}
            <div className="rounded-xl border border-brand-navy/10 bg-[#F6F6F4] p-5 sm:p-6">
              <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-navy/70">Verified evidence sources</h3>
              <div className="mt-4 space-y-3">
                {activeEvent.sources && activeEvent.sources.length > 0 ? (
                  activeEvent.sources.map((source: any, i: number) => (
                    <div
                      key={i}
                      className="flex flex-col justify-between gap-2 rounded-lg border border-brand-navy/10 bg-white p-4 md:flex-row md:items-center"
                    >
                      <div className="min-w-0">
                        <span className="mr-2 text-sm font-semibold text-brand-green">{source.publisher}</span>
                        <span className="text-sm text-brand-navy/70">{source.title}</span>
                      </div>
                      {isSafeUrl(source.url) ? (
                        <a
                          href={source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-brand-green hover:underline"
                        >
                          View source <ExternalLink size={14} />
                        </a>
                      ) : (
                        <span className="shrink-0 rounded-full bg-brand-tan/30 px-2.5 py-1 text-xs font-medium">Source on file</span>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="text-sm italic text-brand-navy/60">Sources currently under review.</p>
                )}
              </div>
            </div>
          </div>
        </article>

        <JobQueCampaignCard />
      </div>
    </>
  )
}

function Fact({
  icon: Icon,
  label,
  value,
  accent = false,
}: {
  icon: LucideIcon
  label: string
  value: string
  accent?: boolean
}) {
  return (
    <div>
      <dt className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-brand-navy/50">
        <Icon size={12} /> {label}
      </dt>
      <dd className={`text-sm font-semibold ${accent ? 'text-brand-green' : 'text-brand-navy'}`}>{value}</dd>
    </div>
  )
}
