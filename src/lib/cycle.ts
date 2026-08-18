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

/** Fitbit defaults when data is thin: 28-day cycle, 5-day period. */
export const DEFAULT_CYCLE_LENGTH = 28
export const DEFAULT_PERIOD_LENGTH = 5

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

/**
 * Recency-weighted mean of completed start-to-start cycle lengths (Fitbit
 * model: predictions "rely on recent data"; after a logging gap it takes a
 * few cycles to catch up). Linear weights — oldest cycle counts once, newest
 * counts n times. Fitbit's exact weights are proprietary; linear approximates
 * the documented recency emphasis. Falls back to DEFAULT_CYCLE_LENGTH (28)
 * when fewer than two cycles are logged — Fitbit's default starting point.
 * Never null.
 */
export function averageCycleLength(cycles: CycleEvent[]): number {
  const lens = cycleLengths(cycles)
  if (lens.length === 0) return DEFAULT_CYCLE_LENGTH
  let weightSum = 0
  let weightedSum = 0
  lens.forEach((len, i) => {
    const w = i + 1 // recency weight: oldest = 1, newest = lens.length
    weightSum += w
    weightedSum += len * w
  })
  return Math.round(weightedSum / weightSum)
}

/** Average period span (days between first and last period day, inclusive). */
export function averagePeriodLength(cycles: CycleEvent[]): number | null {
  if (cycles.length === 0) return DEFAULT_PERIOD_LENGTH
  return Math.round(cycles.reduce((sum, c) => sum + c.length, 0) / cycles.length)
}

/** One row of the trends/cycles list. Oldest first (same order as detectCycles). */
export interface CycleTrendRow {
  /** First logged period day of the cycle */
  start: string
  /** Display span end (inclusive): start + cycleLength − 1; last period day when cycleLength is null */
  end: string
  /** Period span in days (first to last logged period day, inclusive) */
  periodLength: number
  /** 1-based day index of estimated ovulation within the cycle; null when no prediction */
  ovulationDay: number | null
  /** Start-to-start length; the latest cycle uses the average (prediction); null for a single cycle */
  cycleLength: number | null
  /** Predicted/actual next period start (start + cycleLength); null when no prediction */
  nextStart: string | null
  /** Fertile window around ovulation (calendar method); null when no prediction */
  fertileWindow: { start: string; end: string } | null
}

export interface CycleTrendStats {
  avgPeriodLength: number | null
  avgOvulationDay: number | null
  avgCycleLength: number | null
}

/**
 * Rows + averages for the trends screen. For the latest cycle there is no
 * actual next start yet, so its length (and the row's span end + ovulation)
 * come from the average prediction — mirrors predictNext.
 */
export function cycleTrends(entries: DayEntry[]): { rows: CycleTrendRow[]; stats: CycleTrendStats } {
  const cycles = detectCycles(entries)
  const empty: CycleTrendStats = { avgPeriodLength: null, avgOvulationDay: null, avgCycleLength: null }
  if (cycles.length === 0) return { rows: [], stats: empty }

  const lens = cycleLengths(cycles)
  const avg = averageCycleLength(cycles) // Fitbit default 28 until 2+ cycles
  const rows: CycleTrendRow[] = cycles.map((c, i) => {
    const cycleLength = i < lens.length ? lens[i] : avg
    const nextStart = cycleLength === null ? null : addDays(c.start, cycleLength)
    const ovulationDay =
      nextStart === null ? null : diffDays(addDays(nextStart, -LUTEAL_PHASE_DAYS), c.start) + 1
    const end = nextStart === null ? c.end : addDays(nextStart, -1)
    const fertileWindow =
      nextStart === null
        ? null
        : {
            start: addDays(nextStart, -LUTEAL_PHASE_DAYS - FERTILE_RANGE.before),
            end: addDays(nextStart, -LUTEAL_PHASE_DAYS + FERTILE_RANGE.after),
          }
    return { start: c.start, end, periodLength: c.length, ovulationDay, cycleLength, nextStart, fertileWindow }
  })

  const ovulationDays = rows
    .map((r) => r.ovulationDay)
    .filter((d): d is number => d !== null)
  return {
    rows,
    stats: {
      avgPeriodLength: averagePeriodLength(cycles),
      avgOvulationDay:
        ovulationDays.length === 0
          ? null
          : Math.round(ovulationDays.reduce((a, b) => a + b, 0) / ovulationDays.length),
      avgCycleLength: avg,
    },
  }
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
  if (!last) return empty

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
 * cycle start and the average cycle length (Fitbit default 28 until 2+
 * cycles). Day position wraps: on the predicted next period start, dayInCycle
 * returns to 0 — exactly where the ring's period segment begins. Null only
 * when no period has ever been logged (no anchor).
 */
export function cycleDayInfo(entries: DayEntry[], today: string): CycleDayInfo | null {
  const cycles = detectCycles(entries)
  const last = cycles[cycles.length - 1] ?? null
  const avg = averageCycleLength(cycles)
  if (!last) return null

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