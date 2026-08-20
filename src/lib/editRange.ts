/**
 * Edit-mode state machine for an existing committed period run.
 *
 * Long-pressing a day inside a committed run enters edit mode: the pressed
 * day becomes the NEW START of the run, the run's END stays put, and the
 * start/end handles can then be dragged around (`moveStart`/`moveEnd`).
 * Save (`commitEdit`) returns the ascending bounds for `replaceRangeFlow`;
 * cancel discards the EditRange entirely (Calendar keeps the original).
 * Kept pure so the semantics are unit-testable; pointer wiring lives in
 * Calendar.tsx.
 */
import { addDays } from './dates'

export interface EditRange {
  /** Committed run bounds before editing (cancel restores these) */
  originalStart: string
  originalEnd: string
  /** Current edited bounds — maintained ascending (start <= end) */
  start: string
  end: string
}

/**
 * Bounds of the contiguous run of flow days containing `iso`, walking day
 * neighbors across month boundaries. Null when the day has no flow.
 */
export function runBoundsAt(
  hasFlow: (iso: string) => boolean,
  iso: string,
): { start: string; end: string } | null {
  if (!hasFlow(iso)) return null
  let start = iso
  while (hasFlow(addDays(start, -1))) start = addDays(start, -1)
  let end = iso
  while (hasFlow(addDays(end, 1))) end = addDays(end, 1)
  return { start, end }
}

/**
 * Enter edit mode on a run: the pressed day becomes the new start, the run's
 * end remains. `pressed` must be inside the run (it has flow).
 */
export function beginEdit(
  run: { start: string; end: string },
  pressed: string,
): EditRange {
  return { originalStart: run.start, originalEnd: run.end, start: pressed, end: run.end }
}

/** Drag the start handle; clamped so it can't cross the end (1-day minimum). */
export function moveStart(edit: EditRange, iso: string): EditRange {
  const start = iso <= edit.end ? iso : edit.end
  return edit.start === start ? edit : { ...edit, start }
}

/** Drag the end handle; clamped so it can't cross the start (1-day minimum). */
export function moveEnd(edit: EditRange, iso: string): EditRange {
  const end = iso >= edit.start ? iso : edit.start
  return edit.end === end ? edit : { ...edit, end }
}

/** Commit the edit as ascending inclusive bounds for the storage layer. */
export function commitEdit(edit: EditRange): { from: string; to: string } {
  return edit.start <= edit.end ? { from: edit.start, to: edit.end } : { from: edit.end, to: edit.start }
}