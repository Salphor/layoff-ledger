export default function RadarMark({ className = 'h-8 w-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#2C5F3E" />
      <circle cx="16" cy="16" r="11" fill="none" stroke="#CBA95D" strokeOpacity="0.35" strokeWidth="1.5" />
      <circle cx="16" cy="16" r="6.5" fill="none" stroke="#CBA95D" strokeOpacity="0.6" strokeWidth="1.5" />
      <path d="M16 16 L16 5" stroke="#CBA95D" strokeWidth="2" strokeLinecap="round" />
      <path d="M16 16 L24.5 10.5 A11 11 0 0 0 16 5 Z" fill="#CBA95D" fillOpacity="0.28" />
      <circle cx="16" cy="16" r="2.2" fill="#CBA95D" />
    </svg>
  )
}
