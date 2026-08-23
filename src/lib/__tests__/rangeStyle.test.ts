import { describe, expect, it } from 'vitest'
import { dragShape, runShape, stripCorners, type DayShape } from '../rangeStyle'

const member = (set: Set<string>) => (iso: string) => set.has(iso)

describe('runShape', () => {
  it('returns null for a day with no flow', () => {
    expect(runShape('2026-08-10', member(new Set(['2026-08-11'])))).toBeNull()
  })

  it('an isolated day is a single circle', () => {
    expect(runShape('2026-08-10', member(new Set(['2026-08-10'])))).toBe('single')
  })

  it('a two-day run: first is a left cap, second a right cap', () => {
    const f = member(new Set(['2026-08-10', '2026-08-11']))
    expect(runShape('2026-08-10', f)).toBe('start')
    expect(runShape('2026-08-11', f)).toBe('end')
  })

  it('a three-day run: start cap, square middle, end cap', () => {
    const f = member(new Set(['2026-08-10', '2026-08-11', '2026-08-12']))
    expect(runShape('2026-08-10', f)).toBe('start')
    expect(runShape('2026-08-11', f)).toBe('middle')
    expect(runShape('2026-08-12', f)).toBe('end')
  })

  it('a long run: all interior days are squares', () => {
    const days = ['2026-08-01', '2026-08-02', '2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06', '2026-08-07']
    const f = member(new Set(days))
    expect(runShape('2026-08-01', f)).toBe('start')
    for (const d of days.slice(1, -1)) expect(runShape(d, f)).toBe('middle')
    expect(runShape('2026-08-07', f)).toBe('end')
  })

  it('a gap splits a run — each run gets its own caps', () => {
    const f = member(new Set(['2026-08-10', '2026-08-11', '2026-08-12', '2026-08-15', '2026-08-16']))
    expect(runShape('2026-08-10', f)).toBe('start')
    expect(runShape('2026-08-12', f)).toBe('end')
    expect(runShape('2026-08-13', f)).toBeNull()
    expect(runShape('2026-08-15', f)).toBe('start')
    expect(runShape('2026-08-16', f)).toBe('end')
  })

  it('a run continuing across a month boundary is one strip (no cap at the seam)', () => {
    const f = member(new Set(['2026-01-30', '2026-01-31', '2026-02-01', '2026-02-02']))
    expect(runShape('2026-01-30', f)).toBe('start')
    expect(runShape('2026-01-31', f)).toBe('middle')
    expect(runShape('2026-02-01', f)).toBe('middle')
    expect(runShape('2026-02-02', f)).toBe('end')
  })

  it('a run ending on the last day of a month caps there when the next month is free', () => {
    const f = member(new Set(['2026-02-26', '2026-02-27', '2026-02-28']))
    expect(runShape('2026-02-26', f)).toBe('start')
    expect(runShape('2026-02-28', f)).toBe('end')
  })

  it('runs starting on the first day of a month cap there when the previous month is free', () => {
    const f = member(new Set(['2026-03-01', '2026-03-02', '2026-03-03']))
    expect(runShape('2026-03-01', f)).toBe('start')
    expect(runShape('2026-03-03', f)).toBe('end')
  })

  it('year boundary: Dec 31 → Jan 1 continuation is still one strip', () => {
    const f = member(new Set(['2025-12-31', '2026-01-01', '2026-01-02']))
    expect(runShape('2025-12-31', f)).toBe('start')
    expect(runShape('2026-01-01', f)).toBe('middle')
    expect(runShape('2026-01-02', f)).toBe('end')
  })
})

describe('dragShape', () => {
  it('cells outside the range are null', () => {
    expect(dragShape('2026-08-09', '2026-08-10', '2026-08-12')).toBeNull()
    expect(dragShape('2026-08-13', '2026-08-10', '2026-08-12')).toBeNull()
  })

  it('a single-cell range keeps the circle', () => {
    expect(dragShape('2026-08-10', '2026-08-10', '2026-08-10')).toBe('single')
  })

  it('start/end get caps, interior days are squares (forward bounds)', () => {
    expect(dragShape('2026-08-10', '2026-08-10', '2026-08-13')).toBe('start')
    expect(dragShape('2026-08-11', '2026-08-10', '2026-08-13')).toBe('middle')
    expect(dragShape('2026-08-12', '2026-08-10', '2026-08-13')).toBe('middle')
    expect(dragShape('2026-08-13', '2026-08-10', '2026-08-13')).toBe('end')
  })

  it('backward bounds are normalized (order-agnostic)', () => {
    expect(dragShape('2026-08-17', '2026-08-20', '2026-08-17')).toBe('start')
    expect(dragShape('2026-08-19', '2026-08-20', '2026-08-17')).toBe('middle')
    expect(dragShape('2026-08-20', '2026-08-20', '2026-08-17')).toBe('end')
  })

  it('shapes cross the month boundary like the committed run', () => {
    expect(dragShape('2026-01-31', '2026-01-31', '2026-02-02')).toBe('start')
    expect(dragShape('2026-02-01', '2026-01-31', '2026-02-02')).toBe('middle')
    expect(dragShape('2026-02-02', '2026-01-31', '2026-02-02')).toBe('end')
  })
})

describe('shape vocabulary', () => {
  it('every shape is a member of DayShape', () => {
    const shapes: DayShape[] = ['single', 'start', 'middle', 'end']
    expect(shapes).toHaveLength(4)
  })
})

describe('stripCorners', () => {
  it('start cap: only bottom-left is convex, all other corners zeroed', () => {
    const cls = stripCorners('start')
    expect(cls).toContain('rounded-bl-full')
    expect(cls).toContain('rounded-tl-none')
    expect(cls).toContain('rounded-tr-none')
    expect(cls).toContain('rounded-br-none')
  })

  it('end cap: right corners convex, left corners zeroed', () => {
    const cls = stripCorners('end')
    expect(cls).toContain('rounded-r-full')
    expect(cls).toContain('rounded-l-none')
  })

  it('middle: all corners zeroed (flush square)', () => {
    const cls = stripCorners('middle')
    expect(cls).toContain('rounded-none')
    expect(cls).not.toContain('rounded-bl-full')
  })

  it('single: all corners fully rounded', () => {
    const cls = stripCorners('single')
    expect(cls).toContain('rounded-full')
  })
})