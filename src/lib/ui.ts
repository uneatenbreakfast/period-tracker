import type { DayEntry, Prediction, Snapshot } from '../types'
import { FLOW_LEVELS, SYMPTOMS, symptomLabel } from './symptoms'
import { averageCycleLength, cycleLengths, detectCycles } from './cycle'

/** Valid symptom keys for an entry, in catalog order. */
export function orderedSymptomKeys(entry: DayEntry | undefined): string[] {
  if (!entry) return []
  return SYMPTOMS.map((s) => s.key).filter((k) => entry.symptoms.includes(k))
}

/** Past cycle rows for the stats panel. Cycle 1 has no length (no prior start). */
export function cycleHistoryRows(snapshot: Snapshot): {
  label: string
  startLabel: string
  cycleLength: number | null
}[] {
  const cycles = detectCycles(snapshot.entries)
  const lens = cycleLengths(cycles)
  return cycles.map((c, i) => ({
    label: `Cycle ${i + 1}`,
    startLabel: formatShort(c.start),
    cycleLength: lens[i - 1] ?? null,
  }))
}

export function formatShort(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${Number(m)}/${Number(d)}`
}

export function predictionSummary(pred: Prediction, entryCount: number): string {
  if (entryCount === 0) return 'Log your first period day to start predictions'
  if (pred.nextPeriodStart === null) return 'Log one more cycle to predict your next period'
  return `Next period ${formatShort(pred.nextPeriodStart)} (${pred.daysUntil} day${pred.daysUntil === 1 ? '' : 's'} away)`
}

export { FLOW_LEVELS, SYMPTOMS, symptomLabel, averageCycleLength }