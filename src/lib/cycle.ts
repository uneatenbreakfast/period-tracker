import type { CycleEvent, DayEntry, Prediction } from '../types'
import { addDays, diffDays, todayISO } from './dates'

/**
 * A gap of more than this many days between logged period days starts a new
 * cycle event (mid-period spotting breaks are usually 1-3 days).
 */
export const CYCLE_GAP_THRESHOLD_DAYS = 3

/** Typical ovulation offset before the next period start (luteal phase). */
export const LUTEAL_PHASE_DAYS = 14

/** Sperm survival + egg viability window around ovulation (calendar method). */
export const FERTILE_RANGE = { before: 5, after: 1 } as const

export function isPeriodDay(d: DayEntry): boolean {
  return d.flow !== undefined && d.flow !== null
}

/** Group period days into cycle events. Days must carry flow. Sorted ascending. */
export function detectCycles(entries: DayEntry[]): CycleEvent[] {
  const periodDays = entries
    .filter(isPeriodDay)
    .map((e) => e.date)
    .sort()
  if (periodDays.length === 0) return []

  const cycles: CycleEvent[] = []
  let current: string[] = [periodDays[0]]
  for (let i = 1; i < periodDays.length; i++) {
    const gap = diffDays(periodDays[i], periodDays[i - 1])
    if (gap > CYCLE_GAP_THRESHOLD_DAYS) {
      cycles.push(makeCycle(current))
      current = [periodDays[i]]
    } else {
      current.push(periodDays[i])
    }
  }
  cycles.push(makeCycle(current))
  return cycles
}

function makeCycle(days: string[]): CycleEvent {
  return {
    start: days[0],
    end: days[days.length - 1],
    days,
    length: diffDays(days[days.length - 1], days[0]) + 1,
  }
}

/** Full cycle lengths (start-to-start) from consecutive completed cycles. */
export function cycleLengths(cycles: CycleEvent[]): number[] {
  const lengths: number[] = []
  for (let i = 1; i < cycles.length; i++) {
    lengths.push(diffDays(cycles[i].start, cycles[i - 1].start))
  }
  return lengths
}

export function averageCycleLength(cycles: CycleEvent[]): number | null {
  const lens = cycleLengths(cycles)
  if (lens.length === 0) return null
  return Math.round(lens.reduce((a, b) => a + b, 0) / lens.length)
}

export function predictNext(entries: DayEntry[]): Prediction {
  const cycles = detectCycles(entries)
  const avg = averageCycleLength(cycles)
  const last = cycles[cycles.length - 1] ?? null
  const empty: Prediction = {
    nextPeriodStart: null,
    daysUntil: null,
    ovulationDay: null,
    fertileWindow: null,
    avgCycleLength: avg,
  }
  if (!last || avg === null) return empty

  const nextStart = addDays(last.start, avg)
  const today = todayISO()
  const ovulationDay = addDays(nextStart, -LUTEAL_PHASE_DAYS)
  return {
    nextPeriodStart: nextStart,
    daysUntil: Math.max(0, diffDays(nextStart, today)),
    ovulationDay,
    fertileWindow: {
      start: addDays(ovulationDay, -FERTILE_RANGE.before),
      end: addDays(ovulationDay, FERTILE_RANGE.after),
    },
    avgCycleLength: avg,
  }
}

export type CyclePhase = 'period' | 'follicular' | 'ovulation' | 'luteal'

/** One ring segment: half-open day range [start, end) within a cycle. */
export interface CycleRingSegment {
  phase: CyclePhase
  start: number
  end: number
}

/** Where `today` sits in the current cycle, for the Fitbit-style ring. */
export interface CycleDayInfo {
  /** 0-based day within the cycle (0 = first period day), wrapped mod cycle length */
  dayInCycle: number
  cycleLength: number
  /** Segments covering [0, cycleLength) in order. Zero-length segments possible. */
  segments: CycleRingSegment[]
  phase: CyclePhase
}

/**
 * Position of a date within the current cycle, relative to the last logged
 * cycle start and the average cycle length. Null when fewer than two cycles
 * are logged (no prediction). Day position wraps: on the predicted next
 * period start, dayInCycle returns to 0 — exactly where the ring's period
 * segment begins.
 */
export function cycleDayInfo(entries: DayEntry[], today: string): CycleDayInfo | null {
  const cycles = detectCycles(entries)
  const last = cycles[cycles.length - 1] ?? null
  const avg = averageCycleLength(cycles)
  if (!last || avg === null) return null

  const pred = predictNext(entries)
  if (!pred.fertileWindow || pred.ovulationDay === null) return null

  const cycleLength = avg
  const clamp = (n: number) => Math.max(0, Math.min(n, cycleLength))

  const periodEnd = clamp(last.length)
  const fertileStart = clamp(diffDays(pred.fertileWindow.start, last.start))
  const fertileEnd = clamp(diffDays(pred.fertileWindow.end, last.start) + 1) // inclusive → exclusive

  const segments: CycleRingSegment[] = [
    { phase: 'period', start: 0, end: periodEnd },
    { phase: 'follicular', start: periodEnd, end: Math.max(periodEnd, fertileStart) },
    { phase: 'ovulation', start: Math.max(periodEnd, fertileStart), end: Math.max(periodEnd, fertileStart, fertileEnd) },
    { phase: 'luteal', start: Math.max(periodEnd, fertileStart, fertileEnd), end: cycleLength },
  ]

  const raw = diffDays(today, last.start)
  const dayInCycle = ((raw % cycleLength) + cycleLength) % cycleLength
  const phase =
    segments.find((s) => dayInCycle >= s.start && dayInCycle < s.end)?.phase ?? 'luteal'

  return { dayInCycle, cycleLength, segments, phase }
}