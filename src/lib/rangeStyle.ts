/**
 * Range-run cell shapes — the "continuous strip" look for period runs and
 * drag previews. A run's first day gets a left semicircle cap, its last day
 * a right cap, interior days are flush squares, and a one-day run keeps the
 * full circle. Pure so the shape rules are unit-testable; the Tailwind
 * layout/fill helpers (`cellLayoutClass`, `cellFillClass`) are defined here
 * and consumed by Calendar.tsx.
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

/**
 * Concave "scoop" corner for an untinted cell that sits in the inner corner
 * of an even-month tint block (e.g. Sep 1 directly right+below Aug 31 in the
 * same grid row-pair). The cell paints the tint as its own background and a
 * white overlay with the rounded corner on top — the tint shows through only
 * in the scooped corner, so the block's convex rounding gets a matching
 * concave counterpart. Returns '' when no scoop applies (needs BOTH a tinted
 * left and a tinted top neighbor, and the cell itself untinted).
 */
export function monthScoopClass(
  selfTinted: boolean,
  leftTinted: boolean,
  topTinted: boolean,
): string {
  if (selfTinted || !leftTinted || !topTinted) return ''
  return 'rounded-tl-xl'
}

/**
 * Layout (width + corner rounding) for a calendar day cell. Period-shaped
 * cells keep their capsule-strip / lone-circle geometry on EVERY month —
 * including even-month tint-block months, where unshaped cells render as
 * full-width flush squares instead of centered circles.
 */
export function cellLayoutClass(
  shape: DayShape | null,
  scoop: boolean,
  monthTint: boolean,
): string {
  if (shape === 'single') return 'mx-auto w-full max-w-11 rounded-full'
  if (shape === 'start') return 'w-full rounded-l-full rounded-r-none'
  if (shape === 'end') return 'w-full rounded-r-full rounded-l-none'
  if (shape) return 'w-full rounded-none'
  if (scoop) return 'w-full rounded-none'
  if (monthTint) return 'w-full rounded-none'
  return 'mx-auto w-full max-w-11 rounded-full'
}

/**
 * Fill/text classes for a day cell — emits EXACTLY ONE background utility.
 * Stacking the month tint under a specific fill lets Tailwind's stylesheet
 * emission order pick the winner (it picked slate over rose, painting period
 * strips gray on tinted months), so precedence is decided here instead.
 * A shaped period cell always paints rose; the scoop cell carries the tint
 * itself (its white overlay reveals it in the scooped corner).
 */
export function cellFillClass(
  shape: DayShape | null,
  scoop: boolean,
  fertile: boolean,
  predicted: boolean,
  monthTint: boolean,
): string {
  if (shape) return 'bg-rose-400 font-bold text-white shadow-[0_3px_10px_rgba(217,111,147,0.45)]'
  if (scoop) return 'bg-slate-100'
  if (fertile) return 'bg-lavender-100 font-semibold text-lavender-700'
  if (predicted) {
    return `${monthTint ? 'bg-slate-100 ' : ''}border-2 border-dashed border-rose-300 text-rose-400`
  }
  if (monthTint) return 'bg-slate-100'
  return ''
}
