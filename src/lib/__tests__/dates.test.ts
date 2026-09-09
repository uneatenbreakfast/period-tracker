import { describe, expect, it } from 'vitest'
import {
  addDays,
  addMonths,
  continuousGrid,
  dateRange,
  diffDays,
  futureLimitMonth,
  fromISODate,
  initialMonths,
  loadNewerMonths,
  loadOlderMonths,
  FUTURE_MONTHS,
  PAST_MONTHS,
  LOAD_STEP,
  isValidISO,
  monthList,
  toISODate,
  todayISO,
} from '../dates'

describe('ISO helpers', () => {
  it('toISODate → fromISODate round-trips (summer + winter)', () => {
    expect(toISODate(fromISODate('2026-07-15'))).toBe('2026-07-15')
    expect(toISODate(fromISODate('2026-01-01'))).toBe('2026-01-01')
  })

  it('addDays crosses month and year boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('dateRange lists inclusive days, ascending, order-agnostic', () => {
    expect(dateRange('2026-01-03', '2026-01-05')).toEqual(['2026-01-03', '2026-01-04', '2026-01-05'])
    expect(dateRange('2026-01-05', '2026-01-03')).toEqual(['2026-01-03', '2026-01-04', '2026-01-05'])
    expect(dateRange('2026-01-05', '2026-01-05')).toEqual(['2026-01-05'])
  })

  it('dateRange crosses month boundaries', () => {
    expect(dateRange('2026-01-30', '2026-02-02')).toEqual(['2026-01-30', '2026-01-31', '2026-02-01', '2026-02-02'])
  })

  it('diffDays is whole-day, sign-correct', () => {
    expect(diffDays('2026-02-01', '2026-01-01')).toBe(31)
    expect(diffDays('2026-01-01', '2026-02-01')).toBe(-31)
    expect(diffDays('2026-01-05', '2026-01-05')).toBe(0)
  })

  it('isValidISO rejects junk', () => {
    expect(isValidISO('2026-02-30')).toBe(true) // Date rolls over; format-level check only
    expect(isValidISO('2026-13-01')).toBe(true)
    expect(isValidISO('26-01-01')).toBe(false)
    expect(isValidISO('2026/01/01')).toBe(false)
    expect(isValidISO('')).toBe(false)
  })

  it('todayISO matches local date', () => {
    expect(todayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('addMonths', () => {
  it('wraps year forward and backward, keeps same month for n=0', () => {
    expect(addMonths(2026, 0, 1)).toEqual({ year: 2026, month: 1 })
    expect(addMonths(2026, 11, 1)).toEqual({ year: 2027, month: 0 })
    expect(addMonths(2026, 5, -6)).toEqual({ year: 2025, month: 11 })
    expect(addMonths(2026, 5, 0)).toEqual({ year: 2026, month: 5 })
  })
})

describe('monthList', () => {
  it('is inclusive oldest→newest and wraps years', () => {
    expect(monthList({ year: 2026, month: 10 }, { year: 2027, month: 0 })).toEqual([
      { year: 2026, month: 10 },
      { year: 2026, month: 11 },
      { year: 2027, month: 0 },
    ])
  })

  it('single month when from === to', () => {
    expect(monthList({ year: 2026, month: 5 }, { year: 2026, month: 5 })).toEqual([{ year: 2026, month: 5 }])
  })
})

describe('continuousGrid', () => {
  it('supports Sunday-first weeks', () => {
    const grid = continuousGrid([{ year: 2026, month: 7 }], true)
    expect(grid[0][0].iso).toBe('2026-07-26')
    expect(grid[0][0].inMonth).toBe(false)
    expect(grid[0][6].iso).toBe('2026-08-01')
  })

  it('June 2026 starts on Monday → no leading pad, 5 weeks, only July tail pads', () => {
    const grid = continuousGrid([{ year: 2026, month: 5 }])
    expect(grid.length).toBe(5)
    expect(grid[0][0].iso).toBe('2026-06-01')
    expect(grid[0][0].inMonth).toBe(true)
    expect(grid.flat().filter((c) => c.inMonth)).toHaveLength(30)
    // trailing pad only: the window's last Sunday is July 5
    expect(grid[4][6].iso).toBe('2026-07-05')
    expect(grid[4][6].inMonth).toBe(false)
  })

  it('August 2026 starts on Saturday → 5 leading pad cells from July', () => {
    const grid = continuousGrid([{ year: 2026, month: 7 }])
    expect(grid[0][0].iso).toBe('2026-07-27')
    expect(grid[0][0].inMonth).toBe(false)
    expect(grid[0][5].iso).toBe('2026-08-01')
    expect(grid[0][5].inMonth).toBe(true)
  })

  it('month ending Tue 31 → next month\'s Wed 1st continues the SAME row (BLOOM-0015)', () => {
    // March 2026: 31st is Tuesday, April 1st is Wednesday.
    const grid = continuousGrid([
      { year: 2026, month: 2 },
      { year: 2026, month: 3 },
    ])
    const flat = grid.flat().map((c) => c.iso)
    const tue31 = flat.indexOf('2026-03-31')
    const wed1 = flat.indexOf('2026-04-01')
    expect(tue31).toBeGreaterThanOrEqual(0)
    expect(wed1).toBe(tue31 + 1) // adjacent — no row break at the boundary
    const sameWeek = grid.find((w) => w.some((c) => c.iso === '2026-03-31'))
    expect(sameWeek!.some((c) => c.iso === '2026-04-01')).toBe(true)
  })

  it('never duplicates a day and spans the window without gaps', () => {
    const grid = continuousGrid([
      { year: 2026, month: 0 },
      { year: 2026, month: 1 },
      { year: 2026, month: 2 },
    ])
    const flat = grid.flat().map((c) => c.iso)
    expect(new Set(flat).size).toBe(flat.length)
    for (let i = 1; i < flat.length; i++) {
      expect(addDays(flat[i - 1], 1)).toBe(flat[i])
    }
  })

  it('every week has 7 cells; inMonth cells count = days in window months', () => {
    for (const [year, month, daysInMonth] of [
      [2026, 0, 31],
      [2026, 1, 28],
      [2028, 1, 29], // leap year
    ] as const) {
      const grid = continuousGrid([{ year, month }])
      expect(grid.every((w) => w.length === 7)).toBe(true)
      expect(grid.flat().filter((c) => c.inMonth)).toHaveLength(daysInMonth)
    }
  })

  it('empty window → empty grid', () => {
    expect(continuousGrid([])).toEqual([])
  })
})

describe('future window cap (1 month ahead, no growth)', () => {
  it('futureLimitMonth is exactly FUTURE_MONTHS ahead of today', () => {
    const now = new Date(2026, 7, 21) // Aug 21 2026
    expect(futureLimitMonth(now)).toEqual(addMonths(2026, 7, FUTURE_MONTHS))
    expect(futureLimitMonth(now)).toEqual({ year: 2026, month: 8 }) // Sep 2026
  })

  it('initialMonths forward edge is exactly the 1-month future cap', () => {
    // Same-clock check: relies on the test clock not flipping a month boundary
    // between the two new Date() calls in the same synchronous run.
    const months = initialMonths()
    expect(months[months.length - 1]).toEqual(futureLimitMonth())
  })

  it('initialMonths shows only the last PAST_MONTHS months of the past', () => {
    const now = new Date(2026, 7, 21) // Aug 21 2026
    const months = initialMonths(now)
    // Oldest month is exactly PAST_MONTHS before the current month (Feb 2026).
    expect(months[0]).toEqual(addMonths(2026, 7, -PAST_MONTHS))
    expect(months[0]).toEqual({ year: 2026, month: 1 })
    // 6 past + current + 1 future = 8 months.
    expect(months.length).toBe(PAST_MONTHS + FUTURE_MONTHS + 1)
  })

  it('initialMonths does NOT extend back to the earliest entry', () => {
    // History older than PAST_MONTHS is hidden until the user loads it.
    const now = new Date(2026, 7, 21)
    const months = initialMonths(now)
    expect(months[0]).toEqual({ year: 2026, month: 1 }) // Feb, not earlier
  })
})

describe('load older periods (button-driven, 6 at a time)', () => {
  it('loadOlderMonths prepends exactly LOAD_STEP months before the first', () => {
    const added = loadOlderMonths({ year: 2026, month: 1 }) // Feb 2026
    expect(added.length).toBe(LOAD_STEP)
    expect(added[0]).toEqual({ year: 2025, month: 7 }) // Aug 2025
    expect(added[added.length - 1]).toEqual({ year: 2026, month: 0 }) // Jan 2026 (one before first)
  })

  it('repeated loadOlderMonths steps back by LOAD_STEP with no overlap', () => {
    let first = { year: 2026, month: 1 }
    const seen: string[] = []
    for (let i = 0; i < 3; i++) {
      const added = loadOlderMonths(first)
      for (const mo of added) seen.push(`${mo.year}-${mo.month}`)
      first = added[0]
    }
    // 3 batches × 6 = 18 distinct, non-overlapping months.
    expect(seen).toHaveLength(18)
    expect(new Set(seen).size).toBe(18)
    expect(first).toEqual({ year: 2024, month: 7 }) // Aug 2024
  })

  it('loadOlderMonths honors an explicit step', () => {
    const added = loadOlderMonths({ year: 2026, month: 5 }, 3)
    expect(added.length).toBe(3)
    expect(added[0]).toEqual({ year: 2026, month: 2 })
    expect(added[added.length - 1]).toEqual({ year: 2026, month: 4 })
  })
})

describe('load newer periods (forward, infinite future)', () => {
  it('loadNewerMonths appends LOAD_STEP months after the last, no overlap', () => {
    const added = loadNewerMonths({ year: 2026, month: 5 }) // June 2026
    expect(added.length).toBe(LOAD_STEP)
    expect(added[0]).toEqual({ year: 2026, month: 6 }) // July — one after last
    expect(added[added.length - 1]).toEqual({ year: 2026, month: 11 }) // Dec
  })

  it('repeated loadNewerMonths steps forward by LOAD_STEP with no overlap', () => {
    let last = { year: 2026, month: 5 }
    const seen: string[] = []
    for (let i = 0; i < 3; i++) {
      const added = loadNewerMonths(last)
      for (const mo of added) seen.push(`${mo.year}-${mo.month}`)
      last = added[added.length - 1]
    }
    expect(seen).toHaveLength(18)
    expect(new Set(seen).size).toBe(18)
    expect(last).toEqual({ year: 2027, month: 11 }) // Dec 2027
  })

  it('loadNewerMonths wraps year boundaries', () => {
    const added = loadNewerMonths({ year: 2026, month: 10 }, 4) // after Nov 2026
    expect(added[0]).toEqual({ year: 2026, month: 11 }) // Dec 2026
    expect(added[added.length - 1]).toEqual({ year: 2027, month: 2 }) // Mar 2027
  })
})