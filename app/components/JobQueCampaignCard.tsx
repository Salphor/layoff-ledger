import { ArrowRight, Briefcase } from 'lucide-react'
import { JOBQUE_URL } from '@/lib/site'

export default function JobQueCampaignCard() {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-brand-green-dark px-6 py-12 text-white shadow-lift sm:px-12">
      <div className="bg-grid absolute inset-0" />
      <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-brand-gold/10 blur-3xl" />
      <div className="relative mx-auto flex max-w-3xl flex-col items-center text-center">
        <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-xl border border-brand-gold/30 bg-brand-gold/10">
          <Briefcase className="text-brand-gold" size={26} />
        </div>
        <h3 className="text-2xl font-bold tracking-tight sm:text-3xl">Affected by a recent layoff?</h3>
        <p className="mt-4 text-base leading-relaxed text-white/70 sm:text-lg">
          Layoff Radar exists to bring transparency to the labor market. If you are impacted by any of these events,
          JobQue provides specialized tools to accelerate your next placement.
        </p>
        <a href={JOBQUE_URL} target="_blank" rel="noopener noreferrer" className="btn-primary mt-8 !px-8 !py-3.5">
          Discover JobQue <ArrowRight size={16} />
        </a>
      </div>
    </div>
  )
}
