import Link from 'next/link'
import { notFound, permanentRedirect } from 'next/navigation'
import { ArrowRight } from 'lucide-react'
import { getCompanyBySlug, getCompanyEvents } from '@/lib/api'
import type { Company, LayoffEvent } from '@/lib/types'
import { eventDate, layoffHeadline, SourceList } from '@/app/components/LayoffEventBlock'
import NextSteps from '@/app/components/NextSteps'
import JobQueCta from '@/app/components/JobQueCta'
import ShareButtons from '@/app/components/ShareButtons'
import {
  asStringList,
  assignEventSlugs,
  companyHref,
  eventHref,
  formatDate,
  isoDate,
  monthYear,
  SITE_NAME,
  SITE_URL,
  workersCount,
} from '@/lib/site'
import { isWarnSource, toDisplaySources } from '@/lib/sources'

export const revalidate = 300

// Next.js 15+ passes params as a Promise; awaiting also works on Next.js 14.
type Params = Promise<{ company_slug: string; event_slug: string }>

interface Resolved {
  company: Company
  event: LayoffEvent
  events: LayoffEvent[] // all events for the company, newest first, with event_path
}

async function resolve(companySlug: string, eventSlug: string): Promise<Resolved | null> {
  const company = await getCompanyBySlug(companySlug)
  if (!company) return null
  const raw = await getCompanyEvents(company.id)
  if (!raw.length) return null

  const slugs = assignEventSlugs(raw)
  const events = raw.map((e) => ({ ...e, event_path: eventHref(company, slugs[e.id]) }))

  let wanted = eventSlug
  try { wanted = decodeURIComponent(eventSlug) } catch {}
  wanted = wanted.toLowerCase()

  const event = events.find((e) => slugs[e.id] === wanted)
  if (event) return { company, event, events }

  // Old links that used the event id: send them to the readable URL.
  const byId = events.find((e) => e.id === wanted)
  if (byId) permanentRedirect(byId.event_path!)
  return null
}

function title(r: Resolved): string {
  const when = monthYear(eventDate(r.event))
  return `${r.company.canonical_name} layoffs${when ? `, ${when}` : ''}`
}

function description(r: Resolved): string {
  const count = workersCount(r.event)
  const lead = `${r.company.canonical_name} layoff${count ? ` affecting ${count} workers` : ''}, announced ${formatDate(eventDate(r.event), 'long')}.`
  const summary = (r.event.summary || '').trim()
  const text = summary ? `${lead} ${summary}` : `${lead} Sources and what to do next.`
  return text.length > 300 ? `${text.slice(0, 297).trimEnd()}…` : text
}

export async function generateMetadata({ params }: { params: Params }) {
  const { company_slug, event_slug } = await params
  const r = await resolve(company_slug, event_slug)
  if (!r) return { title: 'Layoff not found' }
  const t = title(r)
  const d = description(r)
  return {
    title: t,
    description: d,
    alternates: { canonical: r.event.event_path },
    openGraph: { title: t, description: d, type: 'article', url: r.event.event_path },
    twitter: { card: 'summary', title: t, description: d },
  }
}

export default async function LayoffEventPage({ params }: { params: Params }) {
  const { company_slug, event_slug } = await params
  const r = await resolve(company_slug, event_slug)
  if (!r) notFound()

  const { company, event, events } = r
  const name = company.canonical_name
  const count = workersCount(event)
  const announced = eventDate(event)
  const sources = event.sources || []
  const displaySources = toDisplaySources(sources)
  const hasWarn = sources.some(isWarnSource)
  const warnStates = Array.from(
    new Set(sources.filter(isWarnSource).map((s) => (s.warn_state || s.source_key?.replace('warn-', '') || '').toLowerCase()).filter(Boolean))
  )
  const locations = asStringList(event.locations)
  const departments = asStringList(event.departments)
  const roles = asStringList(event.roles)
  const pageUrl = `${SITE_URL}${event.event_path}`
  const headline = layoffHeadline(name, event.employees_affected)

  const facts: { label: string; value: string; empty?: boolean }[] = [
    { label: 'Workers affected', value: count ?? 'Not disclosed', empty: !count },
    { label: 'Announced', value: formatDate(announced, 'long') },
    { label: 'WARN notice date', value: formatDate(event.notice_date, 'long'), empty: !event.notice_date },
    { label: 'Effective', value: formatDate(event.effective_date, 'long'), empty: !event.effective_date },
    { label: 'Locations', value: locations.length ? locations.join('; ') : 'Not disclosed', empty: !locations.length },
  ]
  if (departments.length) facts.push({ label: 'Departments', value: departments.join(', ') })
  if (roles.length) facts.push({ label: 'Roles', value: roles.join(', ') })
  if (event.reason_provided) facts.push({ label: 'Reason given', value: event.reason_provided })

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: title(r),
    description: description(r),
    datePublished: event.created_at,
    dateModified: event.created_at,
    url: pageUrl,
    about: { '@type': 'Organization', name },
    publisher: { '@type': 'Organization', name: SITE_NAME, url: SITE_URL },
    isBasedOn: displaySources.filter((s) => s.href).map((s) => s.href),
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />

      {/* Number first */}
      <section className="bg-ink text-white">
        <div className="container-page py-10 sm:py-14">
          <nav className="label flex flex-wrap items-center gap-2 text-grey" aria-label="Breadcrumb">
            <Link href="/companies" className="hover:text-white">Companies</Link>
            <span>/</span>
            <Link href={companyHref(company)} className="hover:text-white">{name}</Link>
            <span>/</span>
            <span className="text-white">{monthYear(announced) || 'Event'}</span>
          </nav>

          <div className="mt-8">
            {event.employees_affected && event.employees_affected > 0 ? (
              <>
                <p className="giant">{count}</p>
                <p className="label mt-3 text-lime">[ Workers affected ]</p>
              </>
            ) : count ? (
              <>
                <p className="text-[44px] font-bold leading-[0.95] tracking-display sm:text-[80px]">{count}</p>
                <p className="label mt-3 text-lime">[ Workers affected ]</p>
              </>
            ) : (
              <>
                <p className="text-[56px] font-bold leading-[0.95] tracking-giant sm:text-[96px]">Undisclosed</p>
                <p className="label mt-3 text-lime">[ Number of workers not yet reported ]</p>
              </>
            )}
          </div>

          <div className="mt-10 grid gap-8 border-t-2 border-white/30 pt-8 md:grid-cols-12 md:items-end">
            <div className="md:col-span-8">
              <h1 className="text-[32px] font-bold leading-[1.05] tracking-display sm:text-5xl">{title(r)}</h1>
              <p className="mt-3 text-lg text-grey">{headline}.</p>
              <div className="mt-5 flex flex-wrap items-center gap-2">
                <span className="pill border-white font-mono text-white">Announced {isoDate(announced)}</span>
                {hasWarn && <span className="pill border-lime bg-lime">WARN notice</span>}
                {event.status === 'verified' && <span className="pill border-lime text-lime">Verified</span>}
                <span className="pill border-white text-white">
                  {displaySources.length} {displaySources.length === 1 ? 'source' : 'sources'}
                </span>
              </div>
            </div>
            <div className="md:col-span-4 md:flex md:justify-end">
              <ShareButtons url={pageUrl} title={title(r)} onDark />
            </div>
          </div>
        </div>
      </section>

      <div className="container-page">
        <section className="row-labelled border-t-0">
          <h2 className="row-label">[ Summary ]</h2>
          <div className="row-body">
            <p className="max-w-3xl text-xl leading-relaxed sm:text-[22px]">
              {event.summary || `${headline}. Details are limited to what the sources below report.`}
            </p>
          </div>
        </section>

        <section className="row-labelled">
          <h2 className="row-label">[ Facts ]</h2>
          <dl className="row-body grid border-l-2 border-t-2 border-ink sm:grid-cols-2 lg:grid-cols-3">
            {facts.map((f) => (
              <div key={f.label} className="border-b-2 border-r-2 border-ink bg-white p-4 sm:p-5">
                <dt className="label text-muted">{f.label}</dt>
                <dd className={`mt-2 text-lg font-bold leading-snug ${f.empty ? 'font-medium text-muted' : ''}`}>{f.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="row-labelled">
          <h2 className="row-label">[ Sources ]</h2>
          <div className="row-body">
            <SourceList event={event} />
          </div>
        </section>

        <section className="row-labelled">
          <h2 className="row-label">[ What to do next ]</h2>
          <div className="row-body">
            <h3 className="mb-4 text-2xl font-bold tracking-[-0.03em] sm:text-[28px]">If you were affected</h3>
            <NextSteps states={warnStates} />
          </div>
        </section>

        <section className="row-labelled">
          <h2 className="row-label">[ JobQueAi ]</h2>
          <div className="row-body">
            <JobQueCta />
          </div>
        </section>

        <section className="row-labelled mb-16">
          <h2 className="row-label">[ {name} history ]</h2>
          <div className="row-body">
            <ul className="border-2 border-ink bg-white">
              {events.map((e) => {
                const current = e.id === event.id
                const c = workersCount(e)
                return (
                  <li key={e.id} className="border-b-2 border-ink last:border-b-0">
                    <Link
                      href={e.event_path!}
                      aria-current={current ? 'page' : undefined}
                      className={`group grid grid-cols-[110px_minmax(0,1fr)_auto] items-center gap-4 px-5 py-4 transition-colors ${
                        current ? 'bg-lime' : 'hover:bg-lime-tint'
                      }`}
                    >
                      <span className="font-mono text-sm">{isoDate(eventDate(e))}</span>
                      <span className="min-w-0 font-bold leading-snug">
                        {c ? `${c} workers` : 'Workers not disclosed'}
                        {current && <span className="ml-2 font-mono text-xs font-normal">(this record)</span>}
                      </span>
                      <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" aria-hidden="true" />
                    </Link>
                  </li>
                )
              })}
            </ul>
            <Link href={companyHref(company)} className="btn-secondary mt-5">
              {name} company page <ArrowRight size={16} />
            </Link>
          </div>
        </section>
      </div>
    </>
  )
}
