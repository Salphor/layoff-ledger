import { getCompanyBySlug, getCompanyEvents } from '@/lib/api'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronDown, ChevronRight } from 'lucide-react'
import LayoffEventBlock, { eventDate, layoffHeadline } from '@/app/components/LayoffEventBlock'
import JobQueCta from '@/app/components/JobQueCta'
import { formatDate } from '@/lib/site'

export const revalidate = 300

// Next.js 15+ passes params/searchParams as Promises. Awaiting them also works
// on Next.js 14, where they are plain objects.
type Params = Promise<{ company_slug: string }>
type SearchParams = Promise<{ event?: string }>

export async function generateMetadata({ params }: { params: Params }) {
  const { company_slug } = await params
  const company = await getCompanyBySlug(company_slug)
  return { title: company ? `${company.canonical_name} Layoffs` : 'Company not found' }
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
  const events = await getCompanyEvents(company.id)
  if (!events.length) notFound()

  const [latest, ...older] = events
  const past = older.slice(0, 3)

  return (
    <>
      <section className="relative overflow-hidden bg-gradient-to-br from-brand-green via-brand-green-dark to-brand-green-dark text-white">
        <div className="bg-grid absolute inset-0" />
        <div className="container-page relative py-12">
          <nav className="mb-5 flex items-center gap-1.5 text-xs text-white/60" aria-label="Breadcrumb">
            <Link href="/layoffs" className="hover:text-white">Layoffs</Link>
            <ChevronRight size={12} />
            <span className="truncate text-white/85">{company.canonical_name}</span>
          </nav>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">{company.canonical_name}</h1>
        </div>
      </section>

      <div className="container-page max-w-3xl space-y-14 py-10">
        <section aria-labelledby="latest-heading">
          <h2 id="latest-heading" className="mb-4 text-xl font-bold tracking-tight">
            Most recent Layoff Event:
          </h2>
          <article className="card p-6 sm:p-8">
            <LayoffEventBlock event={latest} companyName={company.canonical_name} />
            <div className="mt-8">
              <JobQueCta />
            </div>
          </article>
        </section>

        <section aria-labelledby="past-heading">
          <h2 id="past-heading" className="mb-4 text-xl font-bold tracking-tight">
            Past Layoffs:
          </h2>

          {past.length === 0 ? (
            <p className="text-sm text-brand-navy/60">No historical layoff events tracked</p>
          ) : (
            <div className="space-y-3">
              {past.map((evt) => (
                <details
                  key={evt.id}
                  id={`event-${evt.id}`}
                  open={openEventId === evt.id}
                  className="card group overflow-hidden"
                >
                  <summary className="flex cursor-pointer items-center justify-between gap-4 px-5 py-4 transition hover:bg-brand-canvas/60">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-brand-navy">
                        {layoffHeadline(company.canonical_name, evt.employees_affected)}
                      </p>
                      <p className="mt-0.5 text-xs text-brand-navy/55">{formatDate(eventDate(evt), 'long')}</p>
                    </div>
                    <ChevronDown size={18} className="shrink-0 text-brand-navy/40 transition group-open:rotate-180" />
                  </summary>
                  <div className="border-t border-brand-tan/60 p-5 sm:p-6">
                    <LayoffEventBlock event={evt} companyName={company.canonical_name} showHeadline={false} />
                  </div>
                </details>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  )
}
