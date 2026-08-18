import type { DayEntry, Snapshot } from '../types'
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

const MONTH_ABBREV = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "21 Jul" — day + short month, for trends cycle rows. */
export function formatDayShort(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${Number(d)} ${MONTH_ABBREV[Number(m) - 1]}`
}

/** "21 Jul - 15 Aug" — inclusive span, for trends cycle rows. */
export function formatRange(start: string, end: string): string {
  return `${formatDayShort(start)} - ${formatDayShort(end)}`
}

/** English ordinal suffix: 1st, 2nd, 3rd, 11th, 21st… */
export function ordinal(n: number): string {
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`
  switch (n % 10) {
    case 1:
      return `${n}st`
    case 2:
      return `${n}nd`
    case 3:
      return `${n}rd`
    default:
      return `${n}th`
  }
}

export { FLOW_LEVELS, SYMPTOMS, symptomLabel, averageCycleLength }