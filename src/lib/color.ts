/**
 * Tiny hex color helpers — used to derive readable text/ring shades from the
 * user-picked calendar colors (BLOOM-0022). All functions are pure and
 * unit-tested; input is assumed to be a normalized `#rrggbb` hex string
 * (as produced by `sanitizeCalendarStyle`).
 */

export interface Rgb {
  r: number
  g: number
  b: number
}

/** Parse a lowercase `#rrggbb` hex string into channel values 0–255. */
export function hexToRgb(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16)
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff }
}

/** Format channels back into a lowercase `#rrggbb` hex string. */
export function rgbToHex({ r, g, b }: Rgb): string {
  const c = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`
}

/**
 * Linear interpolation between two hex colors. `ratio` 0 = `from`,
 * 1 = `to` (any float in between). Used for:
 *  - darkening a pastel fill into a readable text shade (toward '#000000')
 *  - lightening a dot color into a soft ring shade (toward '#ffffff')
 */
export function mixHex(from: string, to: string, ratio: number): string {
  const a = hexToRgb(from)
  const b = hexToRgb(to)
  return rgbToHex({
    r: a.r + (b.r - a.r) * ratio,
    g: a.g + (b.g - a.g) * ratio,
    b: a.b + (b.b - a.b) * ratio,
  })
}

/** Mix `hex` toward black by `ratio` (0–1) — darker text on a fill. */
export function darken(hex: string, ratio: number): string {
  return mixHex(hex, '#000000', ratio)
}

/** Mix `hex` toward white by `ratio` (0–1) — soft ring / halo shade. */
export function lighten(hex: string, ratio: number): string {
  return mixHex(hex, '#ffffff', ratio)
}

export interface Hsv {
  /** Hue 0–360 (degrees). */
  h: number
  /** Saturation 0–1. */
  s: number
  /** Value (brightness) 0–1. */
  v: number
}

/** Convert a normalized lowercase `#rrggbb` hex string into HSV. */
export function hexToHsv(hex: string): Hsv {
  const { r, g, b } = hexToRgb(hex)
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const d = max - min
  const v = max
  let h = 0
  let s = max === 0 ? 0 : d / max
  if (d !== 0) {
    if (max === rn) h = 60 * (((gn - bn) / d) % 6)
    else if (max === gn) h = 60 * ((bn - rn) / d + 2)
    else h = 60 * ((rn - gn) / d + 4)
  }
  if (h < 0) h += 360
  return { h, s, v }
}

/** Convert HSV back into a normalized lowercase `#rrggbb` hex string. */
export function hsvToHex({ h, s, v }: Hsv): string {
  const c = v * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = v - c
  let r = 0
  let g = 0
  let b = 0
  if (h < 60) [r, g, b] = [c, x, 0]
  else if (h < 120) [r, g, b] = [x, c, 0]
  else if (h < 180) [r, g, b] = [0, c, x]
  else if (h < 240) [r, g, b] = [0, x, c]
  else if (h < 300) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  return rgbToHex({
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  })
}