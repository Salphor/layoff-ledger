import Link from 'next/link'
import { ArrowRight, Radar } from 'lucide-react'

export const metadata = { title: 'Page not found' }

export default function NotFound() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-brand-green via-brand-green-dark to-brand-green-dark text-white">
      <div className="bg-grid absolute inset-0" />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="animate-radar h-[360px] w-[360px] rounded-full border border-brand-gold/30" />
        <div
          className="animate-radar absolute h-[360px] w-[360px] rounded-full border border-brand-gold/30"
          style={{ animationDelay: '2.5s' }}
        />
      </div>

      <div className="container-page relative z-10 flex min-h-[60vh] flex-col items-center justify-center py-24 text-center">
        <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-xl border border-brand-gold/30 bg-brand-gold/10">
          <Radar className="text-brand-gold" size={26} />
        </div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-gold">Error 404</p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">Page not found</h1>
        <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-white/75 sm:text-lg">
          The page you&rsquo;re looking for doesn&rsquo;t exist or may have moved.
        </p>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-white/60">
          Layoff Radar is constantly tracking new layoff events and adding new company pages. If you&rsquo;re looking
          for a specific company, it may not have a recorded event yet. Check back soon.
        </p>
        <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row">
          <Link href="/layoffs" className="btn-primary !px-8 !py-3.5">
            Browse latest layoffs <ArrowRight size={16} />
          </Link>
          <Link href="/" className="btn-ghost !px-8 !py-3.5">
            Back to home
          </Link>
        </div>
      </div>
    </section>
  )
}
