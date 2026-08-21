import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, SETTINGS_LIMITS, sanitizeSettings } from '../settings'

describe('sanitizeSettings', () => {
  it('defaults when missing or empty', () => {
    expect(sanitizeSettings(undefined)).toEqual(DEFAULT_SETTINGS)
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS)
    expect(sanitizeSettings({})).toEqual(DEFAULT_SETTINGS)
  })

  it('passes valid values through unchanged', () => {
    expect(sanitizeSettings({ cycleLength: 32, periodLength: 4 })).toEqual({
      cycleLength: 32,
      periodLength: 4,
    })
    expect(sanitizeSettings({ cycleLength: 28, periodLength: 5 })).toEqual(DEFAULT_SETTINGS)
  })

  it('clamps values below the minimum', () => {
    expect(
      sanitizeSettings({ cycleLength: SETTINGS_LIMITS.cycleLength.min - 1, periodLength: 0 }),
    ).toEqual({
      cycleLength: SETTINGS_LIMITS.cycleLength.min,
      periodLength: SETTINGS_LIMITS.periodLength.min,
    })
  })

  it('clamps values above the maximum', () => {
    expect(
      sanitizeSettings({ cycleLength: 999, periodLength: 40 }),
    ).toEqual({
      cycleLength: SETTINGS_LIMITS.cycleLength.max,
      periodLength: SETTINGS_LIMITS.periodLength.max,
    })
  })

  it('rounds fractional input', () => {
    expect(sanitizeSettings({ cycleLength: 28.6, periodLength: 4.2 })).toEqual({
      cycleLength: 29,
      periodLength: 4,
    })
  })

  it('falls back per-field on garbage input', () => {
    // Corrupted blob shape — as a malformed localStorage payload would produce.
    const garbage = JSON.parse('{"cycleLength":"28","periodLength":null,"extra":true}')
    expect(sanitizeSettings(garbage)).toEqual(DEFAULT_SETTINGS)
    expect(sanitizeSettings({ cycleLength: Infinity, periodLength: NaN })).toEqual(DEFAULT_SETTINGS)
  })
})