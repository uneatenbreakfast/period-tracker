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
 * Fill/text classes for a day cell. Month backgrounds are now rendered as
 * unified SVG shapes behind the grid, so unshaped cells are transparent.
 * Shaped period cells paint rose directly (on non-tinted months) or show
 * the tint through rounded cap corners (on tinted months).
 */
export function cellFillClass(
  shape: DayShape | null,
  fertile: boolean,
  predicted: boolean,
  monthTint: boolean,
): string {
  if (shape) {
    // Tinted months: cell is transparent so SVG bg shows through corners
    // outside the rounded cap. Non-tinted months: cell paints rose directly.
    return monthTint
      ? 'font-bold text-white'
      : 'bg-rose-400 font-bold text-white shadow-[0_3px_10px_rgba(217,111,147,0.45)]'
  }
  if (fertile) return 'bg-lavender-100 font-semibold text-lavender-700'
  if (predicted) return 'border-2 border-dashed border-rose-300 text-rose-400'
  return ''
}

/**
 * SVG path data for a continuous month background shape. Traces the outer
 * boundary of a month's cells in the grid, rounding only convex corners
 * (where no same-month cell sits diagonally outward). Interior edges
 * between same-month cells are invisible — the shape reads as one organic
 * blob with smooth curves only on the outer perimeter.
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

    // Trace perimeter with rounded convex corners
    const used = new Set<Seg>()
    let cur = segs[0]
    const d: string[] = []
    let first = true

    for (let safety = 0; safety < segs.length * 2 && cur; safety++) {
      if (used.has(cur)) break
      used.add(cur)

      if (first) {
        // Offset start point past first corner's radius
        const dx = cur.dir === 'right' ? R : cur.dir === 'left' ? -R : 0
        const dy = cur.dir === 'down' ? R : cur.dir === 'up' ? -R : 0
        d.push(`M ${cur.x1 + dx} ${cur.y1 + dy}`)
        first = false
      }

      // Find next segment starting at current endpoint
      const endK = `${cur.x2},${cur.y2}`
      const candidates = outMap.get(endK)
      const next = candidates?.find((s) => s !== cur && !used.has(s))

      if (!next) {
        // No continuation — close path back to start
        d.push(`L ${cur.x2} ${cur.y2}`)
        break
      }

      const turn = turnType(cur, next)

      if (turn === 'convex') {
        // Shorten current edge end by R, arc to shortened next edge start
        const ex = cur.dir === 'right' ? cur.x2 - R : cur.dir === 'left' ? cur.x2 + R : cur.x2
        const ey = cur.dir === 'down' ? cur.y2 - R : cur.dir === 'up' ? cur.y2 + R : cur.y2
        const nx = next.dir === 'right' ? next.x1 + R : next.dir === 'left' ? next.x1 - R : next.x1
        const ny = next.dir === 'down' ? next.y1 + R : next.dir === 'up' ? next.y1 - R : next.y1
        d.push(`L ${ex} ${ey}`)
        d.push(`A ${R} ${R} 0 0 1 ${nx} ${ny}`)
      } else {
        // Concave or straight: go directly to corner
        d.push(`L ${cur.x2} ${cur.y2}`)
      }

      cur = next
    }

    // Handle closing corner (last→first transition)
    if (d.length > 1 && cur && used.has(segs[0])) {
      // Already closed via loop break — Z handles it
    }

    d.push('Z')
    results.push({ monthKey: mk, pathD: d.join(' '), color: '' })
  }

  return results
}
