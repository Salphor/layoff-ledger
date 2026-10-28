import { getCompanyBySlug, getCompanyEvents } from '@/lib/api'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowRight, ChevronDown } from 'lucide-react'
import LayoffEventBlock, { eventDate, layoffHeadline } from '@/app/components/LayoffEventBlock'
import JobQueCta from '@/app/components/JobQueCta'
import { assignEventSlugs, eventHref, formatDate, isoDate, SITE_NAME } from '@/lib/site'

export const revalidate = 300

// Next.js 15+ passes params/searchParams as Promises. Awaiting them also works
// on Next.js 14, where they are plain objects.
type Params = Promise<{ company_slug: string }>
type SearchParams = Promise<{ event?: string }>

export async function generateMetadata({ params }: { params: Params }) {
  const { company_slug } = await params
  const company = await getCompanyBySlug(company_slug)
  if (!company) return { title: 'Company not found' }
  return {
    title: `${company.canonical_name} layoffs`,
    description: `Every ${company.canonical_name} layoff tracked by ${SITE_NAME}, with worker counts, dates, WARN notices and news sources.`,
  }
}

export default async function CompanyPage({
  params,
  searchParams,
}: {
  params: Params
  searchParams: SearchParams
}) {
  const { company_slug } = await params
  const { event: openEventId } = await searchParams
  const company = await getCompanyBySlug(company_slug)
  if (!company) notFound()

  // Newest first. The first is the "most recent" event; the next three are the history.
  const rawEvents = await getCompanyEvents(company.id)
  if (!rawEvents.length) notFound()

  const slugs = assignEventSlugs(rawEvents)
  const events = rawEvents.map((e) => ({ ...e, event_path: eventHref(company, slugs[e.id]) }))
  const [latest, ...older] = events
  const past = older.slice(0, 3)
  const totalWorkers = events.reduce((n, e) => n + (e.employees_affected && e.employees_affected > 0 ? e.employees_affected : 0), 0)

  return (
    <>
      <section className="bg-band text-white">
        <div className="container-page py-10 sm:py-12">
          <nav className="label flex flex-wrap items-center gap-2 text-grey" aria-label="Breadcrumb">
            <Link href="/companies" className="hover:text-white">Companies</Link>
            <span>/</span>
            <span className="text-white">{company.canonical_name}</span>
          </nav>
          <h1 className="mt-5 text-[40px] font-bold leading-[1] tracking-display sm:text-[64px]">{company.canonical_name}</h1>
          <dl className="mt-8 grid max-w-3xl grid-cols-2 gap-[2px] border-2 border-white/30 bg-white/30 sm:grid-cols-3">
            <div className="bg-band p-4">
              <dt className="label text-grey">[ Events ]</dt>
              <dd className="mt-2 text-4xl font-bold leading-none tracking-display tabular-nums">{events.length}</dd>
            </div>
            <div className="bg-band p-4">
              <dt className="label text-grey">[ Workers ]</dt>
              <dd className="mt-2 text-4xl font-bold leading-none tracking-display tabular-nums">
                {totalWorkers ? <span className="mark">{totalWorkers.toLocaleString('en-US')}</span> : '—'}
              </dd>
            </div>
            <div className="col-span-2 bg-band p-4 sm:col-span-1">
              <dt className="label text-grey">[ Latest ]</dt>
              <dd className="mt-3 font-mono text-lg">{isoDate(eventDate(latest))}</dd>
            </div>
          </dl>
        </div>
      </section>

      <div className="container-page">
        <section className="row-labelled border-t-0" aria-labelledby="latest-heading">
          <h2 id="latest-heading" className="row-label">[ Most recent Layoff Event: ]</h2>
          <div className="row-body space-y-8">
            <div className="box p-5 sm:p-8">
              <LayoffEventBlock event={latest} companyName={company.canonical_name} />
            </div>
            <JobQueCta />
          </div>
        </section>

        <section className="row-labelled mb-16" aria-labelledby="past-heading">
          <h2 id="past-heading" className="row-label">[ Past Layoffs: ]</h2>
          <div className="row-body">
            {past.length === 0 ? (
              <p className="text-[17px] text-muted">No historical layoff events tracked</p>
            ) : (
              <div className="border-2 border-line bg-surface">
                {past.map((evt) => (
                  <details
                    key={evt.id}
                    id={`event-${evt.id}`}
                    open={openEventId === evt.id}
                    className="group border-b-2 border-line last:border-b-0"
                  >
                    <summary className="flex cursor-pointer items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-lime-tint">
                      <span className="min-w-0">
                        <span className="block font-mono text-xs text-muted">{isoDate(eventDate(evt))}</span>
                        <span className="mt-1 block text-lg font-bold leading-snug">
                          {layoffHeadline(company.canonical_name, evt.employees_affected)}
                        </span>
                      </span>
                      <ChevronDown size={20} className="shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
                    </summary>
                    <div className="border-t-2 border-line bg-bone p-5 sm:p-6">
                      <p className="label text-muted">[ Announced ] {formatDate(eventDate(evt), 'long')}</p>
                      <LayoffEventBlock event={evt} companyName={company.canonical_name} showHeadline={false} />
                    </div>
                  </details>
                ))}
              </div>
            )}
            {older.length > past.length && (
              <p className="mt-4 text-sm text-muted">
                {older.length - past.length} older {older.length - past.length === 1 ? 'event' : 'events'} not shown here.{' '}
                <Link href={latest.event_path!} className="link inline-flex items-center gap-1">
                  See the full history <ArrowRight size={14} />
                </Link>
              </p>
            )}
          </div>
        </section>
      </div>
    </>
  )
}
