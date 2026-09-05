import type { Settings } from '../types'

/** Fitbit-style defaults until the user customizes them (BLOOM-0002). */
export const DEFAULT_SETTINGS: Settings = { cycleLength: 28, periodLength: 5, showSafeDays: true }

/** Sanity bounds for the settings page steppers. */
export const SETTINGS_LIMITS = {
  cycleLength: { min: 15, max: 60 },
  periodLength: { min: 1, max: 15 },
} as const

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : NaN
  if (Number.isNaN(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

/**
 * Coerce arbitrary stored/user input into valid settings: missing or garbage
 * fields fall back to defaults, out-of-range numbers clamp to the limits.
 * Never returns a settings object the UI can't render.
 */
export function sanitizeSettings(raw: Partial<Settings> | null | undefined): Settings {
  return {
    cycleLength: clampInt(
      raw?.cycleLength,
      SETTINGS_LIMITS.cycleLength.min,
      SETTINGS_LIMITS.cycleLength.max,
      DEFAULT_SETTINGS.cycleLength,
    ),
    periodLength: clampInt(
      raw?.periodLength,
      SETTINGS_LIMITS.periodLength.min,
      SETTINGS_LIMITS.periodLength.max,
      DEFAULT_SETTINGS.periodLength,
    ),
    showSafeDays: typeof raw?.showSafeDays === 'boolean' ? raw.showSafeDays : DEFAULT_SETTINGS.showSafeDays,
  }
}