/**
 * Pure drag-to-range state machine for the calendar day grid.
 *
 * A drag requires a LONG PRESS to arm: the gesture starts on a day cell
 * (`beginDrag`), and only after the press has been held past `LONG_PRESS_MS`
 * without exceeding `SLOP_PX` of movement (`armDrag`) does the selection
 * begin. Once armed, crossing other cells extends the range (`extendDrag`);
 * releasing commits (`commitDrag`) as an inclusive range or stays a plain tap
 * (unarmed, or armed but never moved → null, caller must not log a range).
 * Backward drags normalize to ascending bounds. Kept pure so the gesture
 * semantics are unit-testable; the pointer-event wiring (pointerdown/
 * pointermove/ pointerup/pointercancel + the hold timer) lives in Calendar.tsx.
 */
import { addDays, diffDays } from './dates'
export interface RangeDrag {
  /** ISO date of the cell where the drag started */
  start: string
  /** ISO date of the cell currently under the pointer */
  end: string
  /** True once the long-press threshold was met — extend/commit require it */
  armed: boolean
}

/** How long the press must be held before the range selection arms. */
export const LONG_PRESS_MS = 400
/** Max pixel movement before arming — beyond this the gesture is aborted. */
export const SLOP_PX = 10

export function beginDrag(iso: string): RangeDrag {
  return { start: iso, end: iso, armed: false }
}

/** Arm the drag once the long-press threshold is met. Idempotent. */
export function armDrag(d: RangeDrag): RangeDrag {
  return d.armed ? d : { ...d, armed: true }
}

/**
 * Extend the drag to the cell under the pointer; same cell = no-op. No-op
 * until armed — a quick drag (finger moving before the long press) must not
 * start a selection.
 */
export function extendDrag(d: RangeDrag, iso: string, maxDays?: number): RangeDrag {
  if (!d.armed || d.end === iso) return d
  if (maxDays != null) {
    const diff = Math.abs(diffDays(iso, d.start))
    if (diff > maxDays) {
      // Clamp: keep the direction but stop at maxDays from the start
      const clamped = diffDays(iso, d.start) > 0
        ? addDays(d.start, maxDays)
        : addDays(d.start, -maxDays)
      return { ...d, end: clamped }
    }
  }
  return { ...d, end: iso }
}

/**
 * Finish a drag. Returns the inclusive range as ascending `[from, to]` when
 * the drag was armed AND the pointer moved onto a different day, or `null`
 * for a plain tap (never armed, or released on the start cell — a long press
 * without a drag is still just a tap).
 */
export function commitDrag(d: RangeDrag): { from: string; to: string } | null {
  if (!d.armed || d.start === d.end) return null
  return d.start <= d.end ? { from: d.start, to: d.end } : { from: d.end, to: d.start }
}
