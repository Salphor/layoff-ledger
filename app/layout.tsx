import './globals.css'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { Space_Grotesk, Space_Mono } from 'next/font/google'
import RadarMark from '@/app/components/RadarMark'
import { JOBQUE_URL, SITE_NAME, SITE_TAGLINE, SITE_URL } from '@/lib/site'

const grotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-grotesk',
  display: 'swap',
})
const mono = Space_Mono({ subsets: ['latin'], weight: ['400', '700'], variable: '--font-mono', display: 'swap' })

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${SITE_NAME}: U.S. layoffs, source-linked`, template: `%s | ${SITE_NAME}` },
  description: SITE_TAGLINE,
  applicationName: SITE_NAME,
  openGraph: { siteName: SITE_NAME, type: 'website' },
}

const NAV = [
  { href: '/layoffs', label: 'Latest' },
  { href: '/companies', label: 'Companies' },
]

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${grotesk.variable} ${mono.variable}`}>
      <body className="flex min-h-screen flex-col font-sans">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-lime focus:px-3 focus:py-2">
          Skip to content
        </a>
        <header className="sticky top-0 z-40 border-b-2 border-ink bg-white">
          <div className="container-page flex min-h-[64px] flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3">
            <Link href="/" className="flex items-center gap-3">
              <RadarMark />
              <span className="text-lg font-bold tracking-[-0.03em]">{SITE_NAME}</span>
            </Link>
            <nav className="order-3 flex w-full items-center gap-5 sm:order-none sm:w-auto" aria-label="Main">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className="label py-1 hover:underline hover:decoration-2 hover:underline-offset-4">
                  {n.label}
                </Link>
              ))}
            </nav>
            <a href={JOBQUE_URL} target="_blank" rel="noopener noreferrer" className="btn-primary !min-h-[40px] !px-4 text-sm">
              JobQueAi
            </a>
          </div>
        </header>

        <main id="main" className="flex-1">{children}</main>

        <footer className="bg-ink text-white">
          <div className="container-page grid gap-10 py-14 md:grid-cols-12">
            <div className="md:col-span-5">
              <div className="flex items-center gap-3">
                <RadarMark className="h-9 w-9" />
                <p className="text-lg font-bold tracking-[-0.03em]">{SITE_NAME}</p>
              </div>
              <p className="mt-4 max-w-sm text-sm leading-relaxed text-grey">{SITE_TAGLINE}</p>
            </div>
            <div className="md:col-span-3">
              <p className="label text-lime">[ Explore ]</p>
              <ul className="mt-4 space-y-3 text-sm text-grey">
                <li><Link href="/layoffs" className="hover:text-white">Latest layoffs</Link></li>
                <li><Link href="/companies" className="hover:text-white">Companies A–Z</Link></li>
                <li><a href={JOBQUE_URL} target="_blank" rel="noopener noreferrer" className="hover:text-white">JobQueAi</a></li>
              </ul>
            </div>
            <div className="md:col-span-4">
              <p className="label text-lime">[ Data notice ]</p>
              <p className="mt-4 text-sm leading-relaxed text-grey">
                Records come from public WARN notices and news reporting. Not every U.S. layoff requires a public notice,
                so this is not a complete count.
              </p>
            </div>
          </div>
          <div className="border-t-2 border-white/15">
            <div className="container-page flex flex-col gap-2 py-6 font-mono text-xs text-grey sm:flex-row sm:justify-between">
              <p>&copy; {new Date().getFullYear()} {SITE_NAME}</p>
              <p>SOURCE-FIRST / EVIDENCE-LINKED</p>
            </div>
          </div>
        </footer>
      </body>
    </html>
  )
}
