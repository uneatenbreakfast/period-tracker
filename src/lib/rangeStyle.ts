/**
 * Range-run cell shapes — the "continuous strip" look for period runs and
 * drag previews. A run's first day gets a left semicircle cap, its last day
 * a right cap, interior days are flush squares, and a one-day run keeps the
 * full circle. Pure so the shape rules are unit-testable; the class assembly
 * lives in Calendar.tsx.
 */
import { addDays } from './dates'

export type DayShape = 'single' | 'start' | 'middle' | 'end'

/**
 * Shape a member day inside a run of consecutive flow days. Membership is
 * decided by the `hasFlow` predicate over global ISO dates (not per-month),
 * so a run continuing across a month boundary is one continuous strip:
 * July 30–31 + Aug 1–2 → Jul 30 = start, Jul 31 + Aug 1 = middle, Aug 2 = end.
 */
export function runShape(iso: string, hasFlow: (iso: string) => boolean): DayShape | null {
  if (!hasFlow(iso)) return null
  const prev = hasFlow(addDays(iso, -1))
  const next = hasFlow(addDays(iso, 1))
  if (!prev && !next) return 'single'
  if (!prev) return 'start'
  if (!next) return 'end'
  return 'middle'
}

/**
 * Shape a cell inside a drag preview range. Order-agnostic (`from`/`to` swap
 * normalized) — the drag state machine stores start/end unnormalized.
 * Cells outside the range are null.
 */
export function dragShape(iso: string, from: string, to: string): DayShape | null {
  const [a, b] = from <= to ? [from, to] : [to, from]
  if (iso < a || iso > b) return null
  if (a === b) return 'single'
  if (iso === a) return 'start'
  if (iso === b) return 'end'
  return 'middle'
}
