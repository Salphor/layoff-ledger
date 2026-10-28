'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { ArrowRight, Search, X } from 'lucide-react'
import type { LayoffEvent } from '@/lib/types'
import { asStringList, companyHref, isoDate, workersCount } from '@/lib/site'

const PAGE_SIZE = 25

export default function LayoffsExplorer({ events }: { events: LayoffEvent[] }) {
  const [query, setQuery] = useState('')
  const [onlyCounts, setOnlyCounts] = useState(false)
  const [visible, setVisible] = useState(PAGE_SIZE)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return events.filter((e) => {
      if (onlyCounts && !workersCount(e)) return false
      if (!q) return true
      const hay = [e.company?.canonical_name, e.summary, ...asStringList(e.locations)].join(' ').toLowerCase()
      return hay.includes(q)
    })
  }, [events, query, onlyCounts])

  const shown = filtered.slice(0, visible)

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
        <div className="relative flex-1">
          <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setVisible(PAGE_SIZE) }}
            placeholder="Search company, location or keyword"
            aria-label="Search layoffs"
            className="h-12 w-full border-2 border-line bg-surface pl-12 pr-10 text-base placeholder:text-muted focus:bg-lime-tint focus:outline-none"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 hover:bg-lime hover:text-coal"
            >
              <X size={16} />
            </button>
          )}
        </div>
        <label className="flex h-12 cursor-pointer select-none items-center gap-2 border-2 border-line bg-surface px-4 text-sm font-semibold hover:bg-lime-tint">
          <input
            type="checkbox"
            checked={onlyCounts}
            onChange={(e) => { setOnlyCounts(e.target.checked); setVisible(PAGE_SIZE) }}
            className="h-4 w-4 accent-ink"
          />
          Disclosed counts only
        </label>
      </div>

      <p className="label mt-6 mb-3 text-muted">
        Showing {shown.length.toLocaleString()} of {filtered.length.toLocaleString()} records
      </p>

      <div className="border-2 border-line bg-surface">
        <div className="hidden grid-cols-12 gap-6 border-b-2 border-line px-5 py-3 md:grid">
          <div className="label col-span-2">[ Workers ]</div>
          <div className="label col-span-3">[ Company ]</div>
          <div className="label col-span-5">[ Summary ]</div>
          <div className="label col-span-2">[ Announced ]</div>
        </div>

        {shown.length === 0 && (
          <div className="px-6 py-16 text-center">
            <p className="text-lg font-bold">No records match.</p>
            <p className="mt-1 text-sm text-muted">Try a different search, or browse <Link href="/companies" className="link">companies A–Z</Link>.</p>
          </div>
        )}

        <ul>
          {shown.map((event) => {
            const count = workersCount(event)
            const href = event.event_path || companyHref(event.company)
            const places = asStringList(event.locations)
            return (
              <li key={event.id} className="border-b-2 border-line last:border-b-0">
                <Link
                  href={href}
                  aria-disabled={!event.company}
                  onClick={(e) => { if (!event.company) e.preventDefault() }}
                  className="group grid gap-2 px-5 py-5 transition-colors hover:bg-lime-tint md:grid-cols-12 md:items-center md:gap-6"
                >
                  <div className="md:col-span-2">
                    {count ? (
                      <span className={`font-bold leading-none tabular-nums ${event.employees_affected ? 'text-[32px] tracking-[-0.04em]' : 'text-lg'}`}>{count}</span>
                    ) : (
                      <span className="font-mono text-xs text-muted">NOT DISCLOSED</span>
                    )}
                  </div>
                  <div className="md:col-span-3">
                    <p className="text-lg font-bold leading-snug group-hover:underline group-hover:decoration-2">
                      {event.company?.canonical_name || 'Company unavailable'}
                    </p>
                    {places.length > 0 && <p className="mt-0.5 truncate text-sm text-muted">{places.join(', ')}</p>}
                  </div>
                  <p className="line-clamp-2 text-[15px] leading-relaxed text-muted md:col-span-5">{event.summary}</p>
                  <div className="flex items-center justify-between gap-2 md:col-span-2">
                    <span className="font-mono text-sm">{isoDate(event.date_announced || event.announcement_date || event.created_at)}</span>
                    <ArrowRight size={18} className="shrink-0 transition-transform group-hover:translate-x-1" aria-hidden="true" />
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      </div>

      {visible < filtered.length && (
        <div className="mt-6 text-center">
          <button onClick={() => setVisible((v) => v + PAGE_SIZE)} className="btn-secondary">
            Load more
          </button>
        </div>
      )}
    </div>
  )
}
