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

/** Inclusive ISO date list from a to b, order-agnostic, ascending. */
export function dateRange(a: string, b: string): string[] {
  const [start, end] = a <= b ? [a, b] : [b, a]
  const out: string[] = []
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d)
  return out
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

/** Continuous calendar grid across a month window: ONE flowing Mon-first strip
 * where weeks span month boundaries — if a month ends on Tue 31, the next
 * month's 1st continues the SAME row on Wed. Only the Monday before the first
 * month and the Sunday after the last month pad the strip (inMonth = false). */
export function continuousGrid(months: MonthRef[]): MonthCell[][] {
  if (months.length === 0) return []
  const first = months[0]
  const last = months[months.length - 1]
  const firstDate = new Date(first.year, first.month, 1)
  const lastDate = new Date(last.year, last.month + 1, 0)
  // Monday-first: pad = (getDay() + 6) % 7
  const padStart = (firstDate.getDay() + 6) % 7
  const padEnd = 6 - ((lastDate.getDay() + 6) % 7)
  const start = new Date(first.year, first.month, 1 - padStart)
  const end = new Date(last.year, last.month, lastDate.getDate() + padEnd)
  const cells: MonthCell[] = []
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    cells.push({ iso: toISODate(d), inMonth: d >= firstDate && d <= lastDate })
  }
  const weeks: MonthCell[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

export interface MonthRef {
  year: number
  month: number // 0-based
}

/** Shift a 0-based month by n months, wrapping year boundaries. */
export function addMonths(year: number, month: number, n: number): MonthRef {
  const t = year * 12 + month + n
  return { year: Math.floor(t / 12), month: ((t % 12) + 12) % 12 }
}

/** Inclusive list of months from → to (0-based), oldest first. */
export function monthList(from: MonthRef, to: MonthRef): MonthRef[] {
  const out: MonthRef[] = []
  const end = to.year * 12 + to.month
  for (let t = from.year * 12 + from.month; t <= end; t++) out.push({ year: Math.floor(t / 12), month: t % 12 })
  return out
}

/** Months shown ahead of the current month — the calendar never renders further into the future. */
export const FUTURE_MONTHS = 1

/** Months of history shown initially (the "last N months" of the past). */
export const PAST_MONTHS = 6

/** Months added each time the user taps "Load older periods". */
export const LOAD_STEP = 6

/** Month (0-based) at most FUTURE_MONTHS ahead of `now` — the window's forward edge. */
export function futureLimitMonth(now: Date = new Date()): MonthRef {
  return addMonths(now.getFullYear(), now.getMonth(), FUTURE_MONTHS)
}

/** Initial month window: the last PAST_MONTHS months (ending one before the
 *  current month), capped FUTURE_MONTHS ahead. Older history is revealed on
 *  demand via loadOlderMonths — never by auto-scroll. */
export function initialMonths(now: Date = new Date()): MonthRef[] {
  const start = addMonths(now.getFullYear(), now.getMonth(), -PAST_MONTHS)
  return monthList(start, futureLimitMonth(now))
}

/** Months to prepend when the user taps "Load older periods" — LOAD_STEP more
 *  months of history before the current oldest month. */
export function loadOlderMonths(first: MonthRef, step: number = LOAD_STEP): MonthRef[] {
  return monthList(addMonths(first.year, first.month, -step), addMonths(first.year, first.month, -1))
}

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const

export const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const