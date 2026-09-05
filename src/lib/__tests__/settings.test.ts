import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, SETTINGS_LIMITS, sanitizeSettings } from '../settings'

describe('sanitizeSettings', () => {
  it('defaults when missing or empty', () => {
    expect(sanitizeSettings(undefined)).toEqual(DEFAULT_SETTINGS)
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS)
    expect(sanitizeSettings({})).toEqual(DEFAULT_SETTINGS)
  })

  it('passes valid values through unchanged', () => {
    expect(sanitizeSettings({ cycleLength: 32, periodLength: 4, showSafeDays: false })).toEqual({
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
      cycleLength: SETTINGS_LIMITS.cycleLength.min,
      periodLength: SETTINGS_LIMITS.periodLength.min,
      showSafeDays: false,
    })
  })

  it('clamps values above the maximum', () => {
    expect(
      sanitizeSettings({ cycleLength: 999, periodLength: 40, showSafeDays: true }),
    ).toEqual({
      cycleLength: SETTINGS_LIMITS.cycleLength.max,
      periodLength: SETTINGS_LIMITS.periodLength.max,
      showSafeDays: true,
    })
  })

  it('rounds fractional input', () => {
    expect(sanitizeSettings({ cycleLength: 28.6, periodLength: 4.2, showSafeDays: false })).toEqual({
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