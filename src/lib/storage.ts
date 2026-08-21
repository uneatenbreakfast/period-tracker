import type { DayEntry, FlowLevel, Snapshot } from '../types'
import { addDays, isValidISO, todayISO } from './dates'
import { DEFAULT_SETTINGS, sanitizeSettings } from './settings'

export const SNAPSHOT_VERSION = 1 as const
const STORAGE_KEY = 'bloom.snapshot.v1'

/** Storage abstraction — web uses localStorage; RN can adapt to MMKV later. */
export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export function createEmptySnapshot(): Snapshot {
  return { version: SNAPSHOT_VERSION, entries: [], settings: { ...DEFAULT_SETTINGS }, updatedAt: todayISO() }
}

export function serializeSnapshot(snap: Snapshot): string {
  return JSON.stringify(snap)
}

export function parseSnapshot(raw: string): Snapshot | null {
  try {
    const parsed = JSON.parse(raw) as Snapshot
    if (parsed?.version !== SNAPSHOT_VERSION) return null
    if (!Array.isArray(parsed.entries)) return null
    const entries = parsed.entries.filter(
      (e) => e && typeof e.date === 'string' && isValidISO(e.date) && Array.isArray(e.symptoms),
    )
    entries.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    return {
      version: SNAPSHOT_VERSION,
      entries,
      // Legacy blobs (pre-BLOOM-0002) carry no settings → defaults.
      settings: sanitizeSettings(parsed.settings),
      updatedAt: parsed.updatedAt ?? todayISO(),
    }
  } catch {
    return null
  }
}

export function loadSnapshot(storage: StorageLike): Snapshot {
  const raw = storage.getItem(STORAGE_KEY)
  if (!raw) return createEmptySnapshot()
  return parseSnapshot(raw) ?? createEmptySnapshot()
}

export function saveSnapshot(snap: Snapshot, storage: StorageLike): void {
  const updated: Snapshot = { ...snap, updatedAt: todayISO() }
  storage.setItem(STORAGE_KEY, serializeSnapshot(updated))
}

/** Pure upsert — returns a new snapshot. Pass the result to saveSnapshot. */
export function upsertEntry(snap: Snapshot, entry: DayEntry): Snapshot {
  const others = snap.entries.filter((e) => e.date !== entry.date)
  const next = [...others, entry]
  next.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  return { ...snap, entries: next }
}

export function removeEntry(snap: Snapshot, date: string): Snapshot {
  return { ...snap, entries: snap.entries.filter((e) => e.date !== date) }
}

export function upsertReact(snap: Snapshot, date: string, patch: Partial<DayEntry>): Snapshot {
  const existing = snap.entries.find((e) => e.date === date)
  const base: DayEntry = existing ?? { date, symptoms: [] }
  return upsertEntry(snap, { ...base, ...patch, date })
}

/**
 * Mark every day in the inclusive [start, end] range as a period day.
 * Days that already have a flow keep it (per-day level wins over the range bulk).
 */
export function setRangeFlow(snap: Snapshot, start: string, end: string, flow: FlowLevel): Snapshot {
  let next = snap
  const [from, to] = start <= end ? [start, end] : [end, start]
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const existing = getEntry(next, d)
    next = upsertReact(next, d, { flow: existing?.flow ?? flow })
  }
  return next
}

/**
 * Replace the current period marking for the month(s) the range touches:
 * clears flow from every period-marked day in those months, then marks the
 * new range. Days keep their symptoms/notes; only pure flow days (no
 * symptoms, no notes) are removed entirely. A drag therefore means "my
 * period this month was exactly these days" — stale ranges disappear
 * instead of accumulating.
 */
export function replaceRangeFlow(snap: Snapshot, start: string, end: string, flow: FlowLevel): Snapshot {
  const [from, to] = start <= end ? [start, end] : [end, start]
  const months = new Set<string>()
  for (let d = from; d <= to; d = addDays(d, 1)) months.add(d.slice(0, 7))
  let next = snap
  for (const e of snap.entries) {
    if (e.flow === undefined) continue
    if (e.date >= from && e.date <= to) continue // inside the new range — keep
    if (!months.has(e.date.slice(0, 7))) continue // other months — keep
    const { flow: _flow, ...rest } = e
    next = e.symptoms.length === 0 && !e.notes ? removeEntry(next, e.date) : upsertEntry(next, rest)
  }
  return setRangeFlow(next, from, to, flow)
}

/** Clear flow from every day in the range. Pure flow days (no symptoms/notes)
 *  are removed entirely; days with other data keep their entry minus the flow. */
export function deleteRangeFlow(snap: Snapshot, start: string, end: string): Snapshot {
  const [from, to] = start <= end ? [start, end] : [end, start]
  let next = snap
  for (const e of snap.entries) {
    if (e.flow === undefined) continue
    if (e.date < from || e.date > to) continue
    if (e.symptoms.length === 0 && !e.notes) {
      next = removeEntry(next, e.date)
    } else {
      const { flow: _flow, ...rest } = e
      next = upsertEntry(next, rest)
    }
  }
  return next
}

export function getEntry(snap: Snapshot, date: string): DayEntry | undefined {
  return snap.entries.find((e) => e.date === date)
}

export function createLocalStorageAdapter(): StorageLike {
  return {
    getItem: (k) => window.localStorage.getItem(k),
    setItem: (k, v) => window.localStorage.setItem(k, v),
  }
}