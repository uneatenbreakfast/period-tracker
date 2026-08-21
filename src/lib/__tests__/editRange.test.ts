import { describe, expect, it } from 'vitest'
import { beginEdit, commitEdit, deleteRange, moveEnd, moveStart, runBoundsAt } from '../editRange'

describe('editRange runBoundsAt', () => {
  // Fresh fixture per test — runBoundsAt reads the predicate, never mutates.
  const makeFlow = () => new Set(['2026-08-10', '2026-08-11', '2026-08-12', '2026-07-30', '2026-07-31'])

  it('returns null for a day without flow', () => {
    const flow = makeFlow()
    expect(runBoundsAt((i) => flow.has(i), '2026-08-13')).toBeNull()
  })

  it('returns a single-day run for a lone flow day', () => {
    const flow = new Set(['2026-08-13'])
    expect(runBoundsAt((i) => flow.has(i), '2026-08-13')).toEqual({ start: '2026-08-13', end: '2026-08-13' })
  })

  it('walks the full run from any interior day', () => {
    const flow = makeFlow()
    const hasFlow = (i: string) => flow.has(i)
    expect(runBoundsAt(hasFlow, '2026-08-10')).toEqual({ start: '2026-08-10', end: '2026-08-12' })
    expect(runBoundsAt(hasFlow, '2026-08-11')).toEqual({ start: '2026-08-10', end: '2026-08-12' })
    expect(runBoundsAt(hasFlow, '2026-08-12')).toEqual({ start: '2026-08-10', end: '2026-08-12' })
  })

  it('spans month boundaries without a seam', () => {
    const flow = makeFlow()
    flow.add('2026-08-01')
    const hasFlow = (i: string) => flow.has(i)
    expect(runBoundsAt(hasFlow, '2026-08-01')).toEqual({ start: '2026-07-30', end: '2026-08-01' })
  })
})

describe('editRange beginEdit', () => {
  it('pressed day becomes the new start; run end remains', () => {
    const edit = beginEdit({ start: '2026-08-10', end: '2026-08-12' }, '2026-08-11')
    expect(edit).toEqual({
      originalStart: '2026-08-10',
      originalEnd: '2026-08-12',
      start: '2026-08-11',
      end: '2026-08-12',
    })
  })

  it('pressing the run start keeps it unchanged', () => {
    const edit = beginEdit({ start: '2026-08-10', end: '2026-08-12' }, '2026-08-10')
    expect(edit.start).toBe('2026-08-10')
    expect(edit.end).toBe('2026-08-12')
  })

  it('pressing the run end collapses to a one-day run (start = end)', () => {
    const edit = beginEdit({ start: '2026-08-10', end: '2026-08-12' }, '2026-08-12')
    expect(edit).toEqual({
      originalStart: '2026-08-10',
      originalEnd: '2026-08-12',
      start: '2026-08-12',
      end: '2026-08-12',
    })
  })
})

describe('editRange moveStart', () => {
  const base = beginEdit({ start: '2026-08-10', end: '2026-08-12' }, '2026-08-11')

  it('moves the start handle backward (earlier)', () => {
    expect(moveStart(base, '2026-08-09').start).toBe('2026-08-09')
  })

  it('moves the start handle forward within the run', () => {
    expect(moveStart(base, '2026-08-12').start).toBe('2026-08-12')
  })

  it('clamps at the end — start can never cross the end', () => {
    expect(moveStart(base, '2026-08-20')).toEqual({ ...base, start: '2026-08-12' })
  })

  it('same cell is a no-op (same ref)', () => {
    expect(moveStart(base, '2026-08-11')).toBe(base)
  })

  it('clamps start when maxDays would be exceeded', () => {
    // end is 2026-08-12, maxDays=2 → start can go back to 2026-08-10 at most
    const moved = moveStart(base, '2026-08-01', 2)
    expect(moved.start).toBe('2026-08-10')
  })

  it('maxDays allows move within limit', () => {
    const moved = moveStart(base, '2026-08-05', 10)
    expect(moved.start).toBe('2026-08-05')
  })
})

describe('editRange moveEnd', () => {
  const base = beginEdit({ start: '2026-08-10', end: '2026-08-12' }, '2026-08-11')

  it('moves the end handle forward (later)', () => {
    expect(moveEnd(base, '2026-08-14').end).toBe('2026-08-14')
  })

  it('moves the end handle backward within the run, clamped at the start', () => {
    expect(moveEnd(base, '2026-08-10').end).toBe('2026-08-11')
  })

  it('clamps at the start — end can never cross the start', () => {
    expect(moveEnd(base, '2026-08-05')).toEqual({ ...base, end: '2026-08-11' })
  })

  it('same cell is a no-op (same ref)', () => {
    expect(moveEnd(base, '2026-08-12')).toBe(base)
  })

  it('clamps end when maxDays would be exceeded', () => {
    // base.start is 2026-08-11 (pressed day), maxDays=2 → end clamps to 2026-08-13
    const moved = moveEnd(base, '2026-08-20', 2)
    expect(moved.end).toBe('2026-08-13')
  })

  it('maxDays allows move within limit', () => {
    const moved = moveEnd(base, '2026-08-18', 10)
    expect(moved.end).toBe('2026-08-18')
  })
})

describe('editRange commitEdit', () => {
  it('returns ascending inclusive bounds after handle moves', () => {
    const edit = beginEdit({ start: '2026-08-10', end: '2026-08-12' }, '2026-08-10')
    expect(commitEdit(edit)).toEqual({ from: '2026-08-10', to: '2026-08-12' })
    expect(commitEdit(moveEnd(edit, '2026-08-09'))).toEqual({ from: '2026-08-10', to: '2026-08-10' })
    expect(commitEdit(moveStart(edit, '2026-08-09'))).toEqual({ from: '2026-08-09', to: '2026-08-12' })
  })
})

describe('editRange deleteRange', () => {
  it('returns original bounds even after handle moves', () => {
    const edit = beginEdit({ start: '2026-08-10', end: '2026-08-12' }, '2026-08-11')
    expect(deleteRange(edit)).toEqual({ from: '2026-08-10', to: '2026-08-12' })
  })

  it('returns original bounds after start move', () => {
    const edit = moveStart(
      beginEdit({ start: '2026-08-10', end: '2026-08-12' }, '2026-08-11'),
      '2026-08-05',
    )
    expect(deleteRange(edit)).toEqual({ from: '2026-08-10', to: '2026-08-12' })
  })

  it('returns original bounds after end move', () => {
    const edit = moveEnd(
      beginEdit({ start: '2026-08-10', end: '2026-08-12' }, '2026-08-11'),
      '2026-08-20',
    )
    expect(deleteRange(edit)).toEqual({ from: '2026-08-10', to: '2026-08-12' })
  })
})