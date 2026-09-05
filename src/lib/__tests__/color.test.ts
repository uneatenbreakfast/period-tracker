import { describe, expect, it } from 'vitest'
import { darken, hexToRgb, lighten, mixHex, rgbToHex } from '../color'

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