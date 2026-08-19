import { describe, expect, it } from 'vitest'
import { beginDrag, commitDrag, extendDrag } from '../rangeDrag'

describe('rangeDrag', () => {
  it('beginDrag anchors start and end on the same cell', () => {
    expect(beginDrag('2026-08-10')).toEqual({ start: '2026-08-10', end: '2026-08-10' })
  })

  it('extendDrag moves end to the cell under the pointer', () => {
    const d = extendDrag(beginDrag('2026-08-10'), '2026-08-12')
    expect(d).toEqual({ start: '2026-08-10', end: '2026-08-12' })
  })

  it('extendDrag on the same cell is a no-op (no re-render churn)', () => {
    const d = beginDrag('2026-08-10')
    expect(extendDrag(d, '2026-08-10')).toBe(d)
  })

  it('commitDrag returns ascending inclusive bounds for a forward drag', () => {
    const d = extendDrag(beginDrag('2026-08-10'), '2026-08-13')
    expect(commitDrag(d)).toEqual({ from: '2026-08-10', to: '2026-08-13' })
  })

  it('commitDrag normalizes a backward drag to ascending bounds', () => {
    const d = extendDrag(beginDrag('2026-08-20'), '2026-08-17')
    expect(commitDrag(d)).toEqual({ from: '2026-08-17', to: '2026-08-20' })
  })

  it('commitDrag returns null for a plain tap (start === end)', () => {
    expect(commitDrag(beginDrag('2026-08-10'))).toBeNull()
  })

  it('commitDrag zig-zag drag: last crossed cell wins as end', () => {
    const d = extendDrag(
      extendDrag(extendDrag(beginDrag('2026-08-10'), '2026-08-13'), '2026-08-11'),
      '2026-08-12',
    )
    expect(commitDrag(d)).toEqual({ from: '2026-08-10', to: '2026-08-12' })
  })
})