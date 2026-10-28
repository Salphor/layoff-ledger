import Link from 'next/link'
import { getLatestLayoffs } from '@/lib/api'
import LayoffsExplorer from '@/app/components/LayoffsExplorer'
import { SITE_NAME } from '@/lib/site'

export const revalidate = 60 // frequent revalidation for feed
export const metadata = {
  title: 'Latest layoffs',
  description: `The newest U.S. layoffs tracked by ${SITE_NAME}, each linked to its WARN notice or news source.`,
  alternates: { canonical: '/layoffs' },
}

export default async function LatestLayoffsPage() {
  const events = await getLatestLayoffs(500)

  return (
    <>
      <section className="bg-band text-white">
        <div className="container-page py-12 sm:py-14">
          <p className="label text-lime">[ Event database ]</p>
          <h1 className="mt-3 text-[44px] font-bold leading-none tracking-display sm:text-6xl">Latest layoffs</h1>
          <p className="mt-4 max-w-2xl text-lg text-grey">
            Public layoff records, newest first, each linked to its original source. Looking for one employer?{' '}
            <Link href="/companies" className="text-lime underline underline-offset-2">Browse companies A–Z</Link>.
          </p>
        </div>
      </section>
      <div className="container-page py-10">
        <LayoffsExplorer events={events} />
      </div>
    </>
  )
}
