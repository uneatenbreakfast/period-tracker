import { describe, expect, it } from 'vitest'
import {
  cellFillClass,
  cellLayoutClass,
  dragShape,
  monthScoopClass,
  runShape,
} from '../rangeStyle'

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
    expect(cellFillClass('start', false, false, true)).toBe('font-bold text-white')
    expect(cellFillClass('end', false, false, true)).toBe('font-bold text-white')
    expect(cellFillClass('middle', false, false, true)).toBe('font-bold text-white')
    expect(cellFillClass('single', false, false, true)).toBe('font-bold text-white')
  })

  it('untinted months: cell paints solid rose directly', () => {
    expect(cellFillClass('start', false, false, false)).toBe('bg-rose-400 font-bold text-white shadow-[0_3px_10px_rgba(217,111,147,0.45)]')
    expect(cellFillClass('end', false, false, false)).toBe('bg-rose-400 font-bold text-white shadow-[0_3px_10px_rgba(217,111,147,0.45)]')
    expect(cellFillClass('middle', false, false, false)).toBe('bg-rose-400 font-bold text-white shadow-[0_3px_10px_rgba(217,111,147,0.45)]')
    expect(cellFillClass('single', false, false, false)).toBe('bg-rose-400 font-bold text-white shadow-[0_3px_10px_rgba(217,111,147,0.45)]')
  })

  it('fertile window: bg-lavender-100', () => {
    expect(cellFillClass(null, true, false, false)).toContain('bg-lavender-100')
    expect(cellFillClass(null, true, false, true)).toContain('bg-lavender-100')
  })

  it('predicted days: dashed border', () => {
    expect(cellFillClass(null, false, true, true)).toBe(
      'border-2 border-dashed border-rose-300 text-rose-400',
    )
    expect(cellFillClass(null, false, true, false)).toBe(
      'border-2 border-dashed border-rose-300 text-rose-400',
    )
  })

  it('unshaped, non-fertile, non-predicted cells are transparent', () => {
    expect(cellFillClass(null, false, false, true)).toBe('')
    expect(cellFillClass(null, false, false, false)).toBe('')
  })

  it('period fill wins over fertile/predicted markers', () => {
    expect(cellFillClass('middle', true, true, false)).toContain('bg-rose-400')
    expect(cellFillClass('middle', true, true, false)).not.toContain('lavender')
    expect(cellFillClass('middle', false, true, false)).toContain('bg-rose-400')
  })
})
