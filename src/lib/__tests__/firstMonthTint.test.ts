import { describe, expect, it } from 'vitest'
import { monthBackgroundPaths } from '../rangeStyle'
import type { MonthCell } from '../dates'

// Window that STARTS with an EVEN month (Feb 2024): first row = Jan 29..Feb 4
// (Mon), second month March. All in-window cells inMonth; leading row has the
// Feb 1 in it so the "first month" occupies row 0.
function febWindow(): MonthCell[][] {
  const days = (startISO: string, count: number, inF: (i: number) => boolean): MonthCell[] =>
    Array.from({ length: count }, (_, i) => {
      const [y, m, d] = startISO.split('-').map(Number)
      const dt = new Date(Date.UTC(y, m - 1, d + i))
      const iso = dt.toISOString().slice(0, 10)
      return { iso, inMonth: inF(i) }
    })
  // Jan 29 2024 = Monday. Row 0: Jan29..Feb4. Row1: Feb5..11 ...
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

describe('first-month-even window (regression: top month of the window must get its tint path)', () => {
  it('emits a path for the first month when it is even (Feb)', () => {
    const weeks = febWindow()
    const geom = { cellW: 51, rowTops: weeks.map((_, r) => r * 48), rowHeights: weeks.map(() => 48) }
    const paths = monthBackgroundPaths(weeks, geom)
    const mks = paths.map((p) => p.monthKey)
    expect(mks[0]).toBe('2024-02')
    expect(mks).toContain('2024-02')
    expect(mks).toContain('2024-03')
    // path at y=0 (first month's first row top)
    const [feb] = paths
    expect(feb.pathD).toMatch(/ 0 L /)
  })

  it('same with legacy unit mode', () => {
    const weeks = febWindow()
    const paths = monthBackgroundPaths(weeks)
    expect(paths.map((p) => p.monthKey)[0]).toBe('2024-02')
  })
})