import { describe, expect, it } from 'vitest'
import {
  FOLLOW_MAX_PX,
  FOLLOW_SLOP_PX,
  followOffset,
  nextTab,
  prevTab,
  swipeDirection,
  SWIPE_THRESHOLD_PX,
  tabDelta,
} from '../swipeTabs'

describe('swipeDirection', () => {
  it('returns null for a tap (no movement)', () => {
    expect(swipeDirection(0, 0)).toBeNull()
    expect(swipeDirection(5, 3)).toBeNull()
  })

  it('returns null for vertical scrolls (dy dominates)', () => {
    expect(swipeDirection(10, 200)).toBeNull()
    expect(swipeDirection(-14, -300)).toBeNull()
  })

  it('returns null for diagonal draws (dy within ratio of dx)', () => {
    expect(swipeDirection(-60, -55)).toBeNull()
    expect(swipeDirection(70, 60)).toBeNull()
  })

  it("returns 'left' when dx passes the threshold to the left", () => {
    expect(swipeDirection(-SWIPE_THRESHOLD_PX, 0)).toBe('left')
    expect(swipeDirection(-120, 30)).toBe('left')
  })

  it("returns 'right' when dx passes the threshold to the right", () => {
    expect(swipeDirection(SWIPE_THRESHOLD_PX, -5)).toBe('right')
    expect(swipeDirection(90, 40)).toBe('right')
  })

  it('honours a custom threshold', () => {
    expect(swipeDirection(-30, 0)).toBeNull()
    expect(swipeDirection(-30, 0, 20)).toBe('left')
  })
})

describe('nextTab / prevTab', () => {
  it('nextTab walks forward through the nav order', () => {
    expect(nextTab('calendar')).toBe('health')
    expect(nextTab('health')).toBe('trends')
    expect(nextTab('trends')).toBe('settings')
  })

  it('nextTab wraps from the last tab to the first', () => {
    expect(nextTab('settings')).toBe('calendar')
  })

  it('prevTab walks backward through the nav order', () => {
    expect(prevTab('calendar')).toBe('settings')
    expect(prevTab('health')).toBe('calendar')
    expect(prevTab('settings')).toBe('trends')
  })

  it('prevTab wraps from the first tab to the last', () => {
    expect(prevTab('settings')).toBe('trends')
    expect(prevTab('calendar')).toBe('settings')
  })
})

describe('tabDelta', () => {
  it('is +1 moving forward through the nav order', () => {
    expect(tabDelta('calendar', 'health')).toBe(1)
    expect(tabDelta('health', 'trends')).toBe(1)
    expect(tabDelta('trends', 'settings')).toBe(1)
  })

  it('is -1 moving backward through the nav order', () => {
    expect(tabDelta('health', 'calendar')).toBe(-1)
    expect(tabDelta('settings', 'trends')).toBe(-1)
  })

  it('maps wrap-around to the short way (settings → calendar = backward)', () => {
    expect(tabDelta('settings', 'calendar')).toBe(-1)
    expect(tabDelta('calendar', 'settings')).toBe(1)
  })

  it('is 0 for the same tab', () => {
    expect(tabDelta('trends', 'trends')).toBe(0)
  })
})

describe('followOffset', () => {
  it('returns null below the slop (taps, tiny jitter)', () => {
    expect(followOffset(0, 0)).toBeNull()
    expect(followOffset(5, 2)).toBeNull()
    expect(followOffset(FOLLOW_SLOP_PX - 1, 0)).toBeNull()
  })

  it('returns null for vertical and diagonal drift (scroll owns those)', () => {
    expect(followOffset(10, 200)).toBeNull()
    expect(followOffset(-60, -55)).toBeNull()
  })

  it('returns raw horizontal travel once the slop is beaten', () => {
    expect(followOffset(-48, 0)).toBe(-48)
    expect(followOffset(90, 40)).toBe(90)
  })

  it('clamps to ±FOLLOW_MAX_PX so long swipes settle fast', () => {
    expect(followOffset(-300, 0)).toBe(-FOLLOW_MAX_PX)
    expect(followOffset(250, -5)).toBe(FOLLOW_MAX_PX)
  })
})