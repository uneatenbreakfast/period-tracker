/**
 * Geometry helper for revealing a calendar day behind a bottom sheet.
 *
 * When the cycle-day summary (or any bottom sheet) pops over the calendar,
 * the opaque sheet panel can cover the very day the user just tapped. These
 * helpers compute how far the calendar's scroll container must move so the
 * tapped day is visible again in the strip above the sheet.
 */

/** Minimum gap (px) kept between the revealed day cell and the sheet's top edge. */
export const SHEET_GAP_PX = 12

/**
 * ScrollTop increase (px) needed to lift a day cell above a bottom sheet.
 *
 * `cellBottom` is the cell's viewport-space bottom edge; `sheetTop` is the
 * sheet panel's viewport-space top edge. Returns 0 when the cell is already
 * fully visible above the sheet — callers must only scroll when > 0.
 */
export function revealDelta(cellBottom: number, sheetTop: number, gapPx: number = SHEET_GAP_PX): number {
  return Math.max(0, cellBottom - sheetTop + gapPx)
}
