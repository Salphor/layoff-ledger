import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { getLatestLayoffs, getSiteStats } from '@/lib/api'
import { companyHref, isoDate, SITE_NAME, workersCount } from '@/lib/site'
import { JOLTS } from '@/lib/stats'
import JobQueCampaignCard from './components/JobQueCampaignCard'

export const revalidate = 3600 // Revalidate hourly

const STEPS = [
  { n: '01', title: 'Monitor', body: 'We collect state WARN notices and news reports continuously.' },
  { n: '02', title: 'Match', body: 'Each notice or report is matched to one company and one layoff event.' },
  { n: '03', title: 'Publish with sources', body: 'Every record links to the original filing or article so you can check it.' },
]

export default async function Home() {
  const [latestEvents, stats] = await Promise.all([getLatestLayoffs(8), getSiteStats()])

  return (
    <div className="flex flex-col">
      {/* Number first */}
      <section className="bg-ink text-white">
        <div className="container-page py-14 sm:py-20">
          <p className="label text-lime">[ Workers in tracked U.S. layoffs ]</p>
          <p className="giant mt-4">
            {stats.employeesAffected.toLocaleString('en-US')}
          </p>
          <div className="mt-8 grid gap-8 md:grid-cols-12 md:items-end">
            <h1 className="text-[28px] font-bold leading-[1.1] tracking-display sm:text-4xl md:col-span-7">
              Every U.S. layoff we can verify, linked to its source. And what to do next if it&rsquo;s you.
            </h1>
            <div className="flex flex-wrap gap-3 md:col-span-5 md:justify-end">
              <Link href="/layoffs" className="btn-lime">
                Latest layoffs <ArrowRight size={16} />
              </Link>
              <Link href="/companies" className="btn-ghost">
                Find a company
              </Link>
            </div>
          </div>
          <p className="mt-8 font-mono text-xs text-grey">
            {stats.eventsTracked.toLocaleString('en-US')} PUBLIC LAYOFF EVENTS / WARN NOTICES AND NEWS REPORTS
          </p>
        </div>
      </section>

      {/* Latest */}
      <section className="container-page py-14">
        <div className="mb-5 flex items-end justify-between gap-4">
          <div>
            <p className="label">[ Newest records ]</p>
            <h2 className="mt-2 text-[32px] font-bold leading-none tracking-display">Latest layoffs</h2>
          </div>
          <Link href="/layoffs" className="label hidden items-center gap-1 hover:underline sm:inline-flex">
            View all <ArrowRight size={14} />
          </Link>
        </div>
        <ul className="border-2 border-ink bg-white">
          {latestEvents.map((event) => {
            const count = workersCount(event)
            return (
              <li key={event.id} className="border-b-2 border-ink last:border-b-0">
                <Link
                  href={event.event_path || companyHref(event.company)}
                  className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-5 gap-y-1 px-5 py-4 transition-colors hover:bg-lime-tint sm:grid-cols-[150px_minmax(0,1fr)_auto]"
                >
                  <span className={`font-bold leading-none tabular-nums ${event.employees_affected ? 'text-[28px] tracking-[-0.04em] sm:text-[32px]' : 'text-lg tracking-[-0.02em]'}`}>
                    {count ?? <span className="font-mono text-xs font-normal tracking-normal text-muted">NOT DISCLOSED</span>}
                  </span>
                  <span className="order-3 col-span-2 min-w-0 sm:order-none sm:col-span-1">
                    <span className="block text-lg font-bold leading-snug group-hover:underline group-hover:decoration-2">
                      {event.company?.canonical_name}
                    </span>
                    <span className="block truncate text-sm text-muted">{event.summary}</span>
                  </span>
                  <span className="flex items-center gap-3 font-mono text-sm">
                    {isoDate(event.date_announced || event.announcement_date || event.created_at)}
                    <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" aria-hidden="true" />
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
        <Link href="/layoffs" className="btn-secondary mt-5 sm:hidden">
          View all layoffs <ArrowRight size={16} />
        </Link>
      </section>

      {/* National context */}
      <section className="container-page pb-14">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="label">[ U.S. labor market / {JOLTS.period} ]</p>
            <h2 className="mt-2 text-[32px] font-bold leading-none tracking-display">The national picture</h2>
          </div>
          <p className="font-mono text-xs text-muted">SOURCE: U.S. BUREAU OF LABOR STATISTICS</p>
        </div>
        {/* 2px black gaps between cells read as rules */}
        <div className="grid gap-[2px] border-2 border-ink bg-ink sm:grid-cols-2 lg:grid-cols-4">
          {JOLTS.stats.map((s) => (
            <div key={s.label} className="bg-white p-5">
              <p className="label text-muted">{s.label}</p>
              <p className="mt-3 text-5xl font-bold leading-none tracking-display tabular-nums">{s.value}</p>
              <p className="mt-3 text-sm text-muted">{s.note}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 max-w-3xl text-xs leading-relaxed text-muted">
          Seasonally adjusted figures from the{' '}
          <a href={JOLTS.sourceUrl} className="link" target="_blank" rel="noopener noreferrer">
            BLS Job Openings and Labor Turnover Survey (JOLTS)
          </a>
          , released {JOLTS.released}. They cover all separations nationwide, not just the public layoff events tracked by{' '}
          {SITE_NAME}.
        </p>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="container-page pb-14">
        <p className="label">[ Method ]</p>
        <h2 className="mb-5 mt-2 text-[32px] font-bold leading-none tracking-display">Built on public records</h2>
        <div className="border-t-2 border-ink">
          {STEPS.map((s) => (
            <div key={s.n} className="grid gap-2 border-b-2 border-ink py-6 md:grid-cols-12 md:gap-6">
              <p className="label md:col-span-2">[ {s.n} ]</p>
              <p className="text-2xl font-bold tracking-[-0.03em] md:col-span-3">{s.title}</p>
              <p className="text-[17px] leading-relaxed text-muted md:col-span-7">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="container-page pb-16">
        <JobQueCampaignCard />
      </section>
    </div>
  )
}
