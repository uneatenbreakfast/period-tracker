/**
 * Range-run cell shapes — the "continuous strip" look for period runs and
 * drag previews. A run's first day gets a left semicircle cap, its last day
 * a right cap, interior days are flush squares, and a one-day run keeps the
 * full circle. Pure so the shape rules are unit-testable; the Tailwind
 * layout/fill helpers (`cellLayoutClass`, `cellFillClass`) are defined here
 * and consumed by Calendar.tsx.
 *
 * Also provides `monthTintSegments` — per-week-row tint runs that Calendar
 * paints as plain DOM divs behind the day buttons (replaces the old unified
 * full-grid SVG month background).
 */
import { addDays } from './dates'
import type { MonthCell } from './dates'
import type { CalendarStyle } from '../types'
import { contrastRing, darken, lighten } from './color'

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
 * of an even-month tint block. Two orientations:
 *
 *   'tl' — left+top neighbors tinted (e.g. Sep 1 with Aug tint to its left
 *          and above). White overlay with rounded-tl covers the cell; tint
 *          shows through the left strip and the scooped top-left corner.
 *
 *   'br' — right+bottom neighbors tinted (e.g. Sep 30 with Oct tint to its
 *          right and below). White overlay with rounded-br covers the cell;
 *          tint shows through the right strip and the scooped bottom-right
 *          corner.
 *
 * Returns '' when no scoop applies (self tinted, or not enough tinted
 * neighbors).
 */
export function monthScoopClass(
  selfTinted: boolean,
  leftTinted: boolean,
  topTinted: boolean,
  rightTinted = false,
  bottomTinted = false,
): string {
  if (selfTinted) return ''
  if (leftTinted && topTinted) return 'tl'
  if (rightTinted && bottomTinted) return 'br'
  return ''
}

/**
 * Layout (width + corner rounding) for a calendar day cell. Period-shaped
 * cells keep their capsule-strip / lone-circle geometry. Month backgrounds
 * are now rendered as unified SVG shapes behind the grid.
 */
export function cellLayoutClass(shape: DayShape | null): string {
  if (shape === 'single') return 'mx-auto w-full max-w-11 rounded-full'
  if (shape === 'start') return 'w-full rounded-l-full rounded-r-none'
  if (shape === 'end') return 'w-full rounded-r-full rounded-l-none'
  if (shape) return 'w-full rounded-none'
  return 'mx-auto w-full max-w-11 rounded-full'
}

/**
 * Border-side classes for a predicted-day strip — width/dash only; the color
 * lives in `cellFillStyle` (user-pickable, BLOOM-0022). The dashed outline
 * wraps the whole run, not each cell — middle cells skip left/right borders.
 */
function predictedStripBorder(shape: DayShape): string {
  const base = 'border-dashed'
  if (shape === 'single') return `border ${base}`
  if (shape === 'start') return `border-y border-l ${base}`
  if (shape === 'end') return `border-y border-r ${base}`
  return `border-y ${base}` // middle
}

/**
 * Fill/text classes for a day cell. COLOR utilities live in `cellFillStyle`
 * (they are user-pickable inline styles); this helper only carries geometric
 * classes: border side/width for the predicted strip, and font weights/tone.
 * Month backgrounds are rendered as unified SVG shapes behind the grid, so
 * unshaped cells are transparent.
 *
 * @param shapeOrigin — which range type produced the shape, so the fill
 *   treatment matches. undefined = period (default rose).
 */
export function cellFillClass(
  shape: DayShape | null,
  fertile: boolean,
  predicted: boolean,
  safe: boolean,
  monthTint: boolean,
  shapeOrigin?: 'period' | 'fertile' | 'predicted' | 'safe',
): string {
  if (shape) {
    if (shapeOrigin === 'fertile') return 'font-semibold'
    if (shapeOrigin === 'safe') return 'font-semibold'
    if (shapeOrigin === 'predicted') return `${predictedStripBorder(shape)} font-semibold`
    // Period shape (or drag preview) — white text on the color fill.
    return monthTint ? 'font-bold text-white' : 'font-bold text-white'
  }
  if (fertile) return 'font-semibold'
  if (safe) return 'font-semibold'
  if (predicted) return 'border border-dashed'
  return ''
}

/**
 * Inline color styles for a day cell — the user-pickable CalendarStyle
 * (BLOOM-0022) replaces the old hard-coded Tailwind color utilities.
 * Derived shades: fertile/safe text = darken(fill), ovulation ring handled
 * in Calendar (needs a lighter ring + dot pair).
 */
export interface CellFillStyle {
  backgroundColor?: string
  color?: string
  borderColor?: string
}

export function cellFillStyle(
  shape: DayShape | null,
  fertile: boolean,
  predicted: boolean,
  safe: boolean,
  monthTint: boolean,
  style: CalendarStyle,
  shapeOrigin?: 'period' | 'fertile' | 'predicted' | 'safe',
): CellFillStyle {
  if (shape) {
    if (shapeOrigin === 'fertile') return { backgroundColor: style.fertile, color: darken(style.fertile, 0.42) }
    if (shapeOrigin === 'safe') return { backgroundColor: style.safe, color: darken(style.safe, 0.35) }
    if (shapeOrigin === 'predicted') return { borderColor: style.predicted, color: style.predicted }
    // Period shape (or drag preview) — rose fill; on tinted months the SVG
    // month shape shows through the transparent cell, and Calendar paints
    // the solid fill as a child overlay span.
    return monthTint ? {} : { backgroundColor: style.period }
  }
  if (fertile) return { backgroundColor: style.fertile, color: darken(style.fertile, 0.42) }
  if (safe) return { backgroundColor: style.safe, color: darken(style.safe, 0.35) }
  if (predicted) return { borderColor: style.predicted, color: style.predicted }
  return {}
}

/** Soft ring shade for the ovulation dot — the fill lightened ~55% to white. */
export function ovulationRing(style: CalendarStyle): string {
  return lighten(style.ovulation, 0.55)
}

/**
 * Selection ring shade for a SELECTED day. Plain (unshaped) cells return
 * null — Calendar keeps the static rose outline there. Shaped cells sit on a
 * solid user-pickable fill (period/fertile/safe runs, drag preview), so the
 * ring color must INVERT relative to that fill or it disappears into the
 * highlight. Predicted cells are dashed + transparent → null (no fill to
 * clash with).
 */
export function selectionRingColor(
  shape: DayShape | null,
  shapeOrigin: 'period' | 'fertile' | 'predicted' | 'safe' | undefined,
  style: CalendarStyle,
): string | null {
  if (!shape) return null
  const fill =
    shapeOrigin === 'fertile'
      ? style.fertile
      : shapeOrigin === 'safe'
        ? style.safe
        : shapeOrigin === 'predicted'
          ? null
          : style.period // committed period, or drag preview (origin undefined)
  return fill ? contrastRing(fill) : null
}

/**
 * One horizontal run of tinted cells inside a single week row — the DOM
 * replacement for the unified month-background SVG. Each tinted month paints
 * one absolutely-positioned div per (week row × contiguous in-month columns)
 * run; the divs stack flush across rows and butt against each other, so they
 * read as one continuous band exactly like the old SVG blob. No geometry
 * measurement is needed (each segment just fills its own row) and there is no
 * giant composited vector layer — the old single full-grid SVG exceeded phone
 * GPU texture budgets when promoted and rendered as a corrupt displaced blob
 * on the Fold 8, and re-tessellated per scroll frame everywhere else.
 */
export interface MonthTintSeg {
  /** YYYY-MM of the tinted month this segment belongs to. */
  monthKey: string
  /** Week row index within `weeks`. */
  row: number
  /** First (leftmost) in-month column of this run, inclusive. */
  c0: number
  /** Last (rightmost) in-month column of this run, inclusive. */
  c1: number
  /** Round this corner (a month-block convex corner lands on this segment). */
  tl: boolean
  tr: boolean
  bl: boolean
  br: boolean
}

/**
 * Corner radius of rounded month-tint corners, px. ~0.35 × a typical day cell
 * (~48 px) — the same proportion the SVG blob used, kept fixed so the tint
 * needs no DOM measurement at all.
 */
export const TINT_RADIUS_PX = 16

/**
 * Which calendar months get the alternating background tint. Even-numbered
 * months (2,4,6,8,10,12) are tinted, odd months are plain — the original
 * alternating-strip design (0dff7c6); a Sep 3 inversion to odd months left
 * August (8) permanently untinted, which was reported as broken.
 *
 * @param monthKey — YYYY-MM month key from `MonthCell.iso.slice(0, 7)`
 */
export function isTintMonth(monthKey: string): boolean {
  return Number(monthKey.slice(5, 7)) % 2 === 0
}

export function monthTintSegments(weeks: MonthCell[][]): MonthTintSeg[] {
  const out: MonthTintSeg[] = []
  // Month key of the cell at (r, c), or null when out of bounds / not in-month.
  const mkAt = (r: number, c: number): string | null => {
    const row = weeks[r]
    if (!row) return null
    const cell = row[c]
    if (!cell || !cell.inMonth) return null
    return cell.iso.slice(0, 7)
  }
  for (let r = 0; r < weeks.length; r++) {
    const row = weeks[r]
    let c = 0
    while (c < row.length) {
      const mk = mkAt(r, c)
      if (!mk || !isTintMonth(mk)) {
        c += 1
        continue
      }
      // Extend the run while the row is still inside the same month.
      let c1 = c
      while (c1 + 1 < row.length && mkAt(r, c1 + 1) === mk) c1 += 1
      // A band corner lands on the run's end cell only when BOTH its
      // vertical neighbor (same column, row above/below) and its horizontal
      // neighbor (left/right of the run) are outside the month.
      const tl = mkAt(r - 1, c) !== mk && mkAt(r, c - 1) !== mk
      const tr = mkAt(r - 1, c1) !== mk && mkAt(r, c1 + 1) !== mk
      const bl = mkAt(r + 1, c) !== mk && mkAt(r, c - 1) !== mk
      const br = mkAt(r + 1, c1) !== mk && mkAt(r, c1 + 1) !== mk
      out.push({ monthKey: mk, row: r, c0: c, c1, tl, tr, bl, br })
      c = c1 + 1
    }
  }
  return out
}
