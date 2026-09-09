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

export function cellHighlightClass(
  shape: DayShape,
  shapeOrigin?: 'period' | 'fertile' | 'predicted' | 'safe',
): string {
  // Keep only vertical inset. Connected days must touch side-to-side so the
  // range reads as one continuous strip across adjacent cells.
  // Safe strips use explicit top/bottom offsets so their inset cannot be lost
  // when combined with calendar cell layout classes.
  const inset = shapeOrigin === 'safe'
    ? 'absolute top-[10px] bottom-[10px]'
    : 'absolute inset-y-[8px]'
  const geometry = shape === 'single'
    ? `${inset} left-[10px] right-[10px] rounded-full`
    : shape === 'start'
      ? `${inset} left-0 rounded-l-full rounded-r-none`
      : shape === 'end'
        ? `${inset} right-0 rounded-r-full rounded-l-none`
        : `${inset} left-0 right-0 rounded-none`
  if (shapeOrigin !== 'predicted') return geometry
  const border = shape === 'single'
    ? 'border'
    : shape === 'start'
      ? 'border-y border-l'
      : shape === 'end'
        ? 'border-y border-r'
        : 'border-y'
  return `${geometry} ${border} border-dashed`
}

/** Inline cap geometry prevents range caps being lost to utility overrides. */
export function cellHighlightStyle(shape: DayShape): Pick<React.CSSProperties, 'borderRadius'> {
  if (shape === 'single') return { borderRadius: '9999px' }
  if (shape === 'start') return { borderRadius: '9999px 0 0 9999px' }
  if (shape === 'end') return { borderRadius: '0 9999px 9999px 0' }
  return { borderRadius: 0 }
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
  const base = 'm-[10px] border-dashed'
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
  _monthTint: boolean,
  style: CalendarStyle,
  shapeOrigin?: 'period' | 'fertile' | 'predicted' | 'safe',
): CellFillStyle {
  if (shape) {
    if (shapeOrigin === 'fertile') return { backgroundColor: style.fertile, color: darken(style.fertile, 0.42) }
    if (shapeOrigin === 'safe') return { backgroundColor: style.safe, color: darken(style.safe, 0.35) }
    if (shapeOrigin === 'predicted') return { borderColor: style.predicted, color: style.predicted }
    return _monthTint ? {} : { backgroundColor: style.period }
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
 * Selection ring shade for a SELECTED day. Every selected cell draws the
 * SAME fixed-size inner circle (Calendar renders it once) — only the shade
 * varies. Cells with no solid fill (plain days, dashed predicted cells) get
 * the static light rose; cells on a solid user-pickable fill (period /
 * fertile / safe runs, drag preview) INVERT relative to that fill so the
 * ring never disappears into the highlight. Never null: a marker must exist
 * on every selected cell, at the same geometry, so selection reads
 * consistently whatever the cell holds.
 */
export const SELECTION_RING_PLAIN = '#e89db9' // rose-300 — matches predicted dash

export function selectionRingColor(
  shape: DayShape | null,
  shapeOrigin: 'period' | 'fertile' | 'predicted' | 'safe' | undefined,
  style: CalendarStyle,
): string {
  const fill = !shape
    ? null
    : shapeOrigin === 'fertile'
      ? style.fertile
      : shapeOrigin === 'safe'
        ? style.safe
        : shapeOrigin === 'predicted'
          ? null
          : style.period // committed period, or drag preview (origin undefined)
  return fill ? contrastRing(fill) : SELECTION_RING_PLAIN
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
 * Concave "scoop" cut for the month tint at a wrap corner — the untinted cell
 * tucked into the inner corner of an even-month block (e.g. Sep 30 with Oct
 * tint to its right and below, or Nov 1 with Oct tint to its left and above).
 * The tint's own convex band corners are rounded by `monthTintSegments`, but
 * where the band wraps AROUND an untinted day the boundary was left a sharp
 * 90° L. The old SVG blob rounded this reentrant corner by pulling the tint
 * BACK from the untinted cell: the boundary arcs inward (concave for the
 * tint) around the corner point instead of bulging into the white day. Each
 * cut paints a quarter-disc of card background (radius TINT_RADIUS_PX) over
 * the TINTED neighbors' corners that touch the untinted day's corner, so the
 * tint recedes along the same curve the SVG blob used. Painted as plain DOM
 * divs in the tint layer — same GPU-safe approach as the row segments (the
 * per-cell overlay version died with the SVG rewrite).
 */
export interface MonthTintBite {
  /** Week row index within `weeks`. */
  row: number
  /** Column of the UNTINTED cell whose corner the tint rounds. */
  col: number
  /** Which corner of that cell the disc fills: tint sits above+left ('tl')
   *  or right+below ('br') of the cell. */
  corner: 'tl' | 'tr' | 'bl' | 'br'
}

export function monthTintBites(weeks: MonthCell[][]): MonthTintBite[] {
  const out: MonthTintBite[] = []
  // Month key of a TINTED (even, in-month) cell at (r, c); null when the cell
  // is missing, out-of-month, or an untinted (odd) month.
  const tintKey = (r: number, c: number): string | null => {
    const cell = weeks[r]?.[c]
    if (!cell || !cell.inMonth) return null
    const mk = cell.iso.slice(0, 7)
    return isTintMonth(mk) ? mk : null
  }
  for (let r = 0; r < weeks.length; r++) {
    const row = weeks[r]
    if (!row) continue
    for (let c = 0; c < row.length; c++) {
      const cell = row[c]
      if (!cell || !cell.inMonth || isTintMonth(cell.iso)) continue
      // Tint can wrap around any corner of this white cell. Keep curve on the
      // white cell itself (the visible target), including top-right: this is
      // the May 1 / tinted Apr 30 case in the reference.
      const kLeft = tintKey(r, c - 1)
      const kRight = tintKey(r, c + 1)
      const kAbove = tintKey(r - 1, c)
      const kBelow = tintKey(r + 1, c)
      if (kLeft && kLeft === kAbove) out.push({ row: r, col: c, corner: 'tl' })
      if (kRight && kRight === kAbove) out.push({ row: r, col: c, corner: 'tr' })
      if (kLeft && kLeft === kBelow) out.push({ row: r, col: c, corner: 'bl' })
      if (kRight && kRight === kBelow) out.push({ row: r, col: c, corner: 'br' })
    }
  }
  return out
}

/**
 * Rounded corner on the untinted cell at a tint wrap. `row`/`col` address the
 * white cell itself; the corner is the re-entrant corner where the tint wraps
 * around it. Keep this as one cut on the adjacent cell, not three quarter
 * discs on its tinted neighbours: the visible curve belongs to the white day.
 */
export interface MonthTintCut {
  row: number
  col: number
  corner: 'tl' | 'tr' | 'bl' | 'br'
}

export function monthTintCuts(weeks: MonthCell[][]): MonthTintCut[] {
  // Keep bite orientation on the white cell. The cut is a circle centered on
  // its corner and allowed to overflow into the tinted neighbours; remapping
  // tl→tr put the scoop on wrong side of month-start cells.
  return monthTintBites(weeks).map(({ row, col, corner }) => ({ row, col, corner }))
}

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
