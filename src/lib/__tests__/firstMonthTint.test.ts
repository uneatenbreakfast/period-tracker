import { describe, expect, it } from 'vitest'
import { monthTintSegments } from '../rangeStyle'
import type { MonthCell } from '../dates'

// Real Feb 2024 window: Monday Jan 29 .. Sunday Mar 3, where February (even)
// is the FIRST month in the window and starts mid-row at col 3 (Thu Feb 1).
// Leading Jan 29-31 cells are out-of-month pads. Regression: the first month
// of the window must still get its tint segments (Feb 1-4 = row 0 cols 3-6).
function febWindow(): MonthCell[][] {
  const days = (startISO: string, count: number, inF: (i: number) => boolean): MonthCell[] =>
    Array.from({ length: count }, (_, i) => {
      const [y, m, d] = startISO.split('-').map(Number)
      const dt = new Date(Date.UTC(y, m - 1, d + i))
      const iso = dt.toISOString().slice(0, 10)
      return { iso, inMonth: inF(i) }
    })
  // Jan 29 2024 = Monday. Row 0: Jan29..Feb4. Rows 1-5 follow.
  const weeks: MonthCell[][] = []
  for (let r = 0; r < 6; r++) {
    const start = new Date(Date.UTC(2024, 0, 29 + r * 7))
    weeks.push(days(start.toISOString().slice(0, 10), 7, (i) => {
      const dayOf = r * 7 + i // 0 = Jan 29
      return dayOf >= 3 && dayOf <= 33 // Feb 1..29 (2024 leap)
    }))
  }
  return weeks
}

describe('first-even-month-of-window tint (regression)', () => {
  it('emits segments for the leading even month (Feb 2024)', () => {
    const segs = monthTintSegments(febWindow())
    const mks = [...new Set(segs.map((s) => s.monthKey))]
    expect(mks).toContain('2024-02')
    expect(mks).not.toContain('2024-01')
    expect(mks).not.toContain('2024-03')
  })

  it('places the Feb top row at cols 3-6 with its band corners', () => {
    const segs = monthTintSegments(febWindow())
    const top = segs.find((s) => s.monthKey === '2024-02' && s.row === 0)
    expect(top).toMatchObject({ c0: 3, c1: 6, tl: true, tr: true })
  })

  it('has Feb span 5 rows ending with a partial bottom row', () => {
    const feb = monthTintSegments(febWindow()).filter((s) => s.monthKey === '2024-02')
    expect(feb).toHaveLength(5)
    const last = feb[4]
    // Feb 26..29 = cols 0-3 on the final row; bottom corners on that row.
    expect(last.row).toBe(4)
    expect(last).toMatchObject({ c0: 0, c1: 3, bl: true, br: true })
  })
})
