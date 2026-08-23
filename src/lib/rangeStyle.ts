/**
 * Range-run cell shapes — the "continuous strip" look for period runs and
 * drag previews. A run's first day gets a left semicircle cap, its last day
 * a right cap, interior days are flush squares, and a one-day run keeps the
 * full circle. Pure so the shape rules are unit-testable; the class assembly
 * lives in Calendar.tsx.
 */
import { addDays } from './dates'

export type DayShape = 'single' | 'start' | 'middle' | 'end'

/** Radius (px) of the concave notch scooped into the top-left of a start cap. */
const CONCAVE_RADIUS = 16

/** Inline style that paints the concave top-left corner on a start cap via
 *  a radial-gradient. The gradient sits over the rose fill and shows the
 *  card/page background through a quarter-disc cutout at the top-left. */
export const START_CAP_STYLE = {
  backgroundImage:
    `radial-gradient(circle at 0% 0%, transparent ${CONCAVE_RADIUS}px, var(--tw-bg-opacity, 1) #e58aa8 ${CONCAVE_RADIUS}px)`,
} as const

/**
 * Corner rounding for each strip part. The start cap is asymmetric: its
 * bottom-left corner bulges outward (convex, `rounded-bl-full`) while its
 * top-left corner is scooped INWARD (concave) — Tailwind cannot express a
 * concave corner, so Calendar paints that notch with a radial-gradient
 * inline style (`START_CAP_STYLE`); these classes zero out every corner the
 * gradient does not own. The end cap keeps both right corners convex;
 * interiors are flush squares.
 */
export function stripCorners(shape: DayShape): string {
  switch (shape) {
    case 'start':
      return 'rounded-tl-none rounded-tr-none rounded-br-none rounded-bl-full'
    case 'end':
      return 'rounded-r-full rounded-l-none'
    case 'middle':
      return 'rounded-none'
    case 'single':
      return 'rounded-full'
  }
}

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