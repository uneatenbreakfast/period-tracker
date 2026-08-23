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
import { addDays, diffDays } from './dates'

export interface EditRange {
  /** Committed run bounds before editing (cancel restores these) */
  originalStart: string
  originalEnd: string
  /** Current edited bounds — maintained ascending (start <= end) */
  start: string
  end: string
  /** How the edit was initiated:
   *  - 'range': long-press on a flow day entered edit mode with a continued
   *    drag — the drag span (pressOrigin → current cell) replaces BOTH bounds.
   *  - 'handle': the user tapped a start/end cap handle — only that axis moves.
   */
  dragMode: 'range' | 'handle'
  /** Cell where the initiating long-press happened (range mode only). */
  pressOriginISO?: string
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
 * Enter edit mode on a run from a long-press: dates stay at the original
 * committed bounds (no shift on enter). If the finger continues to drag,
 * `extendEditRange` replaces both bounds from the press origin.
 */
export function beginEdit(
  run: { start: string; end: string },
  pressed: string,
): EditRange {
  return {
    originalStart: run.start,
    originalEnd: run.end,
    start: run.start,
    end: run.end,
    dragMode: 'range',
    pressOriginISO: pressed,
  }
}

/**
 * Enter edit mode from a handle tap: only the tapped axis will move on
 * drag. Bounds start at the committed run.
 */
export function beginEditHandle(
  run: { start: string; end: string },
  axis: 'start' | 'end',
): EditRange {
  return {
    originalStart: run.start,
    originalEnd: run.end,
    start: run.start,
    end: run.end,
    dragMode: 'handle',
    // pressOriginISO unused for handle mode but keep the shape consistent.
    pressOriginISO: axis === 'start' ? run.start : run.end,
  }
}

/**
 * Range-mode drag extension: the long-press cell is one bound, the cell now
 * under the pointer is the other. The edited range is the ascending span.
 * Respects maxPeriodDays by clamping the far end toward the press origin.
 */
export function extendEditRange(edit: EditRange, iso: string, maxDays?: number): EditRange {
  if (edit.dragMode !== 'range' || !edit.pressOriginISO) return edit
  // No movement from press origin — keep original committed bounds.
  if (iso === edit.pressOriginISO) return edit
  const a = edit.pressOriginISO
  const b = iso
  let start = a <= b ? a : b
  let end = a <= b ? b : a
  if (maxDays != null) {
    const dist = diffDays(end, start)
    if (dist > maxDays) {
      // Clamp the far end toward the press origin, preserving direction.
      if (a <= b) end = addDays(start, maxDays)
      else start = addDays(end, -maxDays)
    }
  }
  return edit.start === start && edit.end === end ? edit : { ...edit, start, end }
}

/**
 * Drag the start handle (handle mode only); clamped so it can't cross the
 * end (1-day minimum). Range-mode edits use `extendEditRange` instead.
 */
export function moveStart(edit: EditRange, iso: string, maxDays?: number): EditRange {
  if (edit.dragMode !== 'handle') return edit
  let start = iso <= edit.end ? iso : edit.end
  if (maxDays != null) {
    const dist = diffDays(edit.end, start)
    if (dist > maxDays) start = addDays(edit.end, -maxDays)
  }
  return edit.start === start ? edit : { ...edit, start }
}

/**
 * Drag the end handle (handle mode only); clamped so it can't cross the
 * start (1-day minimum). Range-mode edits use `extendEditRange` instead.
 */
export function moveEnd(edit: EditRange, iso: string, maxDays?: number): EditRange {
  if (edit.dragMode !== 'handle') return edit
  let end = iso >= edit.start ? iso : edit.start
  if (maxDays != null) {
    const dist = diffDays(end, edit.start)
    if (dist > maxDays) end = addDays(edit.start, maxDays)
  }
  return edit.end === end ? edit : { ...edit, end }
}

/** Commit the edit as ascending inclusive bounds for the storage layer. */
export function commitEdit(edit: EditRange): { from: string; to: string } {
  return edit.start <= edit.end ? { from: edit.start, to: edit.end } : { from: edit.end, to: edit.start }
}

/** Return the ORIGINAL run bounds — used by the delete button to know which
 *  days to clear (the user may have dragged handles before deciding to delete). */
export function deleteRange(edit: EditRange): { from: string; to: string } {
  return edit.originalStart <= edit.originalEnd
    ? { from: edit.originalStart, to: edit.originalEnd }
    : { from: edit.originalEnd, to: edit.originalStart }
}