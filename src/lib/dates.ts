/** Date helpers — local-timezone safe (no UTC shifting). All date keys are YYYY-MM-DD. */

const pad = (n: number) => String(n).padStart(2, '0')

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function fromISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function todayISO(): string {
  return toISODate(new Date())
}

export function addDays(iso: string, n: number): string {
  const d = fromISODate(iso)
  d.setDate(d.getDate() + n)
  return toISODate(d)
}

/** Whole days from b to a (a - b). Negative when a < b. */
export function diffDays(a: string, b: string): number {
  const ms = fromISODate(a).getTime() - fromISODate(b).getTime()
  return Math.round(ms / 86_400_000)
}

export function isValidISO(iso: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) && !Number.isNaN(fromISODate(iso).getTime())
}

export interface MonthCell {
  iso: string
  inMonth: boolean
}

/** Calendar grid for a month: array of weeks, each 7 cells (Mon-first), padded from prev/next month. */
export function monthGrid(year: number, month: number): MonthCell[][] {
  // month: 0-based
  const first = new Date(year, month, 1)
  // Monday-first: pad = (getDay() + 6) % 7
  const padStart = (first.getDay() + 6) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: MonthCell[] = []
  const gridStart = new Date(year, month, 1 - padStart)
  const total = Math.ceil((padStart + daysInMonth) / 7) * 7
  for (let i = 0; i < total; i++) {
    const d = new Date(gridStart)
    d.setDate(gridStart.getDate() + i)
    cells.push({ iso: toISODate(d), inMonth: d.getMonth() === month })
  }
  const weeks: MonthCell[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const

export const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const