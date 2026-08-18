import { describe, expect, it } from 'vitest'
import { formatDayShort, formatRange, ordinal } from '../ui'

describe('formatDayShort', () => {
  it('day + abbreviated month', () => {
    expect(formatDayShort('2026-07-21')).toBe('21 Jul')
    expect(formatDayShort('2026-03-15')).toBe('15 Mar')
    expect(formatDayShort('2026-12-01')).toBe('1 Dec')
  })
})

describe('formatRange', () => {
  it('inclusive span with en dash separator', () => {
    expect(formatRange('2026-07-21', '2026-08-15')).toBe('21 Jul - 15 Aug')
    expect(formatRange('2026-03-15', '2026-04-09')).toBe('15 Mar - 9 Apr')
  })
})

describe('ordinal', () => {
  it('regular ordinals', () => {
    expect(ordinal(1)).toBe('1st')
    expect(ordinal(2)).toBe('2nd')
    expect(ordinal(3)).toBe('3rd')
    expect(ordinal(13)).toBe('13th')
  })

  it('teens always th', () => {
    expect(ordinal(11)).toBe('11th')
    expect(ordinal(12)).toBe('12th')
    expect(ordinal(13)).toBe('13th')
    expect(ordinal(14)).toBe('14th')
  })

  it('21st / 22nd / 23rd overrides', () => {
    expect(ordinal(21)).toBe('21st')
    expect(ordinal(22)).toBe('22nd')
    expect(ordinal(23)).toBe('23rd')
    expect(ordinal(31)).toBe('31st')
  })
})
