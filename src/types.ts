export type FlowLevel = 'spotting' | 'light' | 'medium' | 'heavy'

export interface DayEntry {
  /** Local date as YYYY-MM-DD */
  date: string
  flow?: FlowLevel
  symptoms: string[]
  notes?: string
}

/** Versioned blob — the whole app state. Serializes to one JSON string (sync-ready). */
export interface Snapshot {
  version: 1
  /** Sorted ascending by date */
  entries: DayEntry[]
  updatedAt: string
}

export interface CycleEvent {
  start: string
  end: string
  /** All period days of this cycle, ascending */
  days: string[]
  /** days between first and last period day, inclusive */
  length: number
}

export interface Prediction {
  /** Predicted next period start (YYYY-MM-DD) */
  nextPeriodStart: string | null
  daysUntil: number | null
  ovulationDay: string | null
  fertileWindow: { start: string; end: string } | null
  avgCycleLength: number | null
}