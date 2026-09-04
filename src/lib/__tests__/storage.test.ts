import { describe, expect, it } from 'vitest'
import {
  captureClearedEntries,
  captureDeletedEntries,
  createEmptySnapshot,
  getEntry,
  loadSnapshot,
  parseSnapshot,
  removeEntry,
  replaceRangeFlow,
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

  it('createEmptySnapshot carries default settings (BLOOM-0002)', () => {
    expect(createEmptySnapshot().settings).toEqual({ cycleLength: 28, periodLength: 5 })
  })

  it('parseSnapshot defaults settings when missing (legacy blobs)', () => {
    const raw = JSON.stringify({ version: 1, entries: [], updatedAt: '2026-01-01' })
    const parsed = parseSnapshot(raw)
    expect(parsed?.settings).toEqual({ cycleLength: 28, periodLength: 5 })
  })

  it('parseSnapshot keeps valid custom settings, clamps garbage', () => {
    const good = parseSnapshot(
      JSON.stringify({ version: 1, entries: [], settings: { cycleLength: 32, periodLength: 4 } }),
    )
    expect(good?.settings).toEqual({ cycleLength: 32, periodLength: 4 })
    const bad = parseSnapshot(
      JSON.stringify({ version: 1, entries: [], settings: { cycleLength: 999, periodLength: -2 } }),
    )
    expect(bad?.settings).toEqual({ cycleLength: 60, periodLength: 1 }) // clamped to limits
  })

  it('custom settings survive the save → load round-trip', () => {
    const storage = memoryStorage()
    const s = { ...createEmptySnapshot(), settings: { cycleLength: 34, periodLength: 6 } }
    saveSnapshot(s, storage)
    expect(loadSnapshot(storage).settings).toEqual({ cycleLength: 34, periodLength: 6 })
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

  it('replaceRangeFlow clears a previously marked range in the same month', () => {
    const s = setRangeFlow(createEmptySnapshot(), '2026-01-03', '2026-01-05', 'medium')
    const a = replaceRangeFlow(s, '2026-01-10', '2026-01-12', 'medium')
    // old range gone, new range present
    expect(a.entries.map((e) => e.date)).toEqual(['2026-01-10', '2026-01-11', '2026-01-12'])
    expect(a.entries.every((e) => e.flow === 'medium')).toBe(true)
  })

  it('replaceRangeFlow keeps symptoms/notes on days it unmarks', () => {
    const s = upsertEntry(createEmptySnapshot(), {
      date: '2026-01-04',
      flow: 'light',
      symptoms: ['cramps'],
      notes: 'bad day',
    })
    const a = replaceRangeFlow(s, '2026-01-10', '2026-01-12', 'medium')
    expect(getEntry(a, '2026-01-04')).toEqual({ date: '2026-01-04', symptoms: ['cramps'], notes: 'bad day' })
  })

  it('replaceRangeFlow leaves other months untouched', () => {
    const feb = setRangeFlow(createEmptySnapshot(), '2026-02-01', '2026-02-03', 'light')
    const a = replaceRangeFlow(feb, '2026-01-10', '2026-01-12', 'medium')
    expect(getEntry(a, '2026-02-01')?.flow).toBe('light')
    expect(getEntry(a, '2026-02-03')?.flow).toBe('light')
  })

  it('replaceRangeFlow crossing a month boundary clears both touched months', () => {
    const s = setRangeFlow(setRangeFlow(createEmptySnapshot(), '2026-01-28', '2026-01-29', 'light'), '2026-02-01', '2026-02-02', 'medium')
    const a = replaceRangeFlow(s, '2026-01-30', '2026-02-02', 'heavy')
    // Jan 28-29 (old month range) cleared; Feb 1-2 inside the new range keep per-day flow
    expect(a.entries.map((e) => e.date)).toEqual(['2026-01-30', '2026-01-31', '2026-02-01', '2026-02-02'])
    expect(getEntry(a, '2026-01-30')?.flow).toBe('heavy')
    expect(getEntry(a, '2026-01-31')?.flow).toBe('heavy')
    expect(getEntry(a, '2026-02-01')?.flow).toBe('medium')
    expect(getEntry(a, '2026-02-02')?.flow).toBe('medium')
  })

  it('replaceRangeFlow preserves a per-day flow inside the new range', () => {
    const s = upsertEntry(createEmptySnapshot(), { date: '2026-01-11', flow: 'heavy', symptoms: [] })
    // day 11 has flow but sits inside the new range — untouched by the clear pass
    const a = replaceRangeFlow(s, '2026-01-10', '2026-01-12', 'medium')
    expect(getEntry(a, '2026-01-11')?.flow).toBe('heavy')
    expect(getEntry(a, '2026-01-10')?.flow).toBe('medium')
    expect(getEntry(a, '2026-01-12')?.flow).toBe('medium')
  })

  it('replaceRangeFlow is order-agnostic', () => {
    const s = setRangeFlow(createEmptySnapshot(), '2026-01-03', '2026-01-05', 'medium')
    const a = replaceRangeFlow(s, '2026-01-12', '2026-01-10', 'light')
    expect(a.entries.map((e) => e.date)).toEqual(['2026-01-10', '2026-01-11', '2026-01-12'])
    expect(a.entries.every((e) => e.flow === 'light')).toBe(true)
  })
})

describe('undo capture helpers', () => {
  it('captureClearedEntries returns entries that replaceRangeFlow would clear', () => {
    // Jan 5 has flow outside the new range but in same month → captured
    // Jan 11 is inside the new range → NOT captured (kept by replace)
    // Feb 1 is in a different month → NOT captured
    const s = setRangeFlow(
      upsertEntry(createEmptySnapshot(), { date: '2026-02-01', flow: 'light', symptoms: [] }),
      '2026-01-05', '2026-01-05', 'medium',
    )
    const withJan11 = upsertEntry(s, { date: '2026-01-11', flow: 'heavy', symptoms: [] })
    const cleared = captureClearedEntries(withJan11, '2026-01-10', '2026-01-12')
    expect(cleared).toHaveLength(1)
    expect(cleared[0].date).toBe('2026-01-05')
    expect(cleared[0].flow).toBe('medium')
  })

  it('captureClearedEntries returns empty when no entries would be cleared', () => {
    const s = createEmptySnapshot()
    expect(captureClearedEntries(s, '2026-01-10', '2026-01-12')).toEqual([])
  })

  it('captureClearedEntries matches replaceRangeFlow behavior exactly', () => {
    // Build a snapshot with entries across two months
    let s = createEmptySnapshot()
    s = upsertEntry(s, { date: '2026-01-03', flow: 'light', symptoms: ['cramps'] })
    s = upsertEntry(s, { date: '2026-01-05', flow: 'medium', symptoms: [] })
    s = upsertEntry(s, { date: '2026-01-15', flow: 'heavy', symptoms: [], notes: 'test' })
    s = upsertEntry(s, { date: '2026-02-01', flow: 'light', symptoms: [] })

    const cleared = captureClearedEntries(s, '2026-01-10', '2026-01-12')
    const after = replaceRangeFlow(s, '2026-01-10', '2026-01-12', 'medium')

    // Every captured entry should be gone (or modified) in the result
    for (const c of cleared) {
      const entry = getEntry(after, c.date)
      // Either removed entirely or had flow stripped
      if (entry) expect(entry.flow).toBeUndefined()
    }
    // Entries NOT captured should still have their flow
    expect(getEntry(after, '2026-02-01')?.flow).toBe('light')
  })

  it('captureDeletedEntries returns all flow entries in range', () => {
    let s = createEmptySnapshot()
    s = upsertEntry(s, { date: '2026-01-10', flow: 'medium', symptoms: [] })
    s = upsertEntry(s, { date: '2026-01-11', flow: 'heavy', symptoms: ['cramps'], notes: 'bad' })
    s = upsertEntry(s, { date: '2026-01-13', flow: 'light', symptoms: [] })
    // Outside range
    s = upsertEntry(s, { date: '2026-01-15', flow: 'medium', symptoms: [] })

    const deleted = captureDeletedEntries(s, '2026-01-10', '2026-01-12')
    expect(deleted).toHaveLength(2)
    const dates = deleted.map((e) => e.date).sort()
    expect(dates).toEqual(['2026-01-10', '2026-01-11'])
  })

  it('captureDeletedEntries includes entries with symptoms/notes (partial clear)', () => {
    // These entries won't be fully removed by deleteRangeFlow (symptoms kept),
    // but they ARE affected — undo needs to restore their flow.
    const s = upsertEntry(createEmptySnapshot(), {
      date: '2026-01-10', flow: 'medium', symptoms: ['cramps'], notes: 'ouch',
    })
    const deleted = captureDeletedEntries(s, '2026-01-10', '2026-01-10')
    expect(deleted).toHaveLength(1)
    expect(deleted[0].flow).toBe('medium')
    expect(deleted[0].symptoms).toEqual(['cramps'])
  })

  it('captureDeletedEntries is order-agnostic', () => {
    const s = upsertEntry(createEmptySnapshot(), { date: '2026-01-12', flow: 'medium', symptoms: [] })
    const a = captureDeletedEntries(s, '2026-01-12', '2026-01-10')
    const b = captureDeletedEntries(s, '2026-01-10', '2026-01-12')
    expect(a).toEqual(b)
  })
})
