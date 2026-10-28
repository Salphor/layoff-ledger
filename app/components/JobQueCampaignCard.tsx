import { ArrowRight } from 'lucide-react'
import { JOBQUE_URL, SITE_NAME } from '@/lib/site'

export default function JobQueCampaignCard() {
  return (
    <div className="grid gap-6 border-2 border-line bg-lime-tint p-6 sm:p-10 md:grid-cols-12 md:items-end">
      <div className="md:col-span-8">
        <p className="label">[ Affected by a layoff? ]</p>
        <h2 className="mt-3 text-3xl font-bold leading-[1.05] tracking-display sm:text-[40px]">
          Don&rsquo;t job-hunt alone.
        </h2>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-muted">
          {SITE_NAME} tracks layoffs so people can act fast. JobQueAi is a daily job-search companion that helps you find
          and apply to the right companies next.
        </p>
      </div>
      <div className="md:col-span-4 md:text-right">
        <a href={JOBQUE_URL} target="_blank" rel="noopener noreferrer" className="btn-primary">
          Start with JobQueAi <ArrowRight size={16} />
        </a>
      </div>
    </div>
  )
}
