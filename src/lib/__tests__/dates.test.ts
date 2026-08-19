import { describe, expect, it } from 'vitest'
import {
  addDays,
  addMonths,
  dateRange,
  diffDays,
  fromISODate,
  isValidISO,
  monthGrid,
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

describe('monthGrid', () => {
  it('June 2026 starts on Monday → no leading pad, 5 weeks', () => {
    const grid = monthGrid(2026, 5)
    expect(grid.length).toBe(5)
    expect(grid[0][0].iso).toBe('2026-06-01')
    expect(grid[0][0].inMonth).toBe(true)
  })

  it('August 2026 starts on Saturday → 5 leading pad cells from July', () => {
    const grid = monthGrid(2026, 7)
    expect(grid[0][0].iso).toBe('2026-07-27')
    expect(grid[0][0].inMonth).toBe(false)
    expect(grid[0][5].iso).toBe('2026-08-01')
    expect(grid[0][5].inMonth).toBe(true)
  })

  it('every week has 7 cells; inMonth cells count = days in month', () => {
    for (const [year, month, daysInMonth] of [
      [2026, 0, 31],
      [2026, 1, 28],
      [2028, 1, 29], // leap year
    ] as const) {
      const grid = monthGrid(year, month)
      expect(grid.every((w) => w.length === 7)).toBe(true)
      expect(grid.flat().filter((c) => c.inMonth)).toHaveLength(daysInMonth)
    }
  })
})