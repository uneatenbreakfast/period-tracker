import { describe, expect, it } from 'vitest'
import {
  cellFillClass,
  cellFillStyle,
  cellLayoutClass,
  dragShape,
  isTintMonth,
  monthScoopClass,
  ovulationRing,
  runShape,
} from '../rangeStyle'
import { DEFAULT_CALENDAR_STYLE } from '../settings'
import { darken } from '../color'

describe('isTintMonth', () => {
  it('tints even months — August (the reported break) included', () => {
    expect(isTintMonth('2026-02')).toBe(true)
    expect(isTintMonth('2026-04')).toBe(true)
    expect(isTintMonth('2026-06')).toBe(true)
    expect(isTintMonth('2026-08')).toBe(true)
    expect(isTintMonth('2026-10')).toBe(true)
    expect(isTintMonth('2026-12')).toBe(true)
  })

  it('leaves odd months plain', () => {
    expect(isTintMonth('2026-01')).toBe(false)
    expect(isTintMonth('2026-03')).toBe(false)
    expect(isTintMonth('2026-05')).toBe(false)
    expect(isTintMonth('2026-07')).toBe(false)
    expect(isTintMonth('2026-09')).toBe(false)
    expect(isTintMonth('2026-11')).toBe(false)
  })

  it('reads the month slot from an ISO date or a YYYY-MM key', () => {
    // Full ISO date string: Calendar passes cell.iso; monthKey is slice(0,7).
    expect(isTintMonth('2026-08-15')).toBe(true)
    expect(isTintMonth('2026-08')).toBe(true)
  })
})

describe('runShape', () => {
  const flowDays = new Set(['2025-07-15', '2025-07-16', '2025-07-17', '2025-07-18'])
  const hasFlow = (iso: string) => flowDays.has(iso)

  it('single day run', () => {
    expect(runShape('2025-07-20', hasFlow)).toBeNull()
    expect(runShape('2025-07-15', (i) => i === '2025-07-15')).toBe('single')
  })

  it('start of run', () => {
    expect(runShape('2025-07-15', hasFlow)).toBe('start')
  })

  it('middle of run', () => {
    expect(runShape('2025-07-16', hasFlow)).toBe('middle')
    expect(runShape('2025-07-17', hasFlow)).toBe('middle')
  })

  it('end of run', () => {
    expect(runShape('2025-07-18', hasFlow)).toBe('end')
  })

  it('cross-month run', () => {
    const crossFlow = new Set(['2025-07-30', '2025-07-31', '2025-08-01', '2025-08-02'])
    const crossHas = (iso: string) => crossFlow.has(iso)
    expect(runShape('2025-07-30', crossHas)).toBe('start')
    expect(runShape('2025-07-31', crossHas)).toBe('middle')
    expect(runShape('2025-08-01', crossHas)).toBe('middle')
    expect(runShape('2025-08-02', crossHas)).toBe('end')
  })
})

describe('dragShape', () => {
  it('single day range', () => {
    expect(dragShape('2025-07-15', '2025-07-15', '2025-07-15')).toBe('single')
  })

  it('start of range', () => {
    expect(dragShape('2025-07-15', '2025-07-15', '2025-07-18')).toBe('start')
  })

  it('middle of range', () => {
    expect(dragShape('2025-07-16', '2025-07-15', '2025-07-18')).toBe('middle')
  })

  it('end of range', () => {
    expect(dragShape('2025-07-18', '2025-07-15', '2025-07-18')).toBe('end')
  })

  it('reversed range (from > to)', () => {
    expect(dragShape('2025-07-15', '2025-07-18', '2025-07-15')).toBe('start')
    expect(dragShape('2025-07-18', '2025-07-18', '2025-07-15')).toBe('end')
  })

  it('outside range', () => {
    expect(dragShape('2025-07-10', '2025-07-15', '2025-07-18')).toBeNull()
    expect(dragShape('2025-07-20', '2025-07-15', '2025-07-18')).toBeNull()
  })
})

describe('monthScoopClass', () => {
  it('self-tinted returns empty', () => {
    expect(monthScoopClass(true, true, true)).toBe('')
  })

  it('tl scoop: left+top tinted', () => {
    expect(monthScoopClass(false, true, true)).toBe('tl')
  })

  it('br scoop: right+bottom tinted', () => {
    expect(monthScoopClass(false, false, false, true, true)).toBe('br')
  })

  it('no tinted neighbors returns empty', () => {
    expect(monthScoopClass(false, false, false)).toBe('')
  })

  it('only left tinted returns empty', () => {
    expect(monthScoopClass(false, true, false)).toBe('')
  })

  it('only top tinted returns empty', () => {
    expect(monthScoopClass(false, false, true)).toBe('')
  })

  it('only right tinted returns empty', () => {
    expect(monthScoopClass(false, false, false, true, false)).toBe('')
  })

  it('only bottom tinted returns empty', () => {
    expect(monthScoopClass(false, false, false, false, true)).toBe('')
  })
})


// Month backgrounds are now rendered as unified SVG shapes behind the grid.
// cellLayoutClass and cellFillClass no longer handle tint/scoop per-cell.
describe('cellLayoutClass', () => {
  it('capsule strip geometry (rounded caps)', () => {
    expect(cellLayoutClass('start')).toBe('w-full rounded-l-full rounded-r-none')
    expect(cellLayoutClass('middle')).toBe('w-full rounded-none')
    expect(cellLayoutClass('end')).toBe('w-full rounded-r-full rounded-l-none')
  })

  it('a lone day keeps its circle', () => {
    expect(cellLayoutClass('single')).toBe('mx-auto w-full max-w-11 rounded-full')
  })

  it('unshaped cells get centered circle', () => {
    expect(cellLayoutClass(null)).toBe('mx-auto w-full max-w-11 rounded-full')
  })
})

describe('cellFillClass', () => {
  it('tinted months: shaped cells are transparent (SVG bg shows through)', () => {
    expect(cellFillClass('start', false, false, false, true)).toBe('font-bold text-white')
    expect(cellFillClass('end', false, false, false, true)).toBe('font-bold text-white')
    expect(cellFillClass('middle', false, false, false, true)).toBe('font-bold text-white')
    expect(cellFillClass('single', false, false, false, true)).toBe('font-bold text-white')
  })

  it('untinted months: shaped period cells keep white text (fill moved to style)', () => {
    expect(cellFillClass('start', false, false, false, false)).toBe('font-bold text-white')
    expect(cellFillClass('end', false, false, false, false)).toBe('font-bold text-white')
    expect(cellFillClass('middle', false, false, false, false)).toBe('font-bold text-white')
    expect(cellFillClass('single', false, false, false, false)).toBe('font-bold text-white')
  })

  it('fertile window: no color utilities (they moved to cellFillStyle)', () => {
    expect(cellFillClass(null, true, false, false, false)).toBe('font-semibold')
    expect(cellFillClass(null, true, false, false, true)).toBe('font-semibold')
  })

  it('safe days: no color utilities (they moved to cellFillStyle)', () => {
    expect(cellFillClass(null, false, false, true, false)).toBe('font-semibold')
    expect(cellFillClass(null, false, false, true, true)).toBe('font-semibold')
  })

  it('predicted days: dashed border geometry only, no color classes', () => {
    expect(cellFillClass(null, false, true, false, true)).toBe('border border-dashed')
    expect(cellFillClass(null, false, true, false, false)).toBe('border border-dashed')
  })

  it('predicted shaped strip: dashed outline only, NO fill (matches legend swatch)', () => {
    // Shaped predicted cells must NOT carry a bg fill — a solid block read as
    // a solid pink strip against month tints, contradicting the legend's empty
    // dashed circle. Outline-only: dashes let the month background show through.
    for (const shape of ['start', 'middle', 'end', 'single'] as const) {
      const cls = cellFillClass(shape, false, true, false, true, 'predicted')
      expect(cls).toContain('border-dashed')
      expect(cls).not.toContain('bg-')
      expect(cls).not.toContain('rose')
      expect(cls).not.toContain('text-white')
    }
    // Shape-aware border sides still apply
    expect(cellFillClass('start', false, true, false, true, 'predicted')).toContain('border-l')
    expect(cellFillClass('end', false, true, false, true, 'predicted')).toContain('border-r')
    expect(cellFillClass('middle', false, true, false, true, 'predicted')).not.toContain('border-l')
    expect(cellFillClass('single', false, true, false, true, 'predicted')).toContain('border border-dashed')
  })

  it('unshaped, non-fertile, non-predicted, non-safe cells are transparent', () => {
    expect(cellFillClass(null, false, false, false, true)).toBe('')
    expect(cellFillClass(null, false, false, false, false)).toBe('')
  })

  it('period fill wins over fertile/predicted/safe markers', () => {
    expect(cellFillClass('middle', true, true, true, false)).toBe('font-bold text-white')
    expect(cellFillClass('middle', false, true, false, false)).toBe('font-bold text-white')
  })
})

describe('cellFillStyle', () => {
  const style = DEFAULT_CALENDAR_STYLE

  it('period shape on untinted month: solid period fill, no text color', () => {
    expect(cellFillStyle('start', false, false, false, false, style)).toEqual({
      backgroundColor: '#f2318c',
    })
  })

  it('period shape on tinted month: transparent (Calendar paints child overlay)', () => {
    expect(cellFillStyle('middle', false, false, false, true, style)).toEqual({})
  })

  it('fertile: fill + darkened text shade', () => {
    expect(cellFillStyle(null, true, false, false, false, style)).toEqual({
      backgroundColor: '#e4dcf3',
      color: '#84808d',
    })
    expect(cellFillStyle('start', false, false, false, true, style, 'fertile')).toEqual({
      backgroundColor: '#e4dcf3',
      color: '#84808d',
    })
  })

  it('safe: fill + darkened text shade', () => {
    expect(cellFillStyle(null, false, false, true, false, style)).toEqual({
      backgroundColor: '#e3eddd',
      color: '#949a90',
    })
    expect(cellFillStyle('end', false, false, false, true, style, 'safe')).toEqual({
      backgroundColor: '#e3eddd',
      color: '#949a90',
    })
  })

  it('predicted: dashed border + text in the predicted color, no fill', () => {
    expect(cellFillStyle(null, false, true, false, true, style)).toEqual({
      borderColor: '#e89db9',
      color: '#e89db9',
    })
    expect(cellFillStyle('middle', false, true, false, true, style, 'predicted')).toEqual({
      borderColor: '#e89db9',
      color: '#e89db9',
    })
  })

  it('custom colors flow through (user-picked)', () => {
    const custom = {
      ...DEFAULT_CALENDAR_STYLE,
      period: '#123456',
      predicted: '#abcdef',
      fertile: '#0f0f0f',
      ovulation: '#112233',
      safe: '#445566',
    }
    expect(cellFillStyle('single', false, false, false, false, custom)).toEqual({
      backgroundColor: '#123456',
    })
    expect(cellFillStyle(null, false, true, false, false, custom)).toEqual({
      borderColor: '#abcdef',
      color: '#abcdef',
    })
    expect(cellFillStyle(null, true, false, false, false, custom)).toEqual({
      backgroundColor: '#0f0f0f',
      color: darken('#0f0f0f', 0.42),
    })
    expect(cellFillStyle(null, false, false, true, false, custom)).toEqual({
      backgroundColor: '#445566',
      color: darken('#445566', 0.35),
    })
  })

  it('unmarked cells get no styles', () => {
    expect(cellFillStyle(null, false, false, false, true, style)).toEqual({})
    expect(cellFillStyle(null, false, false, false, false, style)).toEqual({})
  })
})

describe('ovulationRing', () => {
  it('lightens the ovulation color ~55% toward white', () => {
    expect(ovulationRing(DEFAULT_CALENDAR_STYLE)).toBe('#e0d7ee')
    expect(ovulationRing({ ...DEFAULT_CALENDAR_STYLE, ovulation: '#000000' })).toBe('#8c8c8c')
  })
})
