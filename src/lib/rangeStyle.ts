/**
 * Range-run cell shapes — the "continuous strip" look for period runs and
 * drag previews. A run's first day gets a left semicircle cap, its last day
 * a right cap, interior days are flush squares, and a one-day run keeps the
 * full circle. Pure so the shape rules are unit-testable; the Tailwind
 * layout/fill helpers (`cellLayoutClass`, `cellFillClass`) are defined here
 * and consumed by Calendar.tsx.
 *
 * Also provides `monthBackgroundPaths` for the unified SVG month background
 * shapes that replace per-cell rounded corners.
 */
import { addDays } from './dates'
import type { MonthCell } from './dates'
import type { CalendarStyle } from '../types'
import { darken, lighten } from './color'

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
 * of an odd-month tint block. Two orientations:
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
 * SVG path data for a continuous month background shape. Traces the outer
 * boundary of a month's cells in the grid, rounding convex AND concave
 * corners. Interior edges between same-month cells are invisible — the shape
 * reads as one organic blob with smooth curves on all corners.
 *
 * Two coordinate spaces:
 * - No `geom` (legacy): paths are in GRID units — one column = 1 x-unit, one
 *   week row = 1 y-unit, corner radius R = 0.35 grid units. The SVG stretch
 *   maps these onto the day grid via viewBox "0 0 7 N" + preserveAspectRatio.
 * - With `geom`: paths are in PIXEL units — column c spans
 *   [c*cellW, (c+1)*cellW], row r spans [rowTops[r], rowTops[r]+rowHeights[r]].
 *   This is the accurate mode: it tracks the ACTUAL measured row geometry, so
 *   the tint aligns even when rows are non-uniform (font scaling, zoom,
 *   month-start labels growing rows, any viewport/DPR). Rows MUST equal
 *   `weeks.length`.
 *
 * @param weeks — the continuousGrid output (MonthCell[][])
 * @param geom — optional real-pixel geometry (cellW + per-row tops/heights)
 * @returns Array of { monthKey (YYYY-MM), pathD (SVG path data), color }[]
 */
export interface MonthGeom {
  /** Pixel width of one day column (container width / 7). */
  cellW: number
  /** Pixel top offset of each week row, relative to the tint wrapper. */
  rowTops: number[]
  /** Pixel height of each week row. Same length as rowTops. */
  rowHeights: number[]
}

export interface MonthBgPath {
  monthKey: string
  pathD: string
  color: string
}

const r2 = (n: number) => Math.round(n * 100) / 100

export function monthBackgroundPaths(weeks: MonthCell[][], geom?: MonthGeom): MonthBgPath[] {
  if (weeks.length === 0) return []

  const px = !!geom && geom.rowTops.length === weeks.length && geom.rowHeights.length === weeks.length
  // Column x in units (c) or pixels (c * cellW)
  const colX = (c: number) => (px ? c * (geom as MonthGeom).cellW : c)
  // Row top edge y: unit row r → r; px row r → measured top
  const rowTop = (r: number) => (px ? (geom as MonthGeom).rowTops[r] : r)
  // Row bottom edge y: unit → r+1; px → top + measured height
  const rowBot = (r: number) => (px ? (geom as MonthGeom).rowTops[r] + (geom as MonthGeom).rowHeights[r] : r + 1)

  // Corner radius: keep it proportional to the cell; clamp so a very short
  // row can't get arcs taller than itself (degenerate font-scale cases).
  let R = 0.35
  if (px) {
    const g = geom as MonthGeom
    const minRowH = Math.min(...g.rowHeights)
    R = 0.35 * Math.min(g.cellW, minRowH)
  }
  const Rr = r2(R)

  // Group cells by month (YYYY-MM)
  const groups = new Map<string, { r: number; c: number }[]>()
  for (let r = 0; r < weeks.length; r++) {
    for (let c = 0; c < weeks[r].length; c++) {
      const cell = weeks[r][c]
      if (!cell.inMonth) continue
      const mk = cell.iso.slice(0, 7)
      let arr = groups.get(mk)
      if (!arr) { arr = []; groups.set(mk, arr) }
      arr.push({ r, c })
    }
  }

  const results: MonthBgPath[] = []

  for (const [mk, cells] of groups) {
    if (cells.length === 0) continue

    const inMonth = new Set(cells.map((c) => `${c.r},${c.c}`))

    // Collect exterior edges as SVG line segments — coordinates in the
    // active space (grid units or real pixels)
    interface Seg {
      x1: number; y1: number; x2: number; y2: number
      dir: 'right' | 'down' | 'left' | 'up'
    }
    const segs: Seg[] = []

    for (const { r, c } of cells) {
      const x0 = colX(c), x1 = colX(c + 1)
      const y0 = rowTop(r), y1 = rowBot(r)
      // Top edge: exterior if no cell above
      if (!inMonth.has(`${r - 1},${c}`))
        segs.push({ x1: x0, y1: y0, x2: x1, y2: y0, dir: 'right' })
      // Right edge: exterior if no cell to right
      if (!inMonth.has(`${r},${c + 1}`))
        segs.push({ x1: x1, y1: y0, x2: x1, y2: y1, dir: 'down' })
      // Bottom edge: exterior if no cell below
      if (!inMonth.has(`${r + 1},${c}`))
        segs.push({ x1: x1, y1: y1, x2: x0, y2: y1, dir: 'left' })
      // Left edge: exterior if no cell to left
      if (!inMonth.has(`${r},${c - 1}`))
        segs.push({ x1: x0, y1: y1, x2: x0, y2: y0, dir: 'up' })
    }

    if (segs.length === 0) continue

    // Build adjacency: endpoint key → outgoing segments
    const outMap = new Map<string, Seg[]>()
    for (const s of segs) {
      const k = `${s.x1},${s.y1}`
      let arr = outMap.get(k)
      if (!arr) { arr = []; outMap.set(k, arr) }
      arr.push(s)
    }

    // Turn classification between consecutive directed edges
    const turnType = (prev: Seg, next: Seg): 'convex' | 'concave' | 'straight' => {
      const pair = `${prev.dir}-${next.dir}`
      if (prev.dir === next.dir) return 'straight'
      if (['right-left', 'left-right', 'up-down', 'down-up'].includes(pair)) return 'straight'
      // Convex = outer corner of the filled shape
      if (['right-down', 'down-left', 'left-up', 'up-right'].includes(pair)) return 'convex'
      return 'concave'
    }

    // Build ordered chain so we can handle closing corner (last→first)
    const ordered: Seg[] = []
    const used = new Set<Seg>()
    let cur: Seg | undefined = segs[0]
    while (cur && !used.has(cur)) {
      used.add(cur)
      ordered.push(cur)
      const endK: string = `${cur.x2},${cur.y2}`
      cur = outMap.get(endK)?.find((s) => !used.has(s))
    }
    if (ordered.length === 0) continue

    const d: string[] = []
    const n = ordered.length

    for (let i = 0; i < n; i++) {
      const prev = ordered[(i - 1 + n) % n]
      const seg = ordered[i]
      const next = ordered[(i + 1) % n]
      const turnIn = turnType(prev, seg)
      const turnOut = turnType(seg, next)

      // Start of segment: offset inward if incoming turn is convex or concave
      let sx = seg.x1, sy = seg.y1
      if (turnIn === 'convex' || turnIn === 'concave') {
        sx += seg.dir === 'right' ? R : seg.dir === 'left' ? -R : 0
        sy += seg.dir === 'down' ? R : seg.dir === 'up' ? -R : 0
      }

      // End of segment: shorten if outgoing turn is convex or concave
      let ex = seg.x2, ey = seg.y2
      if (turnOut === 'convex' || turnOut === 'concave') {
        ex -= seg.dir === 'right' ? R : seg.dir === 'left' ? -R : 0
        ey -= seg.dir === 'down' ? R : seg.dir === 'up' ? -R : 0
      }

      if (i === 0) {
        d.push(`M ${r2(sx)} ${r2(sy)}`)
      } else if (turnIn === 'convex') {
        // Arc from previous segment's shortened end to this start (outward curve)
        d.push(`A ${Rr} ${Rr} 0 0 1 ${r2(sx)} ${r2(sy)}`)
      } else if (turnIn === 'concave') {
        // Arc from previous segment's shortened end to this start (inward curve)
        d.push(`A ${Rr} ${Rr} 0 0 0 ${r2(sx)} ${r2(sy)}`)
      } else {
        d.push(`L ${r2(sx)} ${r2(sy)}`)
      }

      d.push(`L ${r2(ex)} ${r2(ey)}`)
    }

    // Closing corner: arc from last segment end to first segment start
    const lastTurn = turnType(ordered[n - 1], ordered[0])
    if (lastTurn === 'convex' || lastTurn === 'concave') {
      const first = ordered[0]
      const fx = first.dir === 'right' ? first.x1 + R : first.dir === 'left' ? first.x1 - R : first.x1
      const fy = first.dir === 'down' ? first.y1 + R : first.dir === 'up' ? first.y1 - R : first.y1
      const sweep = lastTurn === 'convex' ? 1 : 0
      d.push(`A ${Rr} ${Rr} 0 0 ${sweep} ${r2(fx)} ${r2(fy)}`)
    }

    d.push('Z')
    results.push({ monthKey: mk, pathD: d.join(' '), color: '' })
  }

  return results
}
