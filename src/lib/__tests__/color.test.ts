import { describe, expect, it } from 'vitest'
import { contrastRing, darken, hexToHsv, hexToRgb, hsvToHex, lighten, mixHex, rgbToHex } from '../color'

describe('hexToRgb / rgbToHex', () => {
  it('round-trips channel values', () => {
    expect(hexToRgb('#e58aa8')).toEqual({ r: 229, g: 138, b: 168 })
    expect(rgbToHex({ r: 229, g: 138, b: 168 })).toBe('#e58aa8')
    expect(hexToRgb('#000000')).toEqual({ r: 0, g: 0, b: 0 })
    expect(hexToRgb('#ffffff')).toEqual({ r: 255, g: 255, b: 255 })
  })

  it('pads single-digit channels', () => {
    expect(rgbToHex({ r: 0, g: 15, b: 16 })).toBe('#000f10')
  })

  it('clamps out-of-range channels', () => {
    expect(rgbToHex({ r: 300, g: -5, b: 128 })).toBe('#ff0080')
  })
})

describe('mixHex / darken / lighten', () => {
  it('mix ratio 0 = from, 1 = to', () => {
    expect(mixHex('#ff0000', '#0000ff', 0)).toBe('#ff0000')
    expect(mixHex('#ff0000', '#0000ff', 1)).toBe('#0000ff')
  })

  it('midpoint blend', () => {
    expect(mixHex('#ffffff', '#000000', 0.5)).toBe('#808080')
  })

  it('darken moves toward black', () => {
    // lavender-100 #e4dcf3 darken 0.42 ≈ the old lavender-700 text shade
    expect(darken('#e4dcf3', 0.42)).toBe('#84808d')
    expect(darken('#ffffff', 1)).toBe('#000000')
  })

  it('lighten moves toward white', () => {
    // lavender-400 #b9a7d9 lighten 0.55 ≈ the old lavender-100 ring shade
    expect(lighten('#b9a7d9', 0.55)).toBe('#e0d7ee')
    expect(lighten('#000000', 1)).toBe('#ffffff')
  })

  it('matches the shipped sage text derivation', () => {
    // sage-100 #e3eddd darken 0.35 ≈ the old sage-400 #8fae8b
    expect(darken('#e3eddd', 0.35)).toBe('#949a90')
  })
})

describe('contrastRing', () => {
  it('white on dark fills (period pink #f2318c)', () => {
    expect(contrastRing('#f2318c')).toBe('#ffffff')
    expect(contrastRing('#000000')).toBe('#ffffff')
  })

  it('darkened fill shade on light fills', () => {
    // lavender-100 fill → darken 0.62
    expect(contrastRing('#e4dcf3')).toBe('#57545c')
    // sage-100 fill → darken 0.62
    expect(contrastRing('#e3eddd')).toBe('#565a54')
    // pure white → mid-gray
    expect(contrastRing('#ffffff')).toBe('#616161')
  })

  it('is deterministic around the luma threshold', () => {
    // A mid-tone just under the threshold inverts to white…
    expect(contrastRing('#969696')).toBe('#ffffff')
    // …just over it inverts to a darkened shade (never white-on-white).
    expect(contrastRing('#9b9b9b')).not.toBe('#ffffff')
  })
})

describe('hexToHsv / hsvToHex', () => {
  it('round-trips reference colors', () => {
    // Fitbit period pink
    expect(hsvToHex(hexToHsv('#f2318c'))).toBe('#f2318c')
    // pure primaries
    expect(hexToHsv('#ff0000')).toEqual({ h: 0, s: 1, v: 1 })
    expect(hexToHsv('#00ff00')).toEqual({ h: 120, s: 1, v: 1 })
    expect(hexToHsv('#0000ff')).toEqual({ h: 240, s: 1, v: 1 })
    // black / white / gray have no hue or saturation
    expect(hexToHsv('#000000')).toEqual({ h: 0, s: 0, v: 0 })
    expect(hexToHsv('#ffffff')).toEqual({ h: 0, s: 0, v: 1 })
    expect(hexToHsv('#808080')).toEqual({ h: 0, s: 0, v: 128 / 255 })
    expect(hsvToHex({ h: 0, s: 0, v: 128 / 255 })).toBe('#808080')
  })

  it('maps known hue wedges', () => {
    // lavender-400 #b9a7d9 — d > r indicates a blue-ish hue (r < b)
    const { h, s } = hexToHsv('#b9a7d9')
    expect(h).toBeGreaterThan(200)
    expect(h).toBeLessThan(300)
    expect(s).toBeGreaterThan(0.2)
    // orange/peach — r > g > b
    expect(hexToHsv('#f4a88e').h).toBeGreaterThan(10)
    expect(hexToHsv('#f4a88e').h).toBeLessThan(40)
    // sage — green-ish (g dominant)
    expect(hexToHsv('#8fae8b').h).toBeGreaterThan(100)
    expect(hexToHsv('#8fae8b').h).toBeLessThan(140)
  })

  it('round-trips hsvToHex for a range of hue steps', () => {
    for (let h = 0; h < 360; h += 30) {
      const hex = hsvToHex({ h, s: 0.8, v: 0.6 })
      const back = hexToHsv(hex)
      expect(back.h).toBeCloseTo(h, 0)
    }
  })
})