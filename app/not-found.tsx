import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { SITE_NAME } from '@/lib/site'

export const metadata = { title: 'Page not found' }

export default function NotFound() {
  return (
    <section className="bg-ink text-white">
      <div className="container-page flex min-h-[60vh] flex-col justify-center py-20">
        <p className="label text-lime">[ Error 404 ]</p>
        <p className="giant mt-4">404</p>
        <h1 className="mt-6 text-[32px] font-bold leading-[1.05] tracking-display sm:text-5xl">Page not found</h1>
        <p className="mt-4 max-w-2xl text-lg text-grey">
          The page you&rsquo;re looking for doesn&rsquo;t exist or may have moved. {SITE_NAME} adds new companies and
          layoff records every day, so a company you&rsquo;re looking for may not have a recorded event yet.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/companies" className="btn-lime">
            Search companies <ArrowRight size={16} />
          </Link>
          <Link href="/layoffs" className="btn-ghost">
            Latest layoffs
          </Link>
        </div>
      </div>
    </section>
  )
}
