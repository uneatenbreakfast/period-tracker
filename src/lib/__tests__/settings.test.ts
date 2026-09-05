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

  it('survives the full settings sanitize path (legacy blob → defaults)', () => {
    const legacy = JSON.parse('{"cycleLength":"28","periodLength":null}')
    expect(sanitizeSettings(legacy).style).toEqual(DEFAULT_CALENDAR_STYLE)
  })
})