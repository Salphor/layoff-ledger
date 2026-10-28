'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { ArrowRight, Search, X } from 'lucide-react'
import type { DirectoryCompany } from '@/lib/types'
import { companyHref, isoDate } from '@/lib/site'

const LETTERS = ['#', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')]

// "#" for names that start with a digit or symbol.
function letterOf(name: string): string {
  const c = name.trim().charAt(0).toUpperCase()
  return c >= 'A' && c <= 'Z' ? c : '#'
}

// Ignore case, accents and punctuation when searching ("at&t" finds "AT&T").
function norm(s: string): string {
  return s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

export default function CompaniesDirectory({ companies }: { companies: DirectoryCompany[] }) {
  const [query, setQuery] = useState('')

  const indexed = useMemo(() => companies.map((c) => ({ ...c, key: norm(c.name), letter: letterOf(c.name) })), [companies])

  const groups = useMemo(() => {
    const q = norm(query)
    const words = q ? q.split(' ') : []
    const map = new Map<string, typeof indexed>()
    for (const c of indexed) {
      if (words.length && !words.every((w) => c.key.includes(w))) continue
      const list = map.get(c.letter) || []
      list.push(c)
      map.set(c.letter, list)
    }
    return LETTERS.filter((l) => map.has(l)).map((l) => ({ letter: l, items: map.get(l)! }))
  }, [indexed, query])

  const present = new Set(groups.map((g) => g.letter))
  const total = groups.reduce((n, g) => n + g.items.length, 0)

  return (
    <div>
      <div className="z-30 -mx-4 sm:sticky sm:top-[74px] border-b-2 border-line bg-bone px-4 pb-3 pt-4 sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10">
        <div className="relative">
          <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search a company"
            aria-label="Search companies"
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
        <nav aria-label="Jump to letter" className="mt-3 flex flex-wrap gap-1">
          {LETTERS.map((l) =>
            present.has(l) ? (
              <a
                key={l}
                href={`#letter-${l === '#' ? 'num' : l}`}
                className="flex h-8 min-w-[32px] items-center justify-center border-2 border-line bg-surface font-mono text-sm font-bold hover:bg-lime hover:text-coal"
              >
                {l}
              </a>
            ) : (
              <span
                key={l}
                aria-hidden="true"
                className="flex h-8 min-w-[32px] items-center justify-center border-2 border-muted/30 font-mono text-sm text-muted/50"
              >
                {l}
              </span>
            )
          )}
        </nav>
      </div>

      <p className="label mt-6 text-muted">
        {total.toLocaleString()} {total === 1 ? 'company' : 'companies'}
        {query ? ` matching “${query}”` : ''}
      </p>

      {total === 0 && (
        <div className="mt-4 border-2 border-line bg-surface px-6 py-16 text-center">
          <p className="text-lg font-bold">No company matches “{query}”.</p>
          <p className="mt-1 text-sm text-muted">
            It may not have a recorded layoff yet. Check the <Link href="/layoffs" className="link">latest layoffs</Link>.
          </p>
        </div>
      )}

      <div className="mt-4 space-y-10">
        {groups.map((g) => (
          <section key={g.letter} id={`letter-${g.letter === '#' ? 'num' : g.letter}`} className="scroll-mt-[200px]">
            <h2 className="mb-3 text-[56px] font-bold leading-none tracking-giant">{g.letter}</h2>
            <ul className="border-2 border-line bg-surface">
              <li className="hidden grid-cols-12 gap-6 border-b-2 border-line px-5 py-2.5 md:grid" aria-hidden="true">
                <span className="label col-span-6">[ Company ]</span>
                <span className="label col-span-2">[ Events ]</span>
                <span className="label col-span-2">[ Workers ]</span>
                <span className="label col-span-2">[ Latest ]</span>
              </li>
              {g.items.map((c) => (
                <li key={c.id} className="border-b-2 border-line last:border-b-0">
                  <Link
                    href={companyHref(c)}
                    className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-5 py-4 transition-colors hover:bg-lime-tint md:grid-cols-12 md:gap-6"
                  >
                    <span className="text-lg font-bold leading-snug group-hover:underline group-hover:decoration-2 md:col-span-6">
                      {c.name}
                    </span>
                    <ArrowRight size={18} className="row-span-2 shrink-0 transition-transform group-hover:translate-x-1 md:order-last md:hidden" aria-hidden="true" />
                    <span className="font-mono text-xs text-muted md:col-span-2 md:text-sm md:text-ink">
                      <span className="md:hidden">{c.events} {c.events === 1 ? 'event' : 'events'} · {isoDate(c.latest)}</span>
                      <span className="hidden md:inline">{c.events}</span>
                    </span>
                    <span className="hidden font-mono text-sm tabular-nums md:col-span-2 md:block">
                      {c.workers ? c.workers.toLocaleString('en-US') : '—'}
                    </span>
                    <span className="hidden items-center justify-between font-mono text-sm md:col-span-2 md:flex">
                      {isoDate(c.latest)}
                      <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" aria-hidden="true" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}
