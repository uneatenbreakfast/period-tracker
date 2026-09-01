import { describe, expect, it } from 'vitest'
import { cellFillClass, cellLayoutClass, dragShape, monthInverseScoopClass, monthScoopClass, runShape, type DayShape } from '../rangeStyle'

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

describe('monthScoopClass', () => {
  it('returns rounded-tl-xl when left and top are tinted and self is not', () => {
    expect(monthScoopClass(false, true, true)).toBe('rounded-tl-xl')
  })

  it('returns empty string when self is tinted (even month)', () => {
    expect(monthScoopClass(true, true, true)).toBe('')
  })

  it('returns empty string when only left is tinted', () => {
    expect(monthScoopClass(false, true, false)).toBe('')
  })

  it('returns empty string when only top is tinted', () => {
    expect(monthScoopClass(false, false, true)).toBe('')
  })

  it('returns empty string when neither neighbor is tinted', () => {
    expect(monthScoopClass(false, false, false)).toBe('')
  })
})

describe('monthInverseScoopClass', () => {
  it('returns rounded-bl-xl when 1st of tinted month with untinted left neighbor', () => {
    expect(monthInverseScoopClass(true, true, true)).toBe('rounded-bl-xl')
  })

  it('returns empty string when not month start', () => {
    expect(monthInverseScoopClass(false, true, true)).toBe('')
  })

  it('returns empty string when self is untinted (odd month)', () => {
    expect(monthInverseScoopClass(true, false, true)).toBe('')
  })

  it('returns empty string when left neighbor is tinted (same or even month)', () => {
    expect(monthInverseScoopClass(true, true, false)).toBe('')
  })

  it('returns empty string when no left neighbor (di=0, leftUntinted=false)', () => {
    expect(monthInverseScoopClass(true, true, false)).toBe('')
  })
})

// Period selection on tinted months: cell paints the tint as a full square so
// corners outside the cap rounding show the month bg instead of white; the
// rose shape is rendered by an inner absolute span in Calendar.tsx. On
// untinted months the cell itself carries the rounded geometry directly.
describe('cellLayoutClass', () => {
  it('untinted months: capsule strip geometry (rounded caps)', () => {
    expect(cellLayoutClass('start', false, false)).toBe('w-full rounded-l-full rounded-r-none')
    expect(cellLayoutClass('middle', false, false)).toBe('w-full rounded-none')
    expect(cellLayoutClass('end', false, false)).toBe('w-full rounded-r-full rounded-l-none')
  })

  it('tinted months: shaped cells render as full squares (inner span paints shape)', () => {
    expect(cellLayoutClass('start', false, true)).toBe('w-full rounded-none')
    expect(cellLayoutClass('middle', false, true)).toBe('w-full rounded-none')
    expect(cellLayoutClass('end', false, true)).toBe('w-full rounded-none')
    expect(cellLayoutClass('single', false, true)).toBe('w-full rounded-none')
  })

  it('untinted months: a lone day keeps its circle', () => {
    expect(cellLayoutClass('single', false, false)).toBe('mx-auto w-full max-w-11 rounded-full')
  })

  it('unshaped cells: full-width square on tint months, centered circle otherwise', () => {
    expect(cellLayoutClass(null, false, true)).toBe('w-full rounded-none')
    expect(cellLayoutClass(null, false, false)).toBe('mx-auto w-full max-w-11 rounded-full')
  })

  it('scoop cells fill the column flush with the adjacent block', () => {
    expect(cellLayoutClass(null, true, false)).toBe('w-full rounded-none')
  })
})

describe('cellFillClass', () => {
  it('tinted months: cell paints the tint (inner span paints rose shape)', () => {
    expect(cellFillClass('start', false, false, false, true)).toBe('bg-month-tint font-bold text-white')
    expect(cellFillClass('end', false, false, false, true)).toBe('bg-month-tint font-bold text-white')
    expect(cellFillClass('middle', false, false, false, true)).toBe('bg-month-tint font-bold text-white')
    expect(cellFillClass('single', false, false, false, true)).toBe('bg-month-tint font-bold text-white')
  })

  it('untinted months: cell paints solid rose directly', () => {
    expect(cellFillClass('start', false, false, false, false)).toBe('bg-rose-400 font-bold text-white shadow-[0_3px_10px_rgba(217,111,147,0.45)]')
    expect(cellFillClass('end', false, false, false, false)).toBe('bg-rose-400 font-bold text-white shadow-[0_3px_10px_rgba(217,111,147,0.45)]')
    expect(cellFillClass('middle', false, false, false, false)).toBe('bg-rose-400 font-bold text-white shadow-[0_3px_10px_rgba(217,111,147,0.45)]')
    expect(cellFillClass('single', false, false, false, false)).toBe('bg-rose-400 font-bold text-white shadow-[0_3px_10px_rgba(217,111,147,0.45)]')
  })

  it('scoop cell carries the tint itself (overlay reveals the corner)', () => {
    expect(cellFillClass(null, true, false, false, false)).toBe('bg-month-tint')
  })

  it('fertile window unchanged by tint', () => {
    expect(cellFillClass(null, false, true, false, true)).toBe(
      cellFillClass(null, false, true, false, false),
    )
    expect(cellFillClass(null, false, true, false, false)).toContain('bg-lavender-100')
  })

  it('predicted days keep tint under the dashed border on tinted months only', () => {
    expect(cellFillClass(null, false, false, true, true)).toBe(
      'bg-month-tint border-2 border-dashed border-rose-300 text-rose-400',
    )
    expect(cellFillClass(null, false, false, true, false)).toBe(
      'border-2 border-dashed border-rose-300 text-rose-400',
    )
  })

  it('plain tint-month cells get the block background; untinted get explicit white (cream parent bleeds through otherwise)', () => {
    expect(cellFillClass(null, false, false, false, true)).toBe('bg-month-tint')
    expect(cellFillClass(null, false, false, false, false)).toBe('bg-white')
  })

  it('period fill wins over fertile/predicted markers (inner span paints rose on tinted months)', () => {
    // Tinted: cell bg is month-tint (inner span paints rose shape)
    expect(cellFillClass('middle', false, true, true, true)).toContain('bg-month-tint')
    expect(cellFillClass('middle', false, true, true, true)).not.toContain('lavender')
    // Untinted: cell bg is rose directly
    expect(cellFillClass('middle', false, true, true, false)).toContain('bg-rose-400')
    expect(cellFillClass('middle', false, true, true, false)).not.toContain('lavender')
  })
})