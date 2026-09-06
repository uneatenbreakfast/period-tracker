import type { CalendarStyle, Settings } from '../types'

/** Bloom's PRD pastel palette (index.css @theme) — the shipped defaults. */
export const DEFAULT_CALENDAR_STYLE: CalendarStyle = {
  period: '#e58aa8', // rose-400
  predicted: '#e89db9', // rose-300 (dashed outline)
  fertile: '#e4dcf3', // lavender-100
  ovulation: '#b9a7d9', // lavender-400
  safe: '#e3eddd', // sage-100
  monthTint: '#dfe3e8', // month tint
  trendFertile: '#c9b8e3', // lavender-200
  trendOvulation: '#f4a88e', // peach-400
  ringFollicular: '#e4dcf3', // lavender-100
  ringOvulation: '#f4a88e', // peach-400
  ringLuteal: '#8fae8b', // sage-400
}

/** Fitbit-style defaults until the user customizes them (BLOOM-0002). */
export const DEFAULT_SETTINGS: Settings = {
  cycleLength: 28,
  periodLength: 5,
  showSafeDays: true,
  style: { ...DEFAULT_CALENDAR_STYLE },
}

/** Sanity bounds for the settings page steppers. */
export const SETTINGS_LIMITS = {
  cycleLength: { min: 15, max: 60 },
  periodLength: { min: 1, max: 15 },
} as const

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i

/** Expand a 3-digit short hex (`#abc`) into full `#aabbcc`. */
function expandHex(short: string): string {
  return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`
}

/**
 * Coerce arbitrary stored/user input into a valid CalendarStyle: per-field
 * missing/garbage → default, valid hex (3 or 6 digits, any case) normalized
 * to lowercase 6-digit. Never returns a color object the UI can't render.
 */
export function sanitizeCalendarStyle(raw: Partial<CalendarStyle> | null | undefined): CalendarStyle {
  const out: CalendarStyle = { ...DEFAULT_CALENDAR_STYLE }
  if (!raw || typeof raw !== 'object') return out
  for (const key of [
    'period',
    'predicted',
    'fertile',
    'ovulation',
    'safe',
    'monthTint',
    'trendFertile',
    'trendOvulation',
    'ringFollicular',
    'ringOvulation',
    'ringLuteal',
  ] as const) {
    const v = raw[key]
    if (typeof v === 'string' && HEX_RE.test(v)) {
      out[key] = v.length === 4 ? expandHex(v.toLowerCase()) : v.toLowerCase()
    }
  }
  return out
}

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
    style: sanitizeCalendarStyle(raw?.style),
  }
}