import { describe, expect, it } from 'vitest'
import { monthBackgroundPaths } from '../rangeStyle'
import type { MonthCell } from '../dates'

// Hand-built week grid where a single "month" occupies a rectangle of cells:
// rows 0..rows-1, cols in `cols` are in-month (iso 2026-07-xx), rest out-month.
// Note: the path tracer emits a point per exterior segment even on collinear
// straight runs (e.g. "L 2 0 L 2 0" where two adjacent cells' top edges meet)
// — redundant but geometrically identical to a merged path. Expectations
// below are the VERIFIED exact outputs.
function rectGrid(rows: number, cols: number[]): MonthCell[][] {
  const weeks: MonthCell[][] = []
  for (let r = 0; r < rows; r++) {
    const week: MonthCell[] = []
    for (let c = 0; c < 7; c++) {
      const inMonth = cols.includes(c)
      week.push({ iso: `2026-07-${String(r * 7 + c + 1).padStart(2, '0')}`, inMonth })
    }
    weeks.push(week)
  }
  return weeks
}

describe('monthBackgroundPaths legacy (no geom — grid units)', () => {
  it('single-cell month at row 0 col 0', () => {
    const grid = rectGrid(1, [0])
    const [p] = monthBackgroundPaths(grid)
    expect(p.pathD).toBe(
      'M 0.35 0 L 0.65 0 A 0.35 0.35 0 0 1 1 0.35 L 1 0.65 A 0.35 0.35 0 0 1 0.65 1 L 0.35 1 A 0.35 0.35 0 0 1 0 0.65 L 0 0.35 A 0.35 0.35 0 0 1 0.35 0 Z',
    )
  })

  it('2x3 rectangle: rows 0-1, cols 1-3 (unchanged from previous algorithm)', () => {
    const grid = rectGrid(2, [1, 2, 3])
    const [p] = monthBackgroundPaths(grid)
    expect(p.pathD).toBe(
      'M 1.35 0 L 2 0 L 2 0 L 3 0 L 3 0 L 3.65 0 A 0.35 0.35 0 0 1 4 0.35 L 4 1 L 4 1 L 4 1.65 A 0.35 0.35 0 0 1 3.65 2 L 3 2 L 3 2 L 2 2 L 2 2 L 1.35 2 A 0.35 0.35 0 0 1 1 1.65 L 1 1 L 1 1 L 1 0.35 A 0.35 0.35 0 0 1 1.35 0 Z',
    )
  })
})

describe('monthBackgroundPaths px geom — uniform rows', () => {
  it('scales coordinates exactly by cellW and row height', () => {
    const grid = rectGrid(2, [1, 2, 3])
    const [p] = monthBackgroundPaths(grid, {
      cellW: 40,
      rowTops: [0, 44],
      rowHeights: [44, 44],
    })
    // Same rectangle as legacy, every x scaled by 40, y by 44,
    // R = 0.35 * min(40, 44) = 14.
    expect(p.pathD).toBe(
      'M 54 0 L 80 0 L 80 0 L 120 0 L 120 0 L 146 0 A 14 14 0 0 1 160 14 L 160 44 L 160 44 L 160 74 A 14 14 0 0 1 146 88 L 120 88 L 120 88 L 80 88 L 80 88 L 54 88 A 14 14 0 0 1 40 74 L 40 44 L 40 44 L 40 14 A 14 14 0 0 1 54 0 Z',
    )
  })
})

describe('monthBackgroundPaths px geom — NON-uniform rows (the bug)', () => {
  it('tracks measured row tops/heights exactly when rows differ', () => {
    const grid = rectGrid(2, [1, 2, 3])
    // Row 0 is 36px, row 1 is 60px — a tall row from a month-start label
    // or font scaling. Legacy uniform mapping would misplace row 1.
    const [p] = monthBackgroundPaths(grid, {
      cellW: 40,
      rowTops: [0, 36],
      rowHeights: [36, 60],
    })
    // R = 0.35 * min(cellW 40, minRowH 36) = 12.6 → r2 = 12.6.
    // Top edge y=0; the mid boundary lands at y=36 (bottom of row 0):
    expect(p.pathD).toBe(
      'M 52.6 0 L 80 0 L 80 0 L 120 0 L 120 0 L 147.4 0 A 12.6 12.6 0 0 1 160 12.6 L 160 36 L 160 36 L 160 83.4 A 12.6 12.6 0 0 1 147.4 96 L 120 96 L 120 96 L 80 96 L 80 96 L 52.6 96 A 12.6 12.6 0 0 1 40 83.4 L 40 36 L 40 36 L 40 12.6 A 12.6 12.6 0 0 1 52.6 0 Z',
    )
  })

  it('three uneven rows: each vertical edge lands on the measured boundary', () => {
    const grid = rectGrid(3, [2])
    const [p] = monthBackgroundPaths(grid, {
      cellW: 50,
      rowTops: [0, 30, 75], // heights 30, 45, 40
      rowHeights: [30, 45, 40],
    })
    // min rowH = 30 → R = 0.35 * 30 = 10.5. col 2 → x 100..150.
    // Mid boundaries appear at y=30 and y=75; bottom at 75+40=115.
    expect(p.pathD).toBe(
      'M 110.5 0 L 139.5 0 A 10.5 10.5 0 0 1 150 10.5 L 150 30 L 150 30 L 150 75 L 150 75 L 150 104.5 A 10.5 10.5 0 0 1 139.5 115 L 110.5 115 A 10.5 10.5 0 0 1 100 104.5 L 100 75 L 100 75 L 100 30 L 100 30 L 100 10.5 A 10.5 10.5 0 0 1 110.5 0 Z',
    )
  })

  it('falls back to legacy unit mode when geom row count mismatches', () => {
    const grid = rectGrid(1, [0])
    const [p] = monthBackgroundPaths(grid, {
      cellW: 40,
      rowTops: [0, 44], // 2 rowTops but only 1 week
      rowHeights: [44, 44],
    })
    expect(p.pathD).toBe(
      'M 0.35 0 L 0.65 0 A 0.35 0.35 0 0 1 1 0.35 L 1 0.65 A 0.35 0.35 0 0 1 0.65 1 L 0.35 1 A 0.35 0.35 0 0 1 0 0.65 L 0 0.35 A 0.35 0.35 0 0 1 0.35 0 Z',
    )
  })
})