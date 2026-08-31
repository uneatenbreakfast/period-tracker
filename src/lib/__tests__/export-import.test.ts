import { describe, expect, it } from 'vitest'
import { createEmptySnapshot, parseSnapshot, serializeSnapshot } from '../storage'
import { DEFAULT_SETTINGS } from '../settings'

describe('export/import', () => {
  it('serializes empty snapshot to valid JSON', () => {
    const snap = createEmptySnapshot()
    const json = serializeSnapshot(snap)
    expect(() => JSON.parse(json)).not.toThrow()
  })

  it('round-trips snapshot through serialize/parse', () => {
    const snap = createEmptySnapshot()
    snap.entries.push(
      { date: '2026-08-01', flow: 'medium', symptoms: ['cramps'] },
      { date: '2026-08-02', flow: 'light', symptoms: [] },
    )
    snap.settings.cycleLength = 30
    const json = serializeSnapshot(snap)
    const parsed = parseSnapshot(json)
    expect(parsed).not.toBeNull()
    expect(parsed!.entries).toHaveLength(2)
    expect(parsed!.entries[0].flow).toBe('medium')
    expect(parsed!.settings.cycleLength).toBe(30)
  })

  it('rejects invalid JSON', () => {
    expect(parseSnapshot('not json')).toBeNull()
  })

  it('rejects snapshot with wrong version', () => {
    const bad = { version: 999, entries: [], settings: DEFAULT_SETTINGS, updatedAt: '2026-08-01' }
    expect(parseSnapshot(JSON.stringify(bad))).toBeNull()
  })

  it('filters invalid entries during parse', () => {
    const snap = {
      version: 1,
      entries: [
        { date: '2026-08-01', symptoms: [] },
        { date: 'invalid-date', symptoms: [] },
        { date: '2026-08-02' }, // missing symptoms
      ],
      settings: DEFAULT_SETTINGS,
      updatedAt: '2026-08-01',
    }
    const parsed = parseSnapshot(JSON.stringify(snap))
    expect(parsed).not.toBeNull()
    expect(parsed!.entries).toHaveLength(1)
    expect(parsed!.entries[0].date).toBe('2026-08-01')
  })
})
