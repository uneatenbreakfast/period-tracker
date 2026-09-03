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

  // Map row,col → cell for neighbor lookups
  const cellAt = new Map<string, MonthCell>()
  for (let r = 0; r < weeks.length; r++) {
    for (let c = 0; c < weeks[r].length; c++) {
      cellAt.set(`${r},${c}`, weeks[r][c])
    }
  }

  // Group cells by month (YYYY-MM)
  const groups = new Map<string, { r: number; c: number; iso: string }[]>()
  for (let r = 0; r < weeks.length; r++) {
    for (let c = 0; c < weeks[r].length; c++) {
      const cell = weeks[r][c]
      if (!cell.inMonth) continue
      const mk = cell.iso.slice(0, 7)
      let arr = groups.get(mk)
      if (!arr) { arr = []; groups.set(mk, arr) }
      arr.push({ r, c, iso: cell.iso })
    }
  }

  const results: MonthBgPath[] = []

  for (const [mk, cells] of groups) {
    if (cells.length === 0) continue

    // Set of grid positions in this month (for neighbor checks)
    const inMonth = new Set(cells.map((c) => `${c.r},${c.c}`))

    // 4 edge types: top, right, bottom, left
    // Each: { sr, sc, er, ec } — start→end in grid coords
    interface Edge { sr: number; sc: number; er: number; ec: number; kind: string }
    const edges: Edge[] = []

    for (const { r, c } of cells) {
      // Top edge (row r, cols c→c+1): exterior if no cell above
      if (!inMonth.has(`${r - 1},${c}`)) {
        edges.push({ sr: r, sc: c, er: r, ec: c + 1, kind: 'top' })
      }
      // Right edge (rows r→r+1, col c+1): exterior if no cell to right
      if (!inMonth.has(`${r},${c + 1}`)) {
        edges.push({ sr: r, sc: c + 1, er: r + 1, ec: c + 1, kind: 'right' })
      }
      // Bottom edge (row r+1, cols c+1→c): exterior if no cell below
      if (!inMonth.has(`${r + 1},${c}`)) {
        edges.push({ sr: r + 1, sc: c + 1, er: r + 1, ec: c, kind: 'bottom' })
      }
      // Left edge (rows r+1→r, col c): exterior if no cell to left
      if (!inMonth.has(`${r},${c - 1}`)) {
        edges.push({ sr: r + 1, sc: c, er: r, ec: c, kind: 'left' })
      }
    }

    if (edges.length === 0) continue

    // Build endpoint map: (r,c) → edge starting there
    const nextMap = new Map<string, Edge[]>()
    for (const e of edges) {
      const k = `${e.sr},${e.sc}`
      let arr = nextMap.get(k)
      if (!arr) { arr = []; nextMap.set(k, arr) }
      arr.push(e)
    }

    // Check if corner at (cr,cc) is convex for a same-month shape
    // Convex when NO same-month cell sits diagonally outward from that corner
    const isConvex = (cr: number, cc: number) =>
      !inMonth.has(`${cr - 1},${cc - 1}`) ||
      !inMonth.has(`${cr - 1},${cc}`) ||
      !inMonth.has(`${cr},${cc - 1}`) ||
      !inMonth.has(`${cr},${cc}`)

    // Trace perimeter: start at first edge, follow endpoints
    const used = new Set<number>()
    let segIdx = 0
    const d: string[] = []

    for (let safety = 0; safety < edges.length + 2; safety++) {
      if (used.has(segIdx)) break
      used.add(segIdx)
      const seg = edges[segIdx]

      if (d.length === 0) {
        d.push(`M ${seg.sc} ${seg.sr}`)
      } else {
        // The corner is at the start of this segment (= end of previous)
        const cornerR = seg.sr
        const cornerC = seg.sc
        if (isConvex(cornerR, cornerC)) {
          d.push(`Q ${cornerC} ${cornerR} ${seg.ec} ${seg.er}`)
        } else {
          d.push(`L ${seg.ec} ${seg.er}`)
        }
      }

      // Find next segment starting where this one ends
      const endK = `${seg.er},${seg.ec}`
      const candidates = nextMap.get(endK)
      if (candidates) {
        const next = candidates.find((e) => {
          const idx = edges.indexOf(e)
          return idx !== segIdx && !used.has(idx)
        })
        if (next) {
          segIdx = edges.indexOf(next)
          continue
        }
      }
      break
    }

    d.push('Z')
    results.push({ monthKey: mk, pathD: d.join(' '), color: '' })
  }

  return results
}
