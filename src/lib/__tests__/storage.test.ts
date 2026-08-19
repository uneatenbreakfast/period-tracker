import { describe, expect, it } from 'vitest'
import {
  createEmptySnapshot,
  getEntry,
  loadSnapshot,
  parseSnapshot,
  removeEntry,
  saveSnapshot,
  serializeSnapshot,
  setRangeFlow,
  upsertEntry,
  upsertReact,
} from '../storage'
import type { StorageLike } from '../storage'

function memoryStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
  }
}

describe('snapshot lifecycle', () => {
  it('createEmptySnapshot → versioned, empty, sorted-safe', () => {
    const s = createEmptySnapshot()
    expect(s.version).toBe(1)
    expect(s.entries).toEqual([])
    expect(typeof s.updatedAt).toBe('string')
  })

  it('save → load round-trips through any StorageLike', () => {
    const storage = memoryStorage()
    const s = createEmptySnapshot()
    const withEntry = upsertEntry(s, { date: '2026-01-05', flow: 'heavy', symptoms: ['cramps'], notes: 'bad' })
    saveSnapshot(withEntry, storage)
    const loaded = loadSnapshot(storage)
    expect(loaded.entries).toHaveLength(1)
    expect(loaded.entries[0]).toEqual({ date: '2026-01-05', flow: 'heavy', symptoms: ['cramps'], notes: 'bad' })
  })

  it('load with no data → empty snapshot', () => {
    expect(loadSnapshot(memoryStorage())).toEqual(createEmptySnapshot())
  })

  it('load with corrupted JSON → empty snapshot', () => {
    const storage = memoryStorage()
    storage.setItem('bloom.snapshot.v1', 'not json {{{')
    expect(loadSnapshot(storage).entries).toEqual([])
  })

  it('load with wrong version → empty snapshot (future-migration-safe)', () => {
    const storage = memoryStorage()
    storage.setItem('bloom.snapshot.v1', JSON.stringify({ version: 2, entries: [] }))
    expect(loadSnapshot(storage).entries).toEqual([])
  })

  it('parseSnapshot filters invalid entries, keeps valid, sorts', () => {
    const raw = JSON.stringify({
      version: 1,
      entries: [
        { date: '2026-03-01', symptoms: ['cramps'] },
        { date: 'not-a-date', symptoms: [] },
        { date: '2026-01-01', symptoms: [] },
        { date: null, symptoms: [] },
      ],
    })
    const parsed = parseSnapshot(raw)
    expect(parsed?.entries.map((e) => e.date)).toEqual(['2026-01-01', '2026-03-01'])
  })
})

describe('entry mutations (pure)', () => {
  it('upsertEntry replaces same-date entry and sorts', () => {
    const s = createEmptySnapshot()
    const a = upsertEntry(s, { date: '2026-02-01', symptoms: [] })
    const b = upsertEntry(a, { date: '2026-01-01', symptoms: ['cramps'] })
    const c = upsertEntry(b, { date: '2026-02-01', flow: 'light', symptoms: [] })
    expect(c.entries.map((e) => e.date)).toEqual(['2026-01-01', '2026-02-01'])
    expect(c.entries[1].flow).toBe('light')
    expect(c.entries[1].symptoms).toEqual([])
  })

  it('upsertReact merges patch into existing entry', () => {
    const s = createEmptySnapshot()
    const a = upsertEntry(s, { date: '2026-01-10', flow: 'medium', symptoms: ['cramps'] })
    const b = upsertReact(a, '2026-01-10', { symptoms: ['cramps', 'headache'] })
    const e = getEntry(b, '2026-01-10')
    expect(e?.flow).toBe('medium') // untouched
    expect(e?.symptoms).toEqual(['cramps', 'headache'])
  })

  it('upsertReact with empty patch still creates a symptoms-only entry', () => {
    const b = upsertReact(createEmptySnapshot(), '2026-01-10', { symptoms: ['acne'] })
    expect(getEntry(b, '2026-01-10')).toEqual({ date: '2026-01-10', symptoms: ['acne'] })
  })

  it('removeEntry deletes only the target date', () => {
    const s = createEmptySnapshot()
    const a = upsertEntry(s, { date: '2026-01-01', symptoms: [] })
    const b = upsertEntry(a, { date: '2026-01-02', symptoms: [] })
    const c = removeEntry(b, '2026-01-01')
    expect(c.entries.map((e) => e.date)).toEqual(['2026-01-02'])
  })

  it('serializeSnapshot → one JSON blob (sync-ready)', () => {
    const s = upsertEntry(createEmptySnapshot(), { date: '2026-01-01', flow: 'medium', symptoms: ['cramps'] })
    const blob = serializeSnapshot(s)
    expect(typeof blob).toBe('string')
    expect(parseSnapshot(blob)?.entries).toEqual(s.entries)
  })

  it('setRangeFlow marks every day in range, order-agnostic', () => {
    const s = createEmptySnapshot()
    const a = setRangeFlow(s, '2026-01-03', '2026-01-05', 'medium')
    expect(a.entries.map((e) => e.date)).toEqual(['2026-01-03', '2026-01-04', '2026-01-05'])
    expect(a.entries.every((e) => e.flow === 'medium')).toBe(true)
    const b = setRangeFlow(s, '2026-01-05', '2026-01-03', 'light')
    expect(b.entries.map((e) => e.date)).toEqual(['2026-01-03', '2026-01-04', '2026-01-05'])
    expect(b.entries.every((e) => e.flow === 'light')).toBe(true)
  })

  it('setRangeFlow keeps an existing per-day flow level', () => {
    const s = upsertEntry(createEmptySnapshot(), { date: '2026-01-04', flow: 'heavy', symptoms: ['cramps'], notes: 'bad day' })
    const a = setRangeFlow(s, '2026-01-03', '2026-01-05', 'medium')
    expect(getEntry(a, '2026-01-04')).toEqual({ date: '2026-01-04', flow: 'heavy', symptoms: ['cramps'], notes: 'bad day' })
    expect(getEntry(a, '2026-01-03')?.flow).toBe('medium')
    expect(getEntry(a, '2026-01-05')?.flow).toBe('medium')
  })

  it('setRangeFlow crosses month boundaries and leaves outside days alone', () => {
    const s = createEmptySnapshot()
    const a = setRangeFlow(s, '2026-01-30', '2026-02-02', 'light')
    expect(a.entries.map((e) => e.date)).toEqual(['2026-01-30', '2026-01-31', '2026-02-01', '2026-02-02'])
    const withOutside = setRangeFlow(upsertEntry(s, { date: '2026-01-10', symptoms: [] }), '2026-01-03', '2026-01-05', 'medium')
    expect(getEntry(withOutside, '2026-01-10')).toEqual({ date: '2026-01-10', symptoms: [] })
  })
})