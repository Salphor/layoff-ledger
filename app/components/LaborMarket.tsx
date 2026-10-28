import { changeNote, formatJolts, getJolts, monthLabel } from '@/lib/bls'
import { JOLTS } from '@/lib/stats'
import { SITE_NAME } from '@/lib/site'
import TrendChart from './TrendChart'

const SOURCE_URL = 'https://www.bls.gov/jlt/'

// "The national picture": four JOLTS figures with 24-month trend charts,
// fetched from the BLS API (lib/bls.ts). Falls back to the hand-typed
// figures in lib/stats.ts if BLS has never been reachable.
export default async function LaborMarket() {
  const data = await getJolts()

  const period = data ? monthLabel(data.latestMonth) : JOLTS.period
  const preliminary = data?.series.some((s) => s.points[s.points.length - 1].preliminary)

  return (
    <section className="container-page pb-14">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="label">[ U.S. labor market / {period} ]</p>
          <h2 className="mt-2 text-[32px] font-bold leading-none tracking-display">The national picture</h2>
        </div>
        <p className="font-mono text-xs text-muted">SOURCE: U.S. BUREAU OF LABOR STATISTICS</p>
      </div>

      {/* 2px gaps between cells read as rules */}
      <div className="grid gap-[2px] border-2 border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
        {data
          ? data.series.map((s) => {
              const latest = s.points[s.points.length - 1]
              return (
                <div key={s.key} className="bg-surface p-5">
                  <p className="label text-muted">{s.label}</p>
                  <p className="mt-3 text-5xl font-bold leading-none tracking-display tabular-nums">
                    {formatJolts(latest.value, s.unit)}
                  </p>
                  <p className="mt-3 text-sm text-muted">{changeNote(s)}</p>
                  <TrendChart
                    title={s.label}
                    points={s.points.map((p) => ({
                      month: p.month,
                      value: p.value,
                      label: formatJolts(p.value, s.unit),
                      monthLabel: monthLabel(p.month, true),
                    }))}
                  />
                </div>
              )
            })
          : JOLTS.stats.map((s) => (
              <div key={s.label} className="bg-surface p-5">
                <p className="label text-muted">{s.label}</p>
                <p className="mt-3 text-5xl font-bold leading-none tracking-display tabular-nums">{s.value}</p>
                <p className="mt-3 text-sm text-muted">{s.note}</p>
              </div>
            ))}
      </div>

      <p className="mt-4 max-w-3xl text-xs leading-relaxed text-muted">
        Seasonally adjusted figures from the{' '}
        <a href={SOURCE_URL} className="link" target="_blank" rel="noopener noreferrer">
          BLS Job Openings and Labor Turnover Survey (JOLTS)
        </a>
        {data ? (
          <>
            , latest month {period}
            {preliminary ? ' (preliminary; BLS revises it next month)' : ''}. Charts show the last{' '}
            {data.series[0].points.length} months.
          </>
        ) : (
          <>, released {JOLTS.released}.</>
        )}{' '}
        They cover all separations nationwide, not just the public layoff events tracked by {SITE_NAME}.
      </p>
    </section>
  )
}
