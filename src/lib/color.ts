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