/**
 * Tactile feedback helpers.
 *
 * `navigator.vibrate` drives the phone's vibration motor (Android
 * Chrome/Firefox). iOS Safari and most desktop browsers either lack the API
 * or have no vibrator, so every call site feature-detects once, inside the
 * helper, and stays a no-op elsewhere. The navigator lookup happens at call
 * time, which keeps the helper unit-testable via a stubbed global.
 */
/** Single vibration burst length (ms) — short enough to read as a tick. */
export const HAPTIC_PULSE_MS = 30

/**
 * Default feedback: a double pulse — two 30ms bursts separated by a 30ms
 * pause — so it reads as one distinct confirmation, not a UI tap.
 * Pattern semantics: even indices vibrate, odd indices pause.
 */
export const HAPTIC_DOUBLE_PULSE_PATTERN: number[] = [
  HAPTIC_PULSE_MS,
  HAPTIC_PULSE_MS,
  HAPTIC_PULSE_MS,
]

/**
 * Fire a vibration pattern (default: short double pulse). Returns whether
 * the platform honored it (false on devices without a vibrator — callers
 * use it as a pure side effect and must not depend on the return value).
 */
export function hapticPulse(pattern: number | number[] = HAPTIC_DOUBLE_PULSE_PATTERN): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return false
  return navigator.vibrate(pattern)
}