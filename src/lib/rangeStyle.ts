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
 * Border classes for a predicted-day strip. The dashed outline wraps the
 * whole run, not each cell — middle cells skip left/right borders.
 */
function predictedStripBorder(shape: DayShape): string {
  const base = 'border-dashed border-rose-300'
  if (shape === 'single') return `border ${base}`
  if (shape === 'start') return `border-y border-l ${base}`
  if (shape === 'end') return `border-y border-r ${base}`
  return `border-y ${base}` // middle
}

/**
 * Fill/text classes for a day cell. Month backgrounds are now rendered as
 * unified SVG shapes behind the grid, so unshaped cells are transparent.
 * Shaped period cells paint rose directly (on non-tinted months) or show
 * the tint through rounded cap corners (on tinted months).
 *
 * @param shapeOrigin — which range type produced the shape, so the fill
 *   color matches. undefined = period (default rose).
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
    if (shapeOrigin === 'fertile') return 'bg-lavender-100 font-semibold text-lavender-700'
    if (shapeOrigin === 'safe') return 'bg-sage-100 font-semibold text-sage-400'
    if (shapeOrigin === 'predicted') return `bg-rose-50 ${predictedStripBorder(shape)} text-rose-400 font-semibold`
    // Period shape (or drag preview) — rose fill.
    return monthTint
      ? 'font-bold text-white'
      : 'bg-rose-400 font-bold text-white'
  }
  if (fertile) return 'bg-lavender-100 font-semibold text-lavender-700'
  if (safe) return 'bg-sage-100 font-semibold text-sage-400'
  if (predicted) return 'border border-dashed border-rose-300 text-rose-400'
  return ''
}

/**
 * SVG path data for a continuous month background shape. Traces the outer
 * boundary of a month's cells in the grid, rounding convex AND concave
 * corners. Interior edges between same-month cells are invisible — the shape
 * reads as one organic blob with smooth curves on all corners.
 *
 * @param weeks — the continuousGrid output (MonthCell[][])
 * @returns Array of { monthKey (YYYY-MM), pathD (SVG path data), color }[]
 */
export interface MonthBgPath {
  monthKey: string
  pathD: string
  color: string
}

export function monthBackgroundPaths(weeks: MonthCell[][]): MonthBgPath[] {
  if (weeks.length === 0) return []

  // Corner radius in grid units (0.35 = ~35% of cell size)
  const R = 0.35

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

    // Collect exterior edges as SVG line segments (x=col, y=row)
    interface Seg {
      x1: number; y1: number; x2: number; y2: number
      dir: 'right' | 'down' | 'left' | 'up'
    }
    const segs: Seg[] = []

    for (const { r, c } of cells) {
      // Top edge: exterior if no cell above
      if (!inMonth.has(`${r - 1},${c}`))
        segs.push({ x1: c, y1: r, x2: c + 1, y2: r, dir: 'right' })
      // Right edge: exterior if no cell to right
      if (!inMonth.has(`${r},${c + 1}`))
        segs.push({ x1: c + 1, y1: r, x2: c + 1, y2: r + 1, dir: 'down' })
      // Bottom edge: exterior if no cell below
      if (!inMonth.has(`${r + 1},${c}`))
        segs.push({ x1: c + 1, y1: r + 1, x2: c, y2: r + 1, dir: 'left' })
      // Left edge: exterior if no cell to left
      if (!inMonth.has(`${r},${c - 1}`))
        segs.push({ x1: c, y1: r + 1, x2: c, y2: r, dir: 'up' })
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
        d.push(`M ${sx} ${sy}`)
      } else if (turnIn === 'convex') {
        // Arc from previous segment's shortened end to this start (outward curve)
        d.push(`A ${R} ${R} 0 0 1 ${sx} ${sy}`)
      } else if (turnIn === 'concave') {
        // Arc from previous segment's shortened end to this start (inward curve)
        d.push(`A ${R} ${R} 0 0 0 ${sx} ${sy}`)
      } else {
        d.push(`L ${sx} ${sy}`)
      }

      d.push(`L ${ex} ${ey}`)
    }

    // Closing corner: arc from last segment end to first segment start
    const lastTurn = turnType(ordered[n - 1], ordered[0])
    if (lastTurn === 'convex' || lastTurn === 'concave') {
      const first = ordered[0]
      const fx = first.dir === 'right' ? first.x1 + R : first.dir === 'left' ? first.x1 - R : first.x1
      const fy = first.dir === 'down' ? first.y1 + R : first.dir === 'up' ? first.y1 - R : first.y1
      const sweep = lastTurn === 'convex' ? 1 : 0
      d.push(`A ${R} ${R} 0 0 ${sweep} ${fx} ${fy}`)
    }

    d.push('Z')
    results.push({ monthKey: mk, pathD: d.join(' '), color: '' })
  }

  return results
}
