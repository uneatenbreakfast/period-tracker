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
export const HAPTIC_PULSE_MS = 15

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
 *
 * IMPORTANT: navigator.vibrate() must be called from a direct user-gesture
 * handler (pointerdown, click, etc.) to work on modern Chrome Android.
 * Calling it from a setTimeout callback loses "transient activation" and
 * silently no-ops.  Use `hapticLongPress()` from pointerdown when you need
 * a delayed pulse — it embeds the delay in the pattern itself.
 */
export function hapticPulse(pattern: number | number[] = HAPTIC_DOUBLE_PULSE_PATTERN): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return false
  return navigator.vibrate(pattern)
}

/**
 * Vibrate after a delay, fired from a user-gesture handler so the call
 * retains transient-activation context.  The delay is encoded as the first
 * element of the vibration pattern (odd indices = pause in ms).
 *
 * @param delayMs  How long to wait before the pulse (default: LONG_PRESS_MS)
 * @param pattern  Vibration pattern after the initial pause
 */
export function hapticLongPress(
  delayMs: number,
  pattern: number[] = HAPTIC_DOUBLE_PULSE_PATTERN,
): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return false
  return navigator.vibrate([delayMs, ...pattern])
}

/**
 * Cancel any pending/in-progress vibration (navigator.vibrate(0)). Call when
 * a gesture that scheduled a delayed pulse is aborted before the delay
 * elapses — otherwise the queued pattern still fires (a scroll or quick tap
 * would buzz LONG_PRESS_MS later).
 */
export function cancelHaptic(): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return false
  return navigator.vibrate(0)
}