import Link from 'next/link'
import { ArrowRight, ArrowUpRight, FileSearch, ShieldCheck, Radio } from 'lucide-react'
import { getLatestLayoffs, getRadarStats } from '@/lib/api'
import { formatDate, companyHref } from '@/lib/site'
import { JOLTS } from '@/lib/stats'
import JobQueCampaignCard from './components/JobQueCampaignCard'

export const revalidate = 3600 // Revalidate hourly

const STEPS = [
  {
    icon: Radio,
    title: 'Monitor',
    body: 'Continuous collection from state WARN notices, SEC filings, press-release wires, and company newsrooms.',
  },
  {
    icon: FileSearch,
    title: 'Match & extract',
    body: 'Each signal is matched to a canonical company and reduced to structured, comparable event data.',
  },
  {
    icon: ShieldCheck,
    title: 'Publish with evidence',
    body: 'Every record links back to its original source so you can verify the claim yourself.',
  },
]

export default async function Home() {
  const latestEvents = await getLatestLayoffs(3)
  const stats = await getRadarStats()

  return (
    <div className="flex flex-col">
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-brand-green via-brand-green-dark to-brand-green-dark text-white">
        <div className="bg-grid absolute inset-0" />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="animate-radar h-[420px] w-[420px] rounded-full border border-brand-gold/30" />
          <div className="animate-radar absolute h-[420px] w-[420px] rounded-full border border-brand-gold/30" style={{ animationDelay: '2.5s' }} />
        </div>
        <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-brand-green-dark to-transparent" />

        <div className="container-page relative z-10 pb-40 pt-24 text-center sm:pt-28">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-xs font-medium text-white/80">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-gold opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-gold" />
            </span>
            Live monitoring of public filings
          </span>
          <h1 className="mx-auto mt-8 max-w-4xl text-4xl font-bold tracking-tight sm:text-6xl">
            Layoff intelligence, <span className="text-brand-gold">verified at the source.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-white/70 sm:text-xl">
            Source-first tracking of the labor market. See where layoffs are happening and verify the evidence behind every record.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/layoffs" className="btn-primary !px-8 !py-3.5">
              View latest layoffs <ArrowRight size={16} />
            </Link>
            <a href="#how-it-works" className="btn-ghost !px-8 !py-3.5">How it works</a>
          </div>
        </div>
      </section>

      {/* National statistics (BLS JOLTS) overlapping hero */}
      <section className="container-page relative z-20 -mt-24">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-1">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-gold">
            U.S. labor market &middot; {JOLTS.period}
          </p>
          <p className="text-xs text-white/70">Source: U.S. Bureau of Labor Statistics</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {JOLTS.stats.map((s) => (
            <div key={s.label} className="rounded-xl border-t-4 border-brand-gold bg-white p-6 shadow-lift">
              <p className="text-xs font-semibold uppercase tracking-wider text-brand-navy/55">{s.label}</p>
              <p className="mt-3 text-4xl font-bold tracking-tight text-brand-green">{s.value}</p>
              <p className="mt-2 text-sm text-brand-navy/60">{s.note}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs leading-relaxed text-brand-navy/60">
          Seasonally adjusted figures from the{' '}
          <a
            href={JOLTS.sourceUrl}
            className="underline decoration-brand-tan underline-offset-2 hover:text-brand-green"
            target="_blank"
            rel="noopener noreferrer"
          >
            BLS Job Openings and Labor Turnover Survey (JOLTS)
          </a>
          , released {JOLTS.released}. BLS metrics cover all separations nationwide and differ from the discrete,
          source-linked events tracked by Layoff Radar.
        </p>
        <div className="mt-6 flex items-center justify-center gap-2 rounded-lg border border-brand-tan/60 bg-white px-4 py-3 text-sm text-brand-navy/75">
          <span className="h-2 w-2 rounded-full bg-brand-gold" />
          <span>
            <strong className="font-semibold text-brand-green">{stats.eventsTracked.toLocaleString()}</strong> public layoff
            events indexed by Layoff Radar from WARN notices and filings
          </span>
        </div>
      </section>

      {/* Latest signals */}
      <section className="container-page py-20">
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Newest records</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight">Latest monitored signals</h2>
          </div>
          <Link href="/layoffs" className="hidden items-center gap-1 text-sm font-semibold text-brand-green hover:underline sm:inline-flex">
            View all <ArrowRight size={14} />
          </Link>
        </div>
        <div className="grid gap-5 md:grid-cols-3">
          {latestEvents.map((event) => (
            <Link
              href={companyHref(event.company)}
              key={event.id}
              className="card group flex flex-col p-6 transition hover:-translate-y-0.5 hover:border-brand-green/40 hover:shadow-lift"
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-lg font-bold leading-snug text-brand-navy">{event.company?.canonical_name}</h3>
                <ArrowUpRight size={18} className="mt-1 shrink-0 text-brand-navy/30 transition group-hover:text-brand-green" />
              </div>
              <p className="mt-1 text-xs font-medium uppercase tracking-wide text-brand-navy/50">
                {formatDate(event.date_announced || event.announcement_date || event.created_at, 'long')}
              </p>
              <p className="mt-4 line-clamp-3 text-sm leading-relaxed text-brand-navy/75">{event.summary}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="border-y border-brand-tan/60 bg-white py-20">
        <div className="container-page">
          <div className="mx-auto max-w-2xl text-center">
            <p className="eyebrow">Methodology</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight">Built on evidence, not rumor</h2>
            <p className="mt-4 text-brand-navy/70">Radar only publishes events that trace back to a public record.</p>
          </div>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <div key={s.title} className="rounded-xl border border-brand-tan/60 bg-brand-canvas/60 p-7">
                <div className="flex items-center justify-between">
                  <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-brand-green text-brand-gold">
                    <s.icon size={20} />
                  </div>
                  <span className="text-sm font-semibold text-brand-navy/30">0{i + 1}</span>
                </div>
                <h3 className="mt-5 text-lg font-bold">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-brand-navy/70">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="container-page py-20">
        <JobQueCampaignCard />
      </section>
    </div>
  )
}
