'use client'

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'

export default function CouponCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard can be blocked; the code is still visible to select by hand.
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={`Copy promo code ${code}`}
      className="inline-flex items-center gap-2 rounded-lg border border-dashed border-brand-gold bg-white/10 px-3 py-1 font-mono text-sm font-semibold tracking-wide text-brand-gold transition hover:bg-white/20"
    >
      {code}
      {copied ? <Check size={14} /> : <Copy size={14} />}
    </button>
  )
}
