// Tab swipe navigation logic — pure functions, no DOM.
//
// Horizontal swipe on tab content switches tabs (left → next, right → prev).
// Gestures that START inside the calendar component never navigate (the
// calendar owns its touches: vertical scroll + long-press range drag).

export const TABS = ['calendar', 'health', 'trends', 'settings'] as const
export type Tab = (typeof TABS)[number]

/** Minimum horizontal travel (px) for a swipe to count. */
export const SWIPE_THRESHOLD_PX = 48

/** Horizontal travel must exceed vertical drift by this ratio, or it's a
 *  vertical scroll / diagonal gesture, not a tab swipe. */
export const SWIPE_DIAGONAL_RATIO = 1.2

/** Next tab in the nav order (wraps: settings → calendar). */
export function nextTab(tab: Tab): Tab {
  return TABS[(TABS.indexOf(tab) + 1) % TABS.length]
}

/** Previous tab in the nav order (wraps: calendar → settings). */
export function prevTab(tab: Tab): Tab {
  return TABS[(TABS.indexOf(tab) + TABS.length - 1) % TABS.length]
}

/** Classify a finished gesture by its total travel. Returns 'left' when the
 *  finger moved left past the threshold, 'right' for the mirror, or null for
 *  taps, vertical scrolls, and diagonal draws. */
export function swipeDirection(
  dx: number,
  dy: number,
  threshold: number = SWIPE_THRESHOLD_PX,
): 'left' | 'right' | null {
  if (Math.abs(dx) < threshold) return null
  if (Math.abs(dy) > Math.abs(dx) / SWIPE_DIAGONAL_RATIO) return null
  return dx < 0 ? 'left' : 'right'
}

/** Direction of travel between two tabs in the nav order: -1 (backward),
 *  0 (same tab), or +1 (forward). Wrap-around maps to the SHORT way (-1:
 *  settings → calendar counts as backward because calendar sits left of
 *  settings in the nav). */
export function tabDelta(from: Tab, to: Tab): -1 | 0 | 1 {
  const d = TABS.indexOf(to) - TABS.indexOf(from)
  if (d === 0) return 0
  return d > 0 ? 1 : -1
}

/** Max px the tab content may travel with a finger mid-swipe (and therefore
 *  the max px it glides from when the new tab enters). Longer swipes settle
 *  from the clamp so the landing always feels snappy. */
export const FOLLOW_MAX_PX = 100

/** Horizontal travel (px) before content starts following the finger. */
export const FOLLOW_SLOP_PX = 8

/** Live drag-follow offset for an in-progress gesture: horizontal travel once
 *  it beats the slop AND vertical drift is within the diagonal ratio, clamped
 *  to ±FOLLOW_MAX_PX. Returns null when the gesture should not move content
 *  (below slop, or vertical/diagonal — those belong to scrolling). */
export function followOffset(dx: number, dy: number): number | null {
  if (Math.abs(dx) < FOLLOW_SLOP_PX) return null
  if (Math.abs(dy) > Math.abs(dx) / SWIPE_DIAGONAL_RATIO) return null
  return Math.max(-FOLLOW_MAX_PX, Math.min(FOLLOW_MAX_PX, dx))
}