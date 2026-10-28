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
      className="inline-flex items-center gap-2 border-2 border-dashed border-lime px-3 py-1 font-mono text-sm font-bold uppercase tracking-wide text-lime transition-colors hover:bg-lime hover:text-coal"
    >
      {code}
      {copied ? <Check size={14} /> : <Copy size={14} />}
    </button>
  )
}
