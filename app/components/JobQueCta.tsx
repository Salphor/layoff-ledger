import { ArrowRight } from 'lucide-react'
import { JOBQUE_COUPON, JOBQUE_URL } from '@/lib/site'
import CouponCode from './CouponCode'

export default function JobQueCta() {
  return (
    <div className="relative overflow-hidden rounded-xl bg-brand-green-dark p-6 text-white sm:p-8">
      <div className="bg-grid absolute inset-0 opacity-60" />
      <div className="relative flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <div className="max-w-xl">
          <p className="text-lg font-bold leading-snug sm:text-xl">Were you affected by this layoff?</p>
          <p className="mt-1.5 text-sm leading-relaxed text-white/75 sm:text-base">
            Use JobQue to assist with your next job hunt &ndash; use code at checkout:
          </p>
        </div>
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
          <CouponCode code={JOBQUE_COUPON} />
          <a href={JOBQUE_URL} target="_blank" rel="noopener noreferrer" className="btn-primary whitespace-nowrap">
            Go to JobQue <ArrowRight size={16} />
          </a>
        </div>
      </div>
    </div>
  )
}
