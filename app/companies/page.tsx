import { getCompanyDirectory } from '@/lib/api'
import CompaniesDirectory from '@/app/components/CompaniesDirectory'
import { SITE_NAME } from '@/lib/site'

export const revalidate = 3600
export const metadata = {
  title: 'Companies A–Z',
  description: `Every company with a layoff tracked by ${SITE_NAME}, A to Z. Search by name to see each company's layoff history and sources.`,
  alternates: { canonical: '/companies' },
}

export default async function CompaniesPage() {
  const companies = await getCompanyDirectory()

  return (
    <>
      <section className="bg-band text-white">
        <div className="container-page py-12 sm:py-14">
          <p className="label text-lime">[ Companies A–Z ]</p>
          <p className="mt-3 text-[72px] font-bold leading-[0.9] tracking-giant tabular-nums sm:text-[120px]">
            {companies.length.toLocaleString('en-US')}
          </p>
          <h1 className="mt-4 text-[28px] font-bold leading-[1.1] tracking-display sm:text-4xl">
            Companies with a tracked layoff
          </h1>
          <p className="mt-3 max-w-2xl text-lg text-grey">
            Search by name or jump to a letter. Each company page shows its most recent layoff, past events and sources.
          </p>
        </div>
      </section>
      <div className="container-page pb-16">
        <CompaniesDirectory companies={companies} />
      </div>
    </>
  )
}
