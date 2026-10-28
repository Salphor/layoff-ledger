import { ArrowUpRight } from 'lucide-react'

// State unemployment offices for states where we collect WARN notices.
// Everywhere else, CareerOneStop (U.S. Department of Labor) finds the right office.
const UNEMPLOYMENT: Record<string, { name: string; url: string }> = {
  wa: {
    name: 'Washington Employment Security Department',
    url: 'https://esd.wa.gov/get-financial-help/unemployment-benefits/applying-unemployment-benefits',
  },
  ca: { name: 'California EDD', url: 'https://edd.ca.gov/en/unemployment/' },
  ny: { name: 'New York State Department of Labor', url: 'https://dol.ny.gov/how-do-i-file' },
  tx: { name: 'Texas Workforce Commission', url: 'https://www.twc.texas.gov/jobseekers/unemployment-benefits' },
}
const FIND_OFFICE = {
  name: 'CareerOneStop unemployment benefits finder',
  url: 'https://www.careeronestop.org/LocalHelp/UnemploymentBenefits/Find-Unemployment-Benefits.aspx',
}

function Ext({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="link inline-flex items-center gap-1">
      {children}
      <ArrowUpRight size={14} aria-hidden="true" />
    </a>
  )
}

// Practical first steps after a layoff. General information, not legal advice.
export default function NextSteps({ states = [] }: { states?: string[] }) {
  const offices = Array.from(new Set(states.map((s) => s.toLowerCase())))
    .map((s) => UNEMPLOYMENT[s])
    .filter(Boolean)

  const steps = [
    {
      title: 'File for unemployment right away',
      body: (
        <>
          Apply in the state where you worked, even before your last day if your state allows it. Benefits usually start
          from the week you file, not the week you lost the job.{' '}
          {offices.map((o) => (
            <span key={o.url} className="mr-3 inline-block">
              <Ext href={o.url}>{o.name}</Ext>
            </span>
          ))}
          <Ext href={FIND_OFFICE.url}>{offices.length ? 'Other states' : 'Find your state office'}</Ext>
        </>
      ),
    },
    {
      title: 'Know your notice rights',
      body: (
        <>
          Under the federal WARN Act, larger employers generally must give 60 days&rsquo; notice of a mass layoff, or pay
          in place of notice. Some states require more.{' '}
          <Ext href="https://www.dol.gov/agencies/eta/layoffs/warn">U.S. Department of Labor: WARN</Ext>
        </>
      ),
    },
    {
      title: 'Read the severance terms before you sign',
      body: (
        <>
          Check the deadline and what you give up by signing. If you are 40 or older, federal law usually gives you at
          least 21 days to consider a release (45 in a group layoff) and 7 days to change your mind after signing.
        </>
      ),
    },
    {
      title: 'Keep your health coverage',
      body: (
        <>
          You can usually continue your employer plan through COBRA, or losing coverage lets you enroll in a
          Marketplace plan within 60 days.{' '}
          <span className="mr-3 inline-block">
            <Ext href="https://www.dol.gov/general/topic/health-plans/cobra">COBRA</Ext>
          </span>
          <Ext href="https://www.healthcare.gov/coverage-outside-open-enrollment/special-enrollment-period/">
            HealthCare.gov
          </Ext>
        </>
      ),
    },
    {
      title: 'Start your search with a plan',
      body: <>Update your resume and LinkedIn, tell your network, and set a daily target for applications.</>,
    },
  ]

  return (
    <div className="border-2 border-line bg-lime-tint p-4 sm:p-6">
      <ol className="space-y-3">
        {steps.map((s, i) => (
          <li key={s.title} className="grid grid-cols-[36px_minmax(0,1fr)] gap-x-4 border-2 border-line bg-surface p-4 sm:p-5">
            <span className="flex h-9 w-9 items-center justify-center bg-band font-mono text-sm font-bold text-lime">
              {i + 1}
            </span>
            <div>
              <p className="text-lg font-bold leading-snug">{s.title}</p>
              <p className="mt-1.5 text-[15px] leading-relaxed text-muted">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-4 font-mono text-xs text-muted">General information, not legal advice.</p>
    </div>
  )
}
