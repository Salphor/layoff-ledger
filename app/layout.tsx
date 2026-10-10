import './globals.css'
import Link from 'next/link'
import { Inter } from 'next/font/google'
import RadarMark from '@/app/components/RadarMark'
import { JOBQUE_URL } from '@/lib/site'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' })

export const metadata = {
  title: { default: 'Layoff Radar by JobQue', template: '%s | Layoff Radar' },
  description: 'Source-first layoff tracking and labor-market intelligence.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="flex min-h-screen flex-col font-sans">
        <header className="sticky top-0 z-40 border-b border-brand-navy/10 bg-white/85 backdrop-blur-md">
          <div className="container-page flex h-16 items-center justify-between">
            <Link href="/" className="flex items-center gap-3">
              <RadarMark />
              <span className="text-lg font-bold tracking-tight text-brand-navy">
                Layoff Radar
                <span className="ml-2 hidden text-xs font-medium text-brand-navy/50 sm:inline">by JobQue</span>
              </span>
            </Link>
            <nav className="flex items-center gap-1 sm:gap-2">
              <Link
                href="/layoffs"
                className="rounded-md px-3 py-2 text-sm font-medium text-brand-navy/80 transition hover:bg-brand-navy/5 hover:text-brand-navy"
              >
                Latest Layoffs
              </Link>
              <a
                href={JOBQUE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-1 rounded-lg bg-brand-navy px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-green"
              >
                JobQue Services
              </a>
            </nav>
          </div>
        </header>

        <main className="flex-1">{children}</main>

        <footer className="bg-brand-navy text-white">
          <div className="container-page grid gap-10 py-14 md:grid-cols-12">
            <div className="md:col-span-5">
              <div className="flex items-center gap-3">
                <RadarMark className="h-9 w-9" />
                <p className="text-lg font-bold">Layoff Radar</p>
              </div>
              <p className="mt-4 max-w-sm text-sm leading-relaxed text-white/60">
                Aggregating canonical public layoff events directly from WARN notices, state filings, and public newsrooms.
              </p>
            </div>
            <div className="md:col-span-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-gold">Explore</p>
              <ul className="mt-4 space-y-3 text-sm text-white/70">
                <li><Link href="/layoffs" className="transition hover:text-white">Latest layoffs</Link></li>
                <li><a href={JOBQUE_URL} target="_blank" rel="noopener noreferrer" className="transition hover:text-white">JobQue</a></li>
              </ul>
            </div>
            <div className="md:col-span-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-gold">Data notice</p>
              <p className="mt-4 text-sm leading-relaxed text-white/60">
                Radar data is based on available public reporting. Not all U.S. layoffs are subject to public notices.
              </p>
            </div>
          </div>
          <div className="border-t border-white/10">
            <div className="container-page flex flex-col gap-2 py-6 text-xs text-white/40 sm:flex-row sm:justify-between">
              <p>&copy; {new Date().getFullYear()} JobQue. All rights reserved.</p>
              <p>Source-first. Evidence-linked.</p>
            </div>
          </div>
        </footer>
      </body>
    </html>
  )
}
