export type FlowLevel = 'spotting' | 'light' | 'medium' | 'heavy'

export interface DayEntry {
  /** Local date as YYYY-MM-DD */
  date: string
  flow?: FlowLevel
  symptoms: string[]
  notes?: string
}

/** User-customizable calendar colors (BLOOM-0022) — lowercase #rrggbb hex. */
export interface CalendarStyle {
  /** Period days fill (cells + legend swatch). */
  period: string
  /** Predicted period — dashed outline + day text. */
  predicted: string
  /** Fertile window days fill. */
  fertile: string
  /** Ovulation day dot. */
  ovulation: string
  /** Safe days fill. */
  safe: string
}

/** User-customizable prediction defaults (BLOOM-0002). */
export interface Settings {
  /** Fallback cycle length (days): seeds predictions until 2+ completed cycles are logged. */
  cycleLength: number
  /** Fallback period length (days): used when no cycle data exists. */
  periodLength: number
  /** Show safe days (post-fertile luteal phase) on the calendar. */
  showSafeDays: boolean
  /** Calendar + legend colors (BLOOM-0022). */
  style: CalendarStyle
}

/** Versioned blob — the whole app state. Serializes to one JSON string (sync-ready). */
export interface Snapshot {
  version: 1
  /** Sorted ascending by date */
  entries: DayEntry[]
  /** Prediction defaults — user-settable on the Settings tab. */
  settings: Settings
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
  /** Recency-weighted avg (Fitbit default 28 until 2+ cycles). Never null. */
  avgCycleLength: number
}