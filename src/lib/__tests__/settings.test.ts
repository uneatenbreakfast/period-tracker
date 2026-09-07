import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CALENDAR_STYLE,
  DEFAULT_SETTINGS,
  sanitizeCalendarStyle,
  SETTINGS_LIMITS,
  sanitizeSettings,
} from '../settings'

describe('sanitizeSettings', () => {
  it('defaults when missing or empty', () => {
    expect(sanitizeSettings(undefined)).toEqual(DEFAULT_SETTINGS)
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS)
    expect(sanitizeSettings({})).toEqual(DEFAULT_SETTINGS)
  })

  it('passes valid values through unchanged', () => {
    expect(sanitizeSettings({ cycleLength: 32, periodLength: 4, showSafeDays: false })).toEqual({
      ...DEFAULT_SETTINGS,
      cycleLength: 32,
      periodLength: 4,
      showSafeDays: false,
    })
    expect(sanitizeSettings({ cycleLength: 28, periodLength: 5, showSafeDays: true })).toEqual(DEFAULT_SETTINGS)
  })

  it('clamps values below the minimum', () => {
    expect(
      sanitizeSettings({ cycleLength: SETTINGS_LIMITS.cycleLength.min - 1, periodLength: 0, showSafeDays: false }),
    ).toEqual({
      ...DEFAULT_SETTINGS,
      cycleLength: SETTINGS_LIMITS.cycleLength.min,
      periodLength: SETTINGS_LIMITS.periodLength.min,
      showSafeDays: false,
    })
  })

  it('clamps values above the maximum', () => {
    expect(
      sanitizeSettings({ cycleLength: 999, periodLength: 40, showSafeDays: true }),
    ).toEqual({
      ...DEFAULT_SETTINGS,
      cycleLength: SETTINGS_LIMITS.cycleLength.max,
      periodLength: SETTINGS_LIMITS.periodLength.max,
      showSafeDays: true,
    })
  })

  it('rounds fractional input', () => {
    expect(sanitizeSettings({ cycleLength: 28.6, periodLength: 4.2, showSafeDays: false })).toEqual({
      ...DEFAULT_SETTINGS,
      cycleLength: 29,
      periodLength: 4,
      showSafeDays: false,
    })
  })

  it('falls back per-field on garbage input', () => {
    // Corrupted blob shape — as a malformed localStorage payload would produce.
    const garbage = JSON.parse('{"cycleLength":"28","periodLength":null,"extra":true}')
    expect(sanitizeSettings(garbage)).toEqual(DEFAULT_SETTINGS)
    expect(sanitizeSettings({ cycleLength: Infinity, periodLength: NaN, showSafeDays: 'yes' as unknown as boolean })).toEqual(DEFAULT_SETTINGS)
  })

  it('defaults showSafeDays when missing or non-boolean', () => {
    expect(sanitizeSettings({ cycleLength: 28, periodLength: 5 }).showSafeDays).toBe(true)
    expect(sanitizeSettings({ cycleLength: 28, periodLength: 5, showSafeDays: undefined }).showSafeDays).toBe(true)
    expect(sanitizeSettings({ cycleLength: 28, periodLength: 5, showSafeDays: 1 as unknown as boolean }).showSafeDays).toBe(true)
  })
})

describe('sanitizeCalendarStyle', () => {
  it('defaults when missing or empty', () => {
    expect(sanitizeCalendarStyle(undefined)).toEqual(DEFAULT_CALENDAR_STYLE)
    expect(sanitizeCalendarStyle(null)).toEqual(DEFAULT_CALENDAR_STYLE)
    expect(sanitizeCalendarStyle({})).toEqual(DEFAULT_CALENDAR_STYLE)
    expect(sanitizeCalendarStyle('nope' as unknown as null)).toEqual(DEFAULT_CALENDAR_STYLE)
  })

  it('passes valid hex through unchanged (lowercased)', () => {
    expect(sanitizeCalendarStyle({ period: '#123456' }).period).toBe('#123456')
    expect(sanitizeSettings({ cycleLength: 28, style: { ...DEFAULT_CALENDAR_STYLE, period: '#ABCDEF' } }).style.period).toBe('#abcdef')
    expect(
      sanitizeSettings({
        cycleLength: 28,
        style: { ...DEFAULT_CALENDAR_STYLE, period: '#123456', predicted: '#abcdef', fertile: '#0f0f0f' },
      }).style,
    ).toEqual({
      ...DEFAULT_CALENDAR_STYLE,
      period: '#123456',
      predicted: '#abcdef',
      fertile: '#0f0f0f',
    })
  })

  it('expands 3-digit short hex', () => {
    expect(sanitizeCalendarStyle({ period: '#abc' }).period).toBe('#aabbcc')
    expect(sanitizeCalendarStyle({ period: '#F00' }).period).toBe('#ff0000')
  })

  it('per-field fallback on garbage, partial objects keep remaining defaults', () => {
    expect(sanitizeCalendarStyle({ period: 'rose', safe: '#00ff00' })).toEqual({
      ...DEFAULT_CALENDAR_STYLE,
      safe: '#00ff00',
    })
    expect(sanitizeCalendarStyle({ period: '#12345', safe: '#00ff00' }).period).toBe(DEFAULT_CALENDAR_STYLE.period)
    expect(sanitizeCalendarStyle({ period: 42 as unknown as string }).period).toBe(DEFAULT_CALENDAR_STYLE.period)
  })

  it('sanitizes the trend/ring/month-tint fields (BLOOM-0023)', () => {
    expect(sanitizeCalendarStyle({ monthTint: '#AA11BB' }).monthTint).toBe('#aa11bb')
    expect(sanitizeCalendarStyle({ trendFertile: '#888' }).trendFertile).toBe('#888888')
    expect(sanitizeCalendarStyle({ trendOvulation: '#12345' }).trendOvulation).toBe(
      DEFAULT_CALENDAR_STYLE.trendOvulation,
    )
    expect(sanitizeCalendarStyle({ ringFollicular: '#00ff00', ringLuteal: 'nope' })).toEqual({
      ...DEFAULT_CALENDAR_STYLE,
      ringFollicular: '#00ff00',
    })
    // A legacy blob with only the original 5 calendar fields keeps new defaults.
    expect(
      sanitizeCalendarStyle({
        period: '#3366ff',
        predicted: DEFAULT_CALENDAR_STYLE.predicted,
        fertile: DEFAULT_CALENDAR_STYLE.fertile,
        ovulation: DEFAULT_CALENDAR_STYLE.ovulation,
        safe: DEFAULT_CALENDAR_STYLE.safe,
      }),
    ).toEqual({
      ...DEFAULT_CALENDAR_STYLE,
      period: '#3366ff',
    })
  })

  it('survives the full settings sanitize path (legacy blob → defaults)', () => {
    const legacy = JSON.parse('{"cycleLength":"28","periodLength":null}')
    expect(sanitizeSettings(legacy).style).toEqual(DEFAULT_CALENDAR_STYLE)
  })

  it('monthTint default is a visible lavender, distinct from fertile (BLOOM-0026 follow-up)', () => {
    // The shipped default must read as a tint against the cream page (#fff7f4),
    // and must NOT equal the fertile fill (#e4dcf3) — an identical tint would
    // swallow the fertile window on odd (tinted) months.
    expect(DEFAULT_CALENDAR_STYLE.monthTint).toBe('#e0d6f2')
    expect(DEFAULT_CALENDAR_STYLE.monthTint).not.toBe(DEFAULT_CALENDAR_STYLE.fertile)
    // Legacy blobs without the field inherit the new default, not the old gray.
    expect(sanitizeCalendarStyle({}).monthTint).toBe('#e0d6f2')
    // Blobs that already stored the old invisible gray default are migrated too.
    expect(sanitizeCalendarStyle({ monthTint: '#dfe3e8' }).monthTint).toBe('#e0d6f2')
    expect(sanitizeCalendarStyle({ monthTint: '#DFE3E8' }).monthTint).toBe('#e0d6f2')
  })
})