import { describe, expect, it } from 'vitest'
import { revealDelta, SHEET_GAP_PX } from '../sheetReveal'

describe('revealDelta', () => {
  it('returns 0 when the cell is already fully above the sheet', () => {
    // cell bottom 400, sheet top 600 → 74px of clear space above the sheet
    expect(revealDelta(400, 600)).toBe(0)
  })

  it('adds only the breathing gap when the cell bottom sits exactly at the sheet top', () => {
    // flush → the cell is fully visible but kisses the sheet; nudge up by the
    // gap so the ring never touches the sheet's rounded edge
    expect(revealDelta(600, 600)).toBe(SHEET_GAP_PX)
  })

  it('scrolls by the overlap plus the breathing gap when the sheet covers the cell', () => {
    // cell bottom 700, sheet top 600 → 100px under the sheet + 12px gap
    expect(revealDelta(700, 600)).toBe(100 + SHEET_GAP_PX)
    expect(revealDelta(700, 600)).toBe(112)
  })

  it('scrolls exactly the covered amount for a fully buried cell', () => {
    // cell bottom 900, sheet top 500 → 400px buried + gap
    expect(revealDelta(900, 500)).toBe(400 + SHEET_GAP_PX)
  })

  it('honors a custom gap', () => {
    expect(revealDelta(700, 600, 4)).toBe(104)
    expect(revealDelta(700, 600, 0)).toBe(100)
  })

  it('clamps negative overlap to 0 (no upward scroll)', () => {
    // 40px clear — well above the 12px breathing gap
    expect(revealDelta(560, 600)).toBe(0)
  })
})
