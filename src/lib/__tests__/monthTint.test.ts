import { describe, expect, it } from 'vitest'
import { monthTintSegments } from '../rangeStyle'
import type { MonthCell } from '../dates'

// Grid of `rows` × 7 cells; a single month (even 2026-08, or whatever `mk`
// month is passed) occupies every cell whose column is in `cols`. Cells use
// sequential ISO dates so `.iso.slice(0, 7)` yields `mk` for in-month cells.
function monthGrid(rows: number, cols: number[], mk = '2026-08'): MonthCell[][] {
  const weeks: MonthCell[][] = []
  for (let r = 0; r < rows; r++) {
    const week: MonthCell[] = []
    for (let c = 0; c < 7; c++) {
      const inMonth = cols.includes(c)
      week.push({ iso: `${mk}-${String(r * 7 + c + 1).padStart(2, '0')}`, inMonth })
    }
    weeks.push(week)
  }
  return weeks
}

describe('monthTintSegments', () => {
  it('emits one segment per week row for a full-width month', () => {
    const segs = monthTintSegments(monthGrid(3, [0, 1, 2, 3, 4, 5, 6]))
    expect(segs).toHaveLength(3)
    expect(segs.map((s) => s.c0)).toEqual([0, 0, 0])
    expect(segs.map((s) => s.c1)).toEqual([6, 6, 6])
    // Top row: top-left + top-right band corners. Bottom row: bottom corners.
    expect(segs[0]).toMatchObject({ tl: true, tr: true, bl: false, br: false })
    expect(segs[1]).toMatchObject({ tl: false, tr: false, bl: false, br: false })
    expect(segs[2]).toMatchObject({ tl: false, tr: false, bl: true, br: true })
  })

  it('rounds only the month-block convex corners on a partial-start month', () => {
    // Month starts mid-row at col 3 and spans three full-width rows beneath —
    // the October/February pattern.
    const weeks = monthGrid(1, [3, 4, 5, 6])
    weeks.push(monthGrid(2, [0, 1, 2, 3, 4, 5, 6])[0])
    weeks.push(monthGrid(2, [0, 1, 2, 3, 4, 5, 6])[1])
    const segs = monthTintSegments(weeks)
    expect(segs).toHaveLength(3)
    // Top row: only the 4 partial cells; both its corners are band corners.
    expect(segs[0]).toMatchObject({ c0: 3, c1: 6, tl: true, tr: true, bl: false, br: false })
    // Second row: the block now starts at col 0, so its col-0 cell carries the
    // band's left-top corner (cell above is out-of-month).
    expect(segs[1]).toMatchObject({ c0: 0, c1: 6, tl: true, tr: false, bl: false, br: false })
    // Bottom row: left + right bottom corners.
    expect(segs[2]).toMatchObject({ c0: 0, c1: 6, tl: false, tr: false, bl: true, br: true })
  })

  it('rounds all four corners of a single-cell month', () => {
    const segs = monthTintSegments(monthGrid(1, [4]))
    expect(segs).toHaveLength(1)
    expect(segs[0]).toMatchObject({ c0: 4, c1: 4, tl: true, tr: true, bl: true, br: true })
  })

  it('only tints even months (odd months emit no segments)', () => {
    expect(monthTintSegments(monthGrid(2, [0, 1, 2, 3, 4, 5, 6], '2026-09'))).toEqual([])
  })

  it('respects month boundaries across rows (neighbor in a different month is a boundary)', () => {
    // Row 0: Aug at cols 4-6 (top-left corner only). Row 1: Sep at cols 0-2 —
    // odd, so untinted; the Aug block does NOT continue below, so the Aug
    // bottom corners land on row 0.
    const weeks = monthGrid(2, [4, 5, 6]) // all '2026-08' in-month in those cols
    // Force row 1 cells to be September instead (odd → skipped as their own
    // month, and treated as boundary for August).
    for (let c = 0; c < 7; c++) {
      weeks[1][c] = { iso: `2026-09-${String(c + 1).padStart(2, '0')}`, inMonth: c <= 2 }
    }
    const segs = monthTintSegments(weeks)
    expect(segs).toHaveLength(1)
    expect(segs[0]).toMatchObject({ row: 0, c0: 4, c1: 6, tl: true, tr: true, bl: true, br: true })
  })

  it('emits nothing for an empty grid', () => {
    expect(monthTintSegments([])).toEqual([])
  })
})
