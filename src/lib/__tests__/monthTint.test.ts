import { describe, expect, it } from 'vitest'
import { monthTintBites, monthTintSegments } from '../rangeStyle'
import { addDays } from '../dates'
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

// Flowing Mon-first strip of real dates (like continuousGrid output): every
// cell is in-month, consecutive days from `start`.
function strip(start: string, rows: number): MonthCell[][] {
  const weeks: MonthCell[][] = []
  let iso = start
  for (let r = 0; r < rows; r++) {
    const week: MonthCell[] = []
    for (let c = 0; c < 7; c++) {
      week.push({ iso, inMonth: true })
      iso = addDays(iso, 1)
    }
    weeks.push(week)
  }
  return weeks
}

describe('monthTintBites', () => {
  it('br scoop on the last white day before a mid-row even-month start', () => {
    // Sep 21–27 (white), Sep 28–Oct 4 (Sep 28–30 white, Oct 1–4 tinted),
    // Oct 5–11 (tinted). Sep 30 (r1 col2) has Oct tinted to its right (Oct 1)
    // AND below (Oct 7, same column next row), so its bottom-right corner gets
    // the quarter-disc bite that rounds the tint's reentrant corner.
    const bites = monthTintBites(strip('2026-09-21', 3))
    expect(bites).toEqual([{ row: 1, col: 2, corner: 'br' }])
  })

  it('tl scoop on the first white day after a mid-row even-month end', () => {
    // Oct 19–25 (tinted), Oct 26–Nov 1 (Oct 26–31 tinted, Nov 1 white),
    // Nov 2–8 (white). Nov 1 (r1 col6) has Oct tinted to its left AND above,
    // so its top-left corner gets the mirrored bite.
    const bites = monthTintBites(strip('2026-10-19', 3))
    expect(bites).toEqual([{ row: 1, col: 6, corner: 'tl' }])
  })

  it('emits nothing when only one side of the corner is tinted', () => {
    // Aug 31 2026 is a Monday, so the row is [Aug 31, Sep 1–6]: Sep 1 has tint
    // to its left only (no tinted row above in this 2-row window) — a single
    // tinted neighbor is not enough for either scoop orientation.
    expect(monthTintBites(strip('2026-08-31', 2))).toEqual([])
  })

  it('tl scoop also fires at an even-month end when the odd month starts mid-row', () => {
    // Aug 24–30 (tinted), Aug 31 + Sep 1–6 (Aug 31 tinted, Sep white),
    // Sep 7–13 (white). Sep 1 (r1 col1) has Aug tinted to its left (Aug 31)
    // AND above (Aug 25, same column previous row) → tl bite.
    const weeks = strip('2026-08-24', 3)
    expect(weeks[1][0].iso).toBe('2026-08-31') // sanity: boundary row
    const bites = monthTintBites(weeks)
    expect(bites).toEqual([{ row: 1, col: 1, corner: 'tl' }])
  })

  it('emits nothing when the tinted row below is missing (bite needs the wrap)', () => {
    // Only the boundary row: Sep 30 has Oct to its right but no tinted row
    // beneath — no wrap, no bite.
    expect(monthTintBites(strip('2026-09-21', 2))).toEqual([])
  })

  it('ignores out-of-month cells as bite candidates', () => {
    const weeks = strip('2026-09-21', 3)
    weeks[1][2].inMonth = false // Sep 30 no longer part of September
    expect(monthTintBites(weeks)).toEqual([])
  })

  it('emits nothing for all-tinted or all-white windows', () => {
    expect(monthTintBites(strip('2026-08-03', 4))).toEqual([]) // August only
    expect(monthTintBites(strip('2026-09-07', 2))).toEqual([]) // September only
  })
})
