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