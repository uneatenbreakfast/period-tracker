import type { DayEntry, FlowLevel, Snapshot } from '../types'
import { addDays, isValidISO, todayISO } from './dates'

export const SNAPSHOT_VERSION = 1 as const
const STORAGE_KEY = 'bloom.snapshot.v1'

/** Storage abstraction — web uses localStorage; RN can adapt to MMKV later. */
export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export function createEmptySnapshot(): Snapshot {
  return { version: SNAPSHOT_VERSION, entries: [], updatedAt: todayISO() }
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
    return { version: SNAPSHOT_VERSION, entries, updatedAt: parsed.updatedAt ?? todayISO() }
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

export function getEntry(snap: Snapshot, date: string): DayEntry | undefined {
  return snap.entries.find((e) => e.date === date)
}

/**
 * Mark every day between `from` and `to` (inclusive, order-independent) as a
 * period day with the given flow. Existing symptoms/notes on those days are
 * kept (upsert merge). Returns a new snapshot.
 */
export function applyFlowRange(snap: Snapshot, from: string, to: string, flow: FlowLevel): Snapshot {
  const [a, b] = from <= to ? [from, to] : [to, from]
  let next = snap
  for (let d = a; d <= b; d = addDays(d, 1)) {
    next = upsertReact(next, d, { flow })
  }
  return next
}

export function createLocalStorageAdapter(): StorageLike {
  return {
    getItem: (k) => window.localStorage.getItem(k),
    setItem: (k, v) => window.localStorage.setItem(k, v),
  }
}