import { ArrowRight } from 'lucide-react'
import { JOBQUE_COUPON, JOBQUE_DISCOUNT, JOBQUE_URL } from '@/lib/site'
import CouponCode from './CouponCode'

export default function JobQueCta() {
  return (
    <div className="relative overflow-hidden rounded-xl bg-brand-green-dark p-6 text-white sm:p-8">
      <div className="bg-grid absolute inset-0 opacity-60" />
      <div className="relative">
        <p className="text-lg font-bold leading-snug sm:text-xl">Were you affected by this layoff?</p>
        <p className="mt-2 max-w-2xl text-sm leading-[2.4] text-white/80 sm:text-base sm:leading-[2.4]">
          Check out JobQue to help with your next job hunt, use code <CouponCode code={JOBQUE_COUPON} /> for a{' '}
          <strong className="font-semibold text-brand-gold">{JOBQUE_DISCOUNT}%</strong> discount.
        </p>
        <a href={JOBQUE_URL} target="_blank" rel="noopener noreferrer" className="btn-primary mt-5">
          Go to JobQue <ArrowRight size={16} />
        </a>
      </div>
    </div>
  )
}
