import { getLatestLayoffs } from '@/lib/api'
import LayoffsExplorer from '@/app/components/LayoffsExplorer'

export const revalidate = 60 // frequent revalidation for feed
export const metadata = { title: 'Latest Layoffs' }

export default async function LatestLayoffsPage() {
  const events = await getLatestLayoffs(500)

  return (
    <>
      <section className="relative overflow-hidden bg-brand-green-dark text-white">
        <div className="bg-grid absolute inset-0" />
        <div className="container-page relative py-14">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-gold">Event database</p>
          <h1 className="mt-2 text-4xl font-bold tracking-tight">Latest Layoffs</h1>
          <p className="mt-3 max-w-2xl text-white/70">
            Canonical public event records tracked by Radar, each linked to its original source.
          </p>
        </div>
      </section>
      <div className="container-page py-10">
        <LayoffsExplorer events={events} />
      </div>
    </>
  )
}
