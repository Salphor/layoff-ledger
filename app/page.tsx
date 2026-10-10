import Link from 'next/link'
import { ArrowRight, ArrowUpRight, FileSearch, ShieldCheck, Radio, Users, Activity, TrendingDown, Percent, type LucideIcon } from 'lucide-react'
import { getLatestLayoffs, getRadarStats } from '@/lib/api'
import { formatDate } from '@/lib/site'
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
      <section className="relative overflow-hidden bg-brand-navy text-white">
        <div className="bg-grid absolute inset-0" />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="animate-radar h-[420px] w-[420px] rounded-full border border-brand-gold/30" />
          <div className="animate-radar absolute h-[420px] w-[420px] rounded-full border border-brand-gold/30" style={{ animationDelay: '2.5s' }} />
        </div>
        <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-brand-navy to-transparent" />

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

      {/* KPI strip overlapping hero */}
      <section className="container-page relative z-20 -mt-24">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi icon={Activity} label="Public layoff events tracked" value={stats.eventsTracked.toLocaleString()} dark />
          <Kpi icon={Users} label="Reported workers affected (known counts)" value={stats.employeesAffected.toLocaleString()} dark />
          <Kpi icon={TrendingDown} label="U.S. layoffs & discharges, Aug 2026" value="1.64M" />
          <Kpi icon={Percent} label="U.S. monthly layoff rate, Aug 2026" value="1.0%" />
        </div>
        <p className="mt-4 text-xs leading-relaxed text-brand-navy/55">
          National figures from{' '}
          <a
            href="https://usafacts.org/answers/how-many-people-are-laid-off-each-month/country/united-states/"
            className="underline decoration-brand-navy/30 underline-offset-2 hover:text-brand-green"
            target="_blank"
            rel="noopener noreferrer"
          >
            USAFacts / BLS JOLTS
          </a>
          , updated Oct 2, 2026. BLS metrics include broad separations and differ from discrete Layoff Radar tracking.
        </p>
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
              href={`/companies/${event.company?.slug}`}
              key={event.id}
              className="card group flex flex-col p-6 transition hover:-translate-y-0.5 hover:border-brand-green/40 hover:shadow-lift"
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-lg font-bold leading-snug text-brand-navy">{event.company?.canonical_name}</h3>
                <ArrowUpRight size={18} className="mt-1 shrink-0 text-brand-navy/30 transition group-hover:text-brand-green" />
              </div>
              <p className="mt-1 text-xs font-medium uppercase tracking-wide text-brand-navy/50">
                {formatDate(event.date_announced || event.created_at, 'long')}
              </p>
              <p className="mt-4 line-clamp-3 text-sm leading-relaxed text-brand-navy/75">{event.summary}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="border-y border-brand-navy/10 bg-white py-20">
        <div className="container-page">
          <div className="mx-auto max-w-2xl text-center">
            <p className="eyebrow">Methodology</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight">Built on evidence, not rumor</h2>
            <p className="mt-4 text-brand-navy/70">
              Radar only publishes events that trace back to a public record.
            </p>
          </div>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <div key={s.title} className="rounded-xl border border-brand-navy/10 bg-[#F6F6F4] p-7">
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

function Kpi({
  icon: Icon,
  label,
  value,
  dark = false,
}: {
  icon: LucideIcon
  label: string
  value: string
  dark?: boolean
}) {
  return (
    <div
      className={`rounded-xl p-6 shadow-lift ${
        dark ? 'bg-brand-green text-white' : 'border border-brand-navy/10 bg-white text-brand-navy'
      }`}
    >
      <Icon size={18} className={dark ? 'text-brand-gold' : 'text-brand-green'} />
      <p className={`mt-4 text-4xl font-bold tracking-tight ${dark ? 'text-white' : 'text-brand-navy'}`}>{value}</p>
      <p className={`mt-1 text-sm leading-snug ${dark ? 'text-white/70' : 'text-brand-navy/60'}`}>{label}</p>
    </div>
  )
}
