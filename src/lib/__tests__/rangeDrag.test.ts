import { describe, expect, it } from 'vitest'
import { armDrag, beginDrag, commitDrag, extendDrag } from '../rangeDrag'

describe('rangeDrag', () => {
  it('beginDrag anchors start and end on the same cell, unarmed', () => {
    expect(beginDrag('2026-08-10')).toEqual({ start: '2026-08-10', end: '2026-08-10', armed: false })
  })

  it('armDrag arms the drag after the long-press threshold', () => {
    const d = armDrag(beginDrag('2026-08-10'))
    expect(d).toEqual({ start: '2026-08-10', end: '2026-08-10', armed: true })
  })

  it('armDrag is idempotent (already armed = same ref)', () => {
    const d = armDrag(beginDrag('2026-08-10'))
    expect(armDrag(d)).toBe(d)
  })

  it('extendDrag before arming is a no-op (fast drag starts no selection)', () => {
    const d = beginDrag('2026-08-10')
    expect(extendDrag(d, '2026-08-12')).toBe(d)
  })

  it('extendDrag moves end to the cell under the pointer once armed', () => {
    const d = extendDrag(armDrag(beginDrag('2026-08-10')), '2026-08-12')
    expect(d).toEqual({ start: '2026-08-10', end: '2026-08-12', armed: true })
  })

  it('extendDrag on the same cell is a no-op (no re-render churn)', () => {
    const d = armDrag(beginDrag('2026-08-10'))
    expect(extendDrag(d, '2026-08-10')).toBe(d)
  })

  it('commitDrag returns null for an unarmed drag even with movement (quick drag)', () => {
    const d = extendDrag(beginDrag('2026-08-10'), '2026-08-13')
    expect(commitDrag(d)).toBeNull()
  })

  it('commitDrag returns null for a long press without a drag (armed, same cell)', () => {
    expect(commitDrag(armDrag(beginDrag('2026-08-10')))).toBeNull()
  })

  it('commitDrag returns ascending inclusive bounds for an armed forward drag', () => {
    const d = extendDrag(armDrag(beginDrag('2026-08-10')), '2026-08-13')
    expect(commitDrag(d)).toEqual({ from: '2026-08-10', to: '2026-08-13' })
  })

  it('commitDrag normalizes an armed backward drag to ascending bounds', () => {
    const d = extendDrag(armDrag(beginDrag('2026-08-20')), '2026-08-17')
    expect(commitDrag(d)).toEqual({ from: '2026-08-17', to: '2026-08-20' })
  })

  it('commitDrag zig-zag drag after arming: last crossed cell wins as end', () => {
    const d = extendDrag(
      extendDrag(extendDrag(armDrag(beginDrag('2026-08-10')), '2026-08-13'), '2026-08-11'),
      '2026-08-12',
    )
    expect(commitDrag(d)).toEqual({ from: '2026-08-10', to: '2026-08-12' })
  })

  it('an unarmed mid-flight drag can still be rescued by arming, then commits', () => {
    // Pre-arm extension attempts are dropped; what matters is the state the
    // timer arms, then the pointer move that follows.
    const held = armDrag(beginDrag('2026-08-10'))
    const d = extendDrag(held, '2026-08-15')
    expect(commitDrag(d)).toEqual({ from: '2026-08-10', to: '2026-08-15' })
  })
})