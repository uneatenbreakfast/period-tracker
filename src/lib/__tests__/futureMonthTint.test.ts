import { describe, expect, it } from 'vitest'
import { futureMonthBackground } from '../rangeStyle'

describe('futureMonthBackground', () => {
  it('darkens future white month backgrounds', () => {
    expect(futureMonthBackground('2026-10', '2026-09', '#e0d6f2', false)).toBe('#f5f5f5')
  })

  it('darkens future colored month backgrounds', () => {
    expect(futureMonthBackground('2026-10', '2026-09', '#e0d6f2', true)).toBe('#d7cde8')
  })

  it('leaves current and past month backgrounds unchanged', () => {
    expect(futureMonthBackground('2026-09', '2026-09', '#e0d6f2', false)).toBeUndefined()
    expect(futureMonthBackground('2026-08', '2026-09', '#e0d6f2', true)).toBeUndefined()
  })
})
