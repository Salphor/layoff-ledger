'use client'

import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'

// Light/dark switch. The first visit follows the device setting; clicking
// saves the choice in this browser. THEME_SCRIPT (in layout.tsx) applies the
// saved choice before the page paints, so there is no white flash.
export const THEME_KEY = 'll-theme'

export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('${THEME_KEY}');var d=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.classList.toggle('dark',d)}catch(e){}})()`

export default function ThemeToggle({ className = '' }: { className?: string }) {
  const [dark, setDark] = useState<boolean | null>(null)

  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'))
    // Follow the device setting until the visitor picks one here.
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (e: MediaQueryListEvent) => {
      let saved: string | null = null
      try { saved = localStorage.getItem(THEME_KEY) } catch {}
      if (saved) return
      document.documentElement.classList.toggle('dark', e.matches)
      setDark(e.matches)
    }
    mq.addEventListener?.('change', onChange)
    return () => mq.removeEventListener?.('change', onChange)
  }, [])

  function toggle() {
    const next = !document.documentElement.classList.contains('dark')
    document.documentElement.classList.toggle('dark', next)
    try { localStorage.setItem(THEME_KEY, next ? 'dark' : 'light') } catch {}
    setDark(next)
  }

  const label = dark ? 'Switch to light mode' : 'Switch to dark mode'
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className={`flex h-11 w-11 shrink-0 items-center justify-center border-2 border-line bg-surface text-ink transition-colors hover:bg-lime hover:text-coal ${className}`}
    >
      {/* Before hydration we don't know the theme; show the icon via CSS instead. */}
      {dark === null ? (
        <>
          <Moon size={20} className="dark:hidden" aria-hidden="true" />
          <Sun size={20} className="hidden dark:block" aria-hidden="true" />
        </>
      ) : dark ? (
        <Sun size={20} aria-hidden="true" />
      ) : (
        <Moon size={20} aria-hidden="true" />
      )}
    </button>
  )
}
