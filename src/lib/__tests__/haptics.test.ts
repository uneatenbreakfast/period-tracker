import { afterEach, describe, expect, it, vi } from 'vitest'
import { HAPTIC_DOUBLE_PULSE_PATTERN, HAPTIC_PULSE_MS, hapticLongPress, hapticPulse } from '../haptics'

describe('hapticPulse', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('calls navigator.vibrate with the default double-pulse pattern when supported', () => {
    const vibrate = vi.fn(() => true)
    vi.stubGlobal('navigator', { vibrate })
    expect(hapticPulse()).toBe(true)
    expect(vibrate).toHaveBeenCalledWith(HAPTIC_DOUBLE_PULSE_PATTERN)
  })

  it('default pattern fires two bursts separated by a pause (double pulse)', () => {
    expect(HAPTIC_DOUBLE_PULSE_PATTERN).toEqual([HAPTIC_PULSE_MS, HAPTIC_PULSE_MS, HAPTIC_PULSE_MS])
  })

  it('forwards a custom pattern so callers can vary the tick', () => {
    const vibrate = vi.fn(() => true)
    vi.stubGlobal('navigator', { vibrate })
    expect(hapticPulse([10, 40, 10])).toBe(true)
    expect(vibrate).toHaveBeenCalledWith([10, 40, 10])
  })

  it('no-ops (returns false) when the platform has no vibrate API', () => {
    vi.stubGlobal('navigator', {})
    expect(hapticPulse()).toBe(false)
  })

  it('no-ops without throwing when navigator itself is absent', () => {
    vi.stubGlobal('navigator', undefined)
    expect(hapticPulse()).toBe(false)
  })
})

describe('hapticLongPress', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('embeds the delay as the first element of the vibration pattern', () => {
    const vibrate = vi.fn(() => true)
    vi.stubGlobal('navigator', { vibrate })
    expect(hapticLongPress(400)).toBe(true)
    expect(vibrate).toHaveBeenCalledWith([400, ...HAPTIC_DOUBLE_PULSE_PATTERN])
  })

  it('accepts a custom pattern after the delay', () => {
    const vibrate = vi.fn(() => true)
    vi.stubGlobal('navigator', { vibrate })
    hapticLongPress(300, [10, 40, 10])
    expect(vibrate).toHaveBeenCalledWith([300, 10, 40, 10])
  })

  it('no-ops when navigator.vibrate is absent', () => {
    vi.stubGlobal('navigator', {})
    expect(hapticLongPress(400)).toBe(false)
  })
})