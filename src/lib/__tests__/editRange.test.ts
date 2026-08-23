import { describe, expect, it } from 'vitest'
import {
  beginEdit,
  beginEditHandle,
  commitEdit,
  deleteRange,
  extendEditRange,
  moveEnd,
  moveStart,
  runBoundsAt,
} from '../editRange'

describe('editRange runBoundsAt', () => {
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

describe('editRange beginEdit (long-press range mode)', () => {
  it('preserves original committed bounds on enter (no date shift)', () => {
    const edit = beginEdit({ start: '2026-08-10', end: '2026-08-12' }, '2026-08-11')
    expect(edit).toEqual({
      originalStart: '2026-08-10',
      originalEnd: '2026-08-12',
      start: '2026-08-10',
      end: '2026-08-12',
      dragMode: 'range',
      pressOriginISO: '2026-08-11',
    })
  })

  it('pressing the run start still preserves bounds', () => {
    const edit = beginEdit({ start: '2026-08-10', end: '2026-08-12' }, '2026-08-10')
    expect(edit.start).toBe('2026-08-10')
    expect(edit.end).toBe('2026-08-12')
    expect(edit.dragMode).toBe('range')
  })

  it('pressing the run end still preserves bounds', () => {
    const edit = beginEdit({ start: '2026-08-10', end: '2026-08-12' }, '2026-08-12')
    expect(edit.start).toBe('2026-08-10')
    expect(edit.end).toBe('2026-08-12')
    expect(edit.dragMode).toBe('range')
  })
})

describe('editRange beginEditHandle', () => {
  it('creates handle-mode edit with bounds at committed run', () => {
    const edit = beginEditHandle({ start: '2026-08-10', end: '2026-08-12' }, 'start')
    expect(edit).toEqual({
      originalStart: '2026-08-10',
      originalEnd: '2026-08-12',
      start: '2026-08-10',
      end: '2026-08-12',
      dragMode: 'handle',
      pressOriginISO: '2026-08-10',
    })
  })

  it('end handle sets pressOriginISO to run end', () => {
    const edit = beginEditHandle({ start: '2026-08-10', end: '2026-08-12' }, 'end')
    expect(edit.pressOriginISO).toBe('2026-08-12')
    expect(edit.dragMode).toBe('handle')
  })
})

describe('editRange extendEditRange (range mode)', () => {
  const base = beginEdit({ start: '2026-08-10', end: '2026-08-12' }, '2026-08-11')

  it('drag forward sets both bounds from press origin to current cell', () => {
    const moved = extendEditRange(base, '2026-08-15')
    expect(moved.start).toBe('2026-08-11')
    expect(moved.end).toBe('2026-08-15')
  })

  it('drag backward sets both bounds ascending', () => {
    const moved = extendEditRange(base, '2026-08-08')
    expect(moved.start).toBe('2026-08-08')
    expect(moved.end).toBe('2026-08-11')
  })

  it('same cell as press origin is a no-op (same ref)', () => {
    expect(extendEditRange(base, '2026-08-11')).toBe(base)
  })

  it('clamps to maxDays preserving direction (forward)', () => {
    const moved = extendEditRange(base, '2026-08-20', 3)
    expect(moved.start).toBe('2026-08-11')
    expect(moved.end).toBe('2026-08-14')
  })

  it('clamps to maxDays preserving direction (backward)', () => {
    const moved = extendEditRange(base, '2026-08-01', 3)
    expect(moved.start).toBe('2026-08-08')
    expect(moved.end).toBe('2026-08-11')
  })

  it('is a no-op on handle-mode edits', () => {
    const handle = beginEditHandle({ start: '2026-08-10', end: '2026-08-12' }, 'start')
    expect(extendEditRange(handle, '2026-08-20')).toBe(handle)
  })
})

describe('editRange moveStart (handle mode only)', () => {
  const base = beginEditHandle({ start: '2026-08-10', end: '2026-08-12' }, 'start')

  it('moves the start handle backward (earlier)', () => {
    expect(moveStart(base, '2026-08-09').start).toBe('2026-08-09')
  })

  it('moves the start handle forward within the run', () => {
    expect(moveStart(base, '2026-08-11').start).toBe('2026-08-11')
  })

  it('clamps at the end — start can never cross the end', () => {
    expect(moveStart(base, '2026-08-20')).toEqual({ ...base, start: '2026-08-12' })
  })

  it('same cell is a no-op (same ref)', () => {
    expect(moveStart(base, '2026-08-10')).toBe(base)
  })

  it('clamps start when maxDays would be exceeded', () => {
    const moved = moveStart(base, '2026-08-01', 2)
    expect(moved.start).toBe('2026-08-10')
  })

  it('maxDays allows move within limit', () => {
    const moved = moveStart(base, '2026-08-05', 10)
    expect(moved.start).toBe('2026-08-05')
  })

  it('is a no-op on range-mode edits', () => {
    const range = beginEdit({ start: '2026-08-10', end: '2026-08-12' }, '2026-08-11')
    expect(moveStart(range, '2026-08-01')).toBe(range)
  })
})

describe('editRange moveEnd (handle mode only)', () => {
  const base = beginEditHandle({ start: '2026-08-10', end: '2026-08-12' }, 'end')

  it('moves the end handle forward (later)', () => {
    expect(moveEnd(base, '2026-08-14').end).toBe('2026-08-14')
  })

  it('moves the end handle backward within the run, clamped at the start', () => {
    expect(moveEnd(base, '2026-08-10').end).toBe('2026-08-10')
  })

  it('clamps at the start — end can never cross the start', () => {
    // End clamps to start, not allowed to cross it
    expect(moveEnd(base, '2026-08-05')).toEqual({ ...base, end: '2026-08-10' })
  })

  it('same cell is a no-op (same ref)', () => {
    expect(moveEnd(base, '2026-08-12')).toBe(base)
  })

  it('clamps end when maxDays would be exceeded', () => {
    const moved = moveEnd(base, '2026-08-20', 2)
    expect(moved.end).toBe('2026-08-12')
  })

  it('maxDays allows move within limit', () => {
    const moved = moveEnd(base, '2026-08-18', 10)
    expect(moved.end).toBe('2026-08-18')
  })

  it('is a no-op on range-mode edits', () => {
    const range = beginEdit({ start: '2026-08-10', end: '2026-08-12' }, '2026-08-11')
    expect(moveEnd(range, '2026-08-30')).toBe(range)
  })
})

describe('editRange commitEdit', () => {
  it('returns ascending inclusive bounds after handle moves', () => {
    const edit = beginEditHandle({ start: '2026-08-10', end: '2026-08-12' }, 'start')
    expect(commitEdit(edit)).toEqual({ from: '2026-08-10', to: '2026-08-12' })
    // End clamps to start when dragged before it
    expect(commitEdit(moveEnd(edit, '2026-08-09'))).toEqual({ from: '2026-08-10', to: '2026-08-10' })
    expect(commitEdit(moveStart(edit, '2026-08-09'))).toEqual({ from: '2026-08-09', to: '2026-08-12' })
  })

  it('returns ascending bounds after range-mode drag', () => {
    const edit = extendEditRange(
      beginEdit({ start: '2026-08-10', end: '2026-08-12' }, '2026-08-11'),
      '2026-08-15',
    )
    expect(commitEdit(edit)).toEqual({ from: '2026-08-11', to: '2026-08-15' })
  })
})

describe('editRange deleteRange', () => {
  it('returns original bounds even after handle moves', () => {
    const edit = beginEditHandle({ start: '2026-08-10', end: '2026-08-12' }, 'start')
    expect(deleteRange(edit)).toEqual({ from: '2026-08-10', to: '2026-08-12' })
  })

  it('returns original bounds after start move', () => {
    const edit = moveStart(
      beginEditHandle({ start: '2026-08-10', end: '2026-08-12' }, 'start'),
      '2026-08-05',
    )
    expect(deleteRange(edit)).toEqual({ from: '2026-08-10', to: '2026-08-12' })
  })

  it('returns original bounds after end move', () => {
    const edit = moveEnd(
      beginEditHandle({ start: '2026-08-10', end: '2026-08-12' }, 'end'),
      '2026-08-20',
    )
    expect(deleteRange(edit)).toEqual({ from: '2026-08-10', to: '2026-08-12' })
  })

  it('returns original bounds after range-mode drag', () => {
    const edit = extendEditRange(
      beginEdit({ start: '2026-08-10', end: '2026-08-12' }, '2026-08-11'),
      '2026-08-20',
    )
    expect(deleteRange(edit)).toEqual({ from: '2026-08-10', to: '2026-08-12' })
  })
})
