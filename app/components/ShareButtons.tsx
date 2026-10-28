'use client'

import { useState } from 'react'
import { Check, Link2 } from 'lucide-react'

// LinkedIn share + copy link. Uses a plain text label for LinkedIn because
// brand icons were removed from lucide-react 1.x.
export default function ShareButtons({ url, title, onDark = false }: { url: string; title: string; onDark?: boolean }) {
  const [copied, setCopied] = useState(false)
  const linkedIn = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`

  async function copy() {
    // Use the address bar URL so it works before a domain is configured.
    const href = typeof window !== 'undefined' ? window.location.href : url
    try {
      await navigator.clipboard.writeText(href)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {}
  }

  return (
    <div className="flex flex-wrap gap-3">
      <a
        href={linkedIn}
        target="_blank"
        rel="noopener noreferrer"
        className={onDark ? 'btn-lime' : 'btn-primary'}
        aria-label={`Share "${title}" on LinkedIn`}
      >
        Share on LinkedIn
      </a>
      <button type="button" onClick={copy} className={onDark ? 'btn-ghost' : 'btn-secondary'}>
        {copied ? <Check size={16} /> : <Link2 size={16} />}
        {copied ? 'Link copied' : 'Copy link'}
      </button>
    </div>
  )
}
