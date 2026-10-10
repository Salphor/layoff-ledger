export const JOBQUE_URL = 'https://jobque.ai'

// Date-only strings (e.g. "2026-10-09") are parsed as UTC; format in UTC so
// the displayed day never shifts by timezone.
export function formatDate(
  value: string | null | undefined,
  style: 'long' | 'short' = 'short'
): string {
  if (!value) return 'Not disclosed'
  const d = new Date(value)
  if (isNaN(d.getTime())) return 'Not disclosed'
  return d.toLocaleDateString('en-US', {
    month: style === 'long' ? 'long' : 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}
