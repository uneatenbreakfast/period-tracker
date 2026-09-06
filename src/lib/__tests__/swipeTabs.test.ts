import { describe, expect, it } from 'vitest'
import { nextTab, prevTab, swipeDirection, SWIPE_THRESHOLD_PX } from '../swipeTabs'

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