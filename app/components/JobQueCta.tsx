import { ArrowRight } from 'lucide-react'
import { JOBQUE_COUPON, JOBQUE_DISCOUNT, JOBQUE_URL } from '@/lib/site'
import CouponCode from './CouponCode'

// The JobQueAi "companion" offer shown under a layoff record.
export default function JobQueCta() {
  return (
    <div className="bg-ink p-6 text-white sm:p-8">
      <p className="label text-lime">[ Your next 20 days ]</p>
      <p className="mt-3 text-2xl font-bold leading-tight tracking-[-0.03em] sm:text-3xl">Were you affected by this layoff?</p>
      <p className="mt-3 max-w-2xl text-base leading-[2.2] text-grey">
        JobQueAi works with you every day as a job-search companion, building a list of companies worth applying to. Use
        code <CouponCode code={JOBQUE_COUPON} /> for a <span className="font-bold text-lime">{JOBQUE_DISCOUNT}%</span>{' '}
        discount.
      </p>
      <a href={JOBQUE_URL} target="_blank" rel="noopener noreferrer" className="btn-lime mt-6">
        Start with JobQueAi <ArrowRight size={16} />
      </a>
    </div>
  )
}
