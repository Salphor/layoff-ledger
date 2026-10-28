'use client'

import { useRef, useState } from 'react'

export interface TrendPoint {
  month: string // "2026-08"
  value: number
  label: string // formatted value, e.g. "1.64M"
  monthLabel: string // "Aug 2026"
}

// Small Signal-style line chart: 2px line, square lime marker on the latest
// month. Hover, tap or use the arrow keys to read any month.
export default function TrendChart({ points, title }: { points: TrendPoint[]; title: string }) {
  const [active, setActive] = useState<number | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const n = points.length
  const values = points.map((p) => p.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const pad = (max - min) * 0.12 || Math.abs(max) * 0.05 || 1
  const lo = min - pad
  const hi = max + pad

  // Coordinates in a 0-100 box; the SVG stretches to fill its container.
  const x = (i: number) => (n === 1 ? 50 : (i / (n - 1)) * 100)
  const y = (v: number) => 100 - ((v - lo) / (hi - lo)) * 100
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(2)},${y(p.value).toFixed(2)}`).join(' ')

  const shown = active ?? n - 1
  const cur = points[shown]
  const first = points[0]
  const last = points[n - 1]

  function pick(clientX: number) {
    const r = boxRef.current?.getBoundingClientRect()
    if (!r || r.width === 0) return
    const i = Math.round(((clientX - r.left) / r.width) * (n - 1))
    setActive(Math.max(0, Math.min(n - 1, i)))
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowLeft') { e.preventDefault(); setActive(Math.max(0, shown - 1)) }
    else if (e.key === 'ArrowRight') { e.preventDefault(); setActive(Math.min(n - 1, shown + 1)) }
    else if (e.key === 'Home') { e.preventDefault(); setActive(0) }
    else if (e.key === 'End') { e.preventDefault(); setActive(n - 1) }
    else if (e.key === 'Escape') setActive(null)
  }

  const summary = `${title}, ${first.monthLabel} to ${last.monthLabel}: from ${first.label} to ${last.label}. Low ${points[values.indexOf(min)].label}, high ${points[values.indexOf(max)].label}.`

  return (
    <div className="mt-5">
      {/* Readout: the latest month by default, the hovered month otherwise */}
      <p className="flex items-baseline justify-between gap-2 font-mono text-xs" aria-live="polite">
        <span className="font-bold uppercase">{cur.monthLabel}</span>
        <span className={`px-1 font-bold ${active === null ? 'bg-lime text-coal' : ''}`}>{cur.label}</span>
      </p>
      <div
        ref={boxRef}
        role="img"
        aria-label={summary}
        tabIndex={0}
        onKeyDown={onKey}
        onPointerMove={(e) => pick(e.clientX)}
        onPointerDown={(e) => pick(e.clientX)}
        onPointerLeave={() => setActive(null)}
        onBlur={() => setActive(null)}
        className="relative mt-2 h-20 cursor-crosshair touch-pan-y border-b-2 border-line"
      >
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
          <path d={path} fill="none" stroke="currentColor" strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          {active !== null && (
            <line x1={x(shown)} x2={x(shown)} y1={0} y2={100} stroke="currentColor" strokeWidth={1} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" opacity={0.5} />
          )}
        </svg>
        {/* Markers are HTML so they stay square when the chart stretches */}
        <span
          className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 border-2 border-line bg-lime"
          style={{ left: `${x(n - 1)}%`, top: `${y(last.value)}%` }}
          aria-hidden="true"
        />
        {active !== null && active !== n - 1 && (
          <span
            className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 border-2 border-line bg-surface"
            style={{ left: `${x(shown)}%`, top: `${y(cur.value)}%` }}
            aria-hidden="true"
          />
        )}
      </div>
      <p className="mt-1.5 flex justify-between font-mono text-[11px] uppercase text-muted" aria-hidden="true">
        <span>{first.monthLabel}</span>
        <span>{last.monthLabel}</span>
      </p>
    </div>
  )
}
