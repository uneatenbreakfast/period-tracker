import { describe, expect, it } from 'vitest'
import type { DayEntry } from '../../types'
import {
  CYCLE_GAP_THRESHOLD_DAYS,
  FERTILE_RANGE,
  LUTEAL_PHASE_DAYS,
  averageCycleLength,
  cycleLengths,
  detectCycles,
  isPeriodDay,
  predictNext,
} from '../cycle'
import { addDays } from '../dates'

function day(date: string, flow: DayEntry['flow'] = 'medium'): DayEntry {
  return { date, flow, symptoms: [] }
}

describe('isPeriodDay', () => {
  it('flow set = period day; undefined flow = not', () => {
    expect(isPeriodDay(day('2026-01-01'))).toBe(true)
    expect(isPeriodDay({ date: '2026-01-02', symptoms: ['cramps'] })).toBe(false)
  })
})

describe('detectCycles', () => {
  it('no period days → no cycles', () => {
    expect(detectCycles([])).toEqual([])
    expect(detectCycles([{ date: '2026-01-05', symptoms: ['cramps'] }])).toEqual([])
  })

  it('contiguous days form one cycle with inclusive length', () => {
    const entries = ['2026-01-03', '2026-01-04', '2026-01-05', '2026-01-06'].map((d) => day(d))
    const cycles = detectCycles(entries)
    expect(cycles).toHaveLength(1)
    expect(cycles[0]).toEqual({
      start: '2026-01-03',
      end: '2026-01-06',
      days: ['2026-01-03', '2026-01-04', '2026-01-05', '2026-01-06'],
      length: 4,
    })
  })

  it('gap ≤ threshold keeps one cycle (mid-period spotting break)', () => {
    const entries = [
      '2026-01-03', '2026-01-04', '2026-01-05',
      addDays('2026-01-05', 2), // 2-day gap
      addDays('2026-01-05', 3),
    ].map((d) => day(d))
    const cycles = detectCycles(entries)
    expect(cycles).toHaveLength(1)
    expect(cycles[0].end).toBe('2026-01-08')
    expect(cycles[0].length).toBe(6)
  })

  it(`gap > ${CYCLE_GAP_THRESHOLD_DAYS} days splits into a new cycle`, () => {
    const jan = ['2026-01-03', '2026-01-04', '2026-01-05']
    const feb = ['2026-02-02', '2026-02-03', '2026-02-04']
    const cycles = detectCycles([...jan, ...feb].map((d) => day(d)))
    expect(cycles).toHaveLength(2)
    expect(cycles[0].start).toBe('2026-01-03')
    expect(cycles[1].start).toBe('2026-02-02')
  })

  it('handles unsorted input', () => {
    const cycles = detectCycles(['2026-02-02', '2026-01-03', '2026-01-04', '2026-02-03'].map((d) => day(d)))
    expect(cycles).toHaveLength(2)
    expect(cycles[0].start).toBe('2026-01-03')
    expect(cycles[1].start).toBe('2026-02-02')
  })
})

describe('cycleLengths / averageCycleLength', () => {
  it('empty for < 2 cycles', () => {
    expect(cycleLengths([])).toEqual([])
    const one = detectCycles(['2026-01-03', '2026-01-04'].map((d) => day(d)))
    expect(cycleLengths(one)).toEqual([])
    expect(averageCycleLength(one)).toBeNull()
  })

  it('start-to-start lengths across 3 cycles', () => {
    const entries = [
      '2026-01-03', '2026-01-05',
      '2026-01-31', '2026-02-02', // +28 from 01-03
      '2026-02-28', '2026-03-02', // +28 from 01-31
    ].map((d) => day(d))
    const cycles = detectCycles(entries)
    expect(cycles).toHaveLength(3)
    expect(cycleLengths(cycles)).toEqual([28, 28])
    expect(averageCycleLength(cycles)).toBe(28)
  })

  it('averages unequal cycles', () => {
    const entries = [
      '2026-01-03', '2026-01-05',
      '2026-02-02', '2026-02-04', // +30
      '2026-03-04', '2026-03-06', // +30
    ].map((d) => day(d))
    const cycles = detectCycles(entries)
    expect(cycleLengths(cycles)).toEqual([30, 30])
    expect(averageCycleLength(cycles)).toBe(30)
  })
})

describe('predictNext', () => {
  const threeCycles = [
    '2026-01-03', '2026-01-04',
    '2026-01-31', '2026-02-01',
    '2026-02-28', '2026-03-01',
  ].map((d) => day(d))

  it('no entries → all null', () => {
    const p = predictNext([])
    expect(p.nextPeriodStart).toBeNull()
    expect(p.daysUntil).toBeNull()
    expect(p.ovulationDay).toBeNull()
    expect(p.fertileWindow).toBeNull()
    expect(p.avgCycleLength).toBeNull()
  })

  it('single cycle → no prediction, avg null', () => {
    const p = predictNext(['2026-01-03', '2026-01-04'].map((d) => day(d)))
    expect(p.nextPeriodStart).toBeNull()
    expect(p.avgCycleLength).toBeNull()
  })

  it('next period = last start + average length, window = ovu-5..ovu+1', () => {
    const p = predictNext(threeCycles)
    expect(p.avgCycleLength).toBe(28)
    expect(p.nextPeriodStart).toBe(addDays('2026-02-28', 28)) // 2026-03-28
    expect(p.ovulationDay).toBe(addDays('2026-03-28', -LUTEAL_PHASE_DAYS))
    expect(p.fertileWindow).toEqual({
      start: addDays(p.ovulationDay!, -FERTILE_RANGE.before),
      end: addDays(p.ovulationDay!, FERTILE_RANGE.after),
    })
    // daysUntil relative to real today — only shape-checked
    expect(p.daysUntil).toBeGreaterThanOrEqual(0)
  })

  it('variable lengths → next start used from last start', () => {
    const entries = [
      '2026-01-03', '2026-01-05',
      '2026-02-02', '2026-02-04',
      '2026-03-04', '2026-03-06',
    ].map((d) => day(d))
    const p = predictNext(entries)
    expect(p.avgCycleLength).toBe(30)
    expect(p.nextPeriodStart).toBe(addDays('2026-03-04', 30))
  })
})