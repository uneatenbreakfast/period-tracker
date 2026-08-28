import { afterEach, describe, expect, it, vi } from 'vitest'
import { cancelHaptic, HAPTIC_DOUBLE_PULSE_PATTERN, HAPTIC_PULSE_MS, hapticLongPress, hapticPulse } from '../haptics'

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

  it('embeds the delay after a 0ms vibrate (pattern starts with pause)', () => {
    const vibrate = vi.fn(() => true)
    vi.stubGlobal('navigator', { vibrate })
    expect(hapticLongPress(400)).toBe(true)
    expect(vibrate).toHaveBeenCalledWith([0, 400, ...HAPTIC_DOUBLE_PULSE_PATTERN])
  })

  it('accepts a custom pattern after the delay', () => {
    const vibrate = vi.fn(() => true)
    vi.stubGlobal('navigator', { vibrate })
    hapticLongPress(300, [10, 40, 10])
    expect(vibrate).toHaveBeenCalledWith([0, 300, 10, 40, 10])
  })

  it('no-ops when navigator.vibrate is absent', () => {
    vi.stubGlobal('navigator', {})
    expect(hapticLongPress(400)).toBe(false)
  })

  // REGRESSION: pattern MUST start with [0, delayMs, ...] not [delayMs, ...].
  // Vibration pattern semantics: even indices = vibrate, odd indices = pause.
  // [400, 30, 30, 30] vibrates 400ms IMMEDIATELY on pointerdown (unwanted buzz).
  // [0, 400, 30, 30, 30] = 0ms vibrate (no-op) + 400ms pause + double pulse.
  // This also preserves transient-activation context since the call happens
  // synchronously in the pointerdown handler, not in a setTimeout callback.
  it('REGRESSION: pattern starts with 0ms vibrate then delay pause (not immediate vibration)', () => {
    const vibrate = vi.fn<(...args: number[][]) => true>(() => true)
    vi.stubGlobal('navigator', { vibrate })
    hapticLongPress(400)
    const pattern = vibrate.mock.calls[0][0] as number[]
    expect(pattern[0]).toBe(0) // 0ms vibrate (no-op), NOT delayMs
    expect(pattern[1]).toBe(400) // delay as pause (odd index)
    expect(pattern.length).toBe(2 + HAPTIC_DOUBLE_PULSE_PATTERN.length)
  })

  it('REGRESSION: must use hapticLongPress not hapticPulse for delayed feedback', () => {
    // hapticPulse fires immediately — wrong for long-press arm feedback.
    // hapticLongPress embeds delay in pattern for transient-activation safety.
    const vibrate = vi.fn<(...args: number[][]) => true>(() => true)
    vi.stubGlobal('navigator', { vibrate })
    hapticLongPress(400)
    const pattern = vibrate.mock.calls[0][0] as number[]
    // Pattern length > default double-pulse proves delay prefix is present
    expect(pattern.length).toBeGreaterThan(HAPTIC_DOUBLE_PULSE_PATTERN.length)
    // First two elements are the delay prefix [0, delayMs]
    expect(pattern.slice(0, 2)).toEqual([0, 400])
    // Remaining elements are the actual vibration pattern
    expect(pattern.slice(2)).toEqual(HAPTIC_DOUBLE_PULSE_PATTERN)
  })
})
describe('cancelHaptic', () => {
  it('calls navigator.vibrate(0) to clear a pending pattern', () => {
    const vibrate = vi.fn(() => true)
    vi.stubGlobal('navigator', { vibrate })
    expect(cancelHaptic()).toBe(true)
    expect(vibrate).toHaveBeenCalledWith(0)
  })

  it('no-ops when navigator.vibrate is absent', () => {
    vi.stubGlobal('navigator', {})
    expect(cancelHaptic()).toBe(false)
  })
})
