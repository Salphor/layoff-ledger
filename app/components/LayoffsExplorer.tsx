'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { ChevronRight, MapPin, Search, Users, X } from 'lucide-react'
import type { LayoffEvent } from '@/lib/types'
import { formatDate } from '@/lib/site'

const PAGE_SIZE = 25

export default function LayoffsExplorer({ events }: { events: LayoffEvent[] }) {
  const [query, setQuery] = useState('')
  const [onlyCounts, setOnlyCounts] = useState(false)
  const [visible, setVisible] = useState(PAGE_SIZE)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return events.filter((e) => {
      if (onlyCounts && !(e.employees_affected || e.employee_count_text)) return false
      if (!q) return true
      const hay = [e.company?.canonical_name, e.summary, ...(e.locations || [])].join(' ').toLowerCase()
      return hay.includes(q)
    })
  }, [events, query, onlyCounts])

  const shown = filtered.slice(0, visible)

  return (
    <div>
      {/* Toolbar */}
      <div className="card mb-4 flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-brand-navy/40" />
          <input
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setVisible(PAGE_SIZE) }}
            placeholder="Search company, location, or keyword"
            aria-label="Search layoffs"
            className="w-full rounded-lg border border-brand-navy/10 bg-[#F6F6F4] py-2.5 pl-10 pr-9 text-sm placeholder:text-brand-navy/40 focus:border-brand-green focus:bg-white"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-brand-navy/40 hover:text-brand-navy"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <label className="flex cursor-pointer select-none items-center gap-2 rounded-lg border border-brand-navy/10 px-3 py-2.5 text-sm font-medium text-brand-navy/80 hover:bg-[#F6F6F4]">
          <input
            type="checkbox"
            checked={onlyCounts}
            onChange={(e) => { setOnlyCounts(e.target.checked); setVisible(PAGE_SIZE) }}
            className="h-4 w-4 rounded border-brand-navy/30 accent-brand-green"
          />
          Disclosed counts only
        </label>
      </div>

      <p className="mb-3 px-1 text-xs font-medium text-brand-navy/55">
        Showing {shown.length.toLocaleString()} of {filtered.length.toLocaleString()} records
      </p>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="hidden grid-cols-12 gap-4 border-b border-brand-navy/10 bg-[#F6F6F4] px-6 py-3 text-xs font-semibold uppercase tracking-wider text-brand-navy/55 md:grid">
          <div className="col-span-3">Company</div>
          <div className="col-span-5">Summary</div>
          <div className="col-span-2">Workers</div>
          <div className="col-span-2">Location</div>
        </div>

        {shown.length === 0 && (
          <div className="px-6 py-16 text-center">
            <p className="font-semibold">No records match your filters.</p>
            <p className="mt-1 text-sm text-brand-navy/60">Try a different search term.</p>
          </div>
        )}

        <ul className="divide-y divide-brand-navy/10">
          {shown.map((event) => (
            <li key={event.id}>
              <Link
                href={`/companies/${event.company?.slug}`}
                className="group grid gap-3 px-6 py-5 transition hover:bg-brand-green/[0.04] md:grid-cols-12 md:items-center md:gap-4"
              >
                <div className="md:col-span-3">
                  <p className="font-semibold leading-snug text-brand-navy group-hover:text-brand-green">
                    {event.company?.canonical_name}
                  </p>
                  <p className="mt-0.5 text-xs text-brand-navy/50">{formatDate(event.date_announced || event.created_at)}</p>
                </div>
                <p className="line-clamp-2 text-sm leading-relaxed text-brand-navy/75 md:col-span-5">{event.summary}</p>
                <div className="md:col-span-2">
                  {event.employees_affected || event.employee_count_text ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-green/10 px-2.5 py-1 text-xs font-semibold text-brand-green">
                      <Users size={12} />
                      {event.employees_affected?.toLocaleString() || event.employee_count_text}
                    </span>
                  ) : (
                    <span className="text-xs text-brand-navy/40">Not disclosed</span>
                  )}
                </div>
                <div className="flex items-center justify-between gap-2 md:col-span-2">
                  <span className="flex min-w-0 items-center gap-1.5 text-xs text-brand-navy/65">
                    {event.locations && event.locations.length > 0 ? (
                      <>
                        <MapPin size={12} className="shrink-0" />
                        <span className="truncate">{event.locations.join(', ')}</span>
                      </>
                    ) : (
                      <span className="text-brand-navy/40">—</span>
                    )}
                  </span>
                  <ChevronRight size={16} className="shrink-0 text-brand-navy/25 transition group-hover:translate-x-0.5 group-hover:text-brand-green" />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>

      {visible < filtered.length && (
        <div className="mt-6 text-center">
          <button
            onClick={() => setVisible((v) => v + PAGE_SIZE)}
            className="rounded-lg border border-brand-navy/15 bg-white px-6 py-2.5 text-sm font-semibold transition hover:border-brand-green hover:text-brand-green"
          >
            Load more
          </button>
        </div>
      )}
    </div>
  )
}
