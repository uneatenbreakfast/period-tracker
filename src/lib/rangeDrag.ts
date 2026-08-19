/**
 * Pure drag-to-range state machine for the calendar day grid.
 *
 * A drag starts on a day cell (`beginDrag`), extends as the pointer crosses
 * other cells (`extendDrag`), and either commits as an inclusive range
 * (`commitDrag`) or stays a plain tap (start === end → null, caller must not
 * log a range). Backward drags normalize to ascending bounds. Kept pure so the
 * gesture semantics are unit-testable; the pointer-event wiring (pointerdown/
 * pointerenter/pointerup/pointercancel + touch-action) lives in Calendar.tsx.
 */
export interface RangeDrag {
  /** ISO date of the cell where the drag started */
  start: string
  /** ISO date of the cell currently under the pointer */
  end: string
}

export function beginDrag(iso: string): RangeDrag {
  return { start: iso, end: iso }
}

/** Extend the drag to the cell under the pointer; same cell = no-op. */
export function extendDrag(d: RangeDrag, iso: string): RangeDrag {
  return d.end === iso ? d : { ...d, end: iso }
}

/**
 * Finish a drag. Returns the inclusive range as ascending `[from, to]` when
 * the pointer actually moved onto a different day, or `null` for a plain tap
 * (start === end).
 */
export function commitDrag(d: RangeDrag): { from: string; to: string } | null {
  if (d.start === d.end) return null
  return d.start <= d.end ? { from: d.start, to: d.end } : { from: d.end, to: d.start }
}