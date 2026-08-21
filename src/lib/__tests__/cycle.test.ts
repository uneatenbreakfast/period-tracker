import { describe, expect, it } from 'vitest'
import type { DayEntry } from '../../types'
import {
  CYCLE_GAP_THRESHOLD_DAYS,
  DEFAULT_CYCLE_LENGTH,
  DEFAULT_PERIOD_LENGTH,
  FERTILE_RANGE,
  LUTEAL_PHASE_DAYS,
  averageCycleLength,
  averagePeriodLength,
  cycleDayInfo,
  cycleLengths,
  cycleTrends,
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
  it('no completed lengths; default 28 until 2 cycles logged (Fitbit)', () => {
    expect(cycleLengths([])).toEqual([])
    const one = detectCycles(['2026-01-03', '2026-01-04'].map((d) => day(d)))
    expect(cycleLengths(one)).toEqual([])
    expect(averageCycleLength(one)).toBe(DEFAULT_CYCLE_LENGTH)
    expect(averageCycleLength([])).toBe(DEFAULT_CYCLE_LENGTH)
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

  it('recency-weighted: recent shorter cycles pull the average down harder', () => {
    // lengths [28, 28, 21]: flat mean 25.7 → 26; weighted (28+56+63)/6 = 24.5 → 25
    const entries = [
      '2026-01-03', '2026-01-05',
      '2026-01-31', '2026-02-02', // +28
      '2026-02-28', '2026-03-02', // +28
      '2026-03-21', '2026-03-23', // +21
    ].map((d) => day(d))
    expect(averageCycleLength(detectCycles(entries))).toBe(25)
  })

  it('recency-weighted: recent longer cycles pull the average up harder', () => {
    // lengths [28, 28, 40]: flat mean 32; weighted (28+56+120)/6 = 34
    const entries = [
      '2026-01-03', '2026-01-05',
      '2026-01-31', '2026-02-02', // +28
      '2026-02-28', '2026-03-02', // +28
      '2026-04-09', '2026-04-11', // +40
    ].map((d) => day(d))
    expect(averageCycleLength(detectCycles(entries))).toBe(34)
  })
})

describe('cycleDayInfo', () => {
  const threeCycles = [
    '2026-01-03', '2026-01-04',
    '2026-01-31', '2026-02-01',
    '2026-02-28', '2026-03-01',
  ].map((d) => day(d))
  // avg 28, last start 2026-02-28, period length 2 (Feb 28–Mar 1)
  // next period 2026-03-28, ovulation 03-14, fertile 03-09..03-15

  it('null with no logged period (no anchor)', () => {
    expect(cycleDayInfo([], '2026-03-01')).toBeNull()
    expect(cycleDayInfo([{ date: '2026-03-01', symptoms: ['cramps'] }], '2026-03-05')).toBeNull()
  })

  it('single cycle → ring at default 28 (Fitbit), day offset from last start', () => {
    const info = cycleDayInfo(['2026-01-03', '2026-01-04'].map((d) => day(d)), '2026-01-10')!
    expect(info.cycleLength).toBe(DEFAULT_CYCLE_LENGTH)
    expect(info.dayInCycle).toBe(7)
    expect(info.phase).toBe('follicular')
    expect(info.segments[0]).toEqual({ phase: 'period', start: 0, end: 2 })
  })

  it('day 0 = last cycle start, period phase', () => {
    const info = cycleDayInfo(threeCycles, '2026-02-28')!
    expect(info.dayInCycle).toBe(0)
    expect(info.phase).toBe('period')
    expect(info.cycleLength).toBe(28)
  })

  it('period phase on second bleed day', () => {
    const info = cycleDayInfo(threeCycles, '2026-03-01')!
    expect(info.dayInCycle).toBe(1)
    expect(info.phase).toBe('period')
  })

  it('follicular phase between period end and fertile window', () => {
    const info = cycleDayInfo(threeCycles, '2026-03-05')!
    expect(info.dayInCycle).toBe(5)
    expect(info.phase).toBe('follicular')
  })

  it('ovulation phase inside fertile window', () => {
    const info = cycleDayInfo(threeCycles, '2026-03-12')!
    expect(info.phase).toBe('ovulation')
    expect(info.dayInCycle).toBe(12)
  })

  it('luteal phase after fertile window', () => {
    const info = cycleDayInfo(threeCycles, '2026-03-20')!
    expect(info.phase).toBe('luteal')
    expect(info.dayInCycle).toBe(20)
  })

  it('wraps to 0 on predicted next period start', () => {
    const info = cycleDayInfo(threeCycles, '2026-03-28')!
    expect(info.dayInCycle).toBe(0)
    expect(info.phase).toBe('period')
  })

  it('segments cover [0, cycleLength) in order with expected ranges', () => {
    const info = cycleDayInfo(threeCycles, '2026-03-10')!
    expect(info.segments).toEqual([
      { phase: 'period', start: 0, end: 2 },
      { phase: 'follicular', start: 2, end: 9 }, // 03-09 fertile start → day 9
      { phase: 'ovulation', start: 9, end: 16 }, // 03-15 + 1 inclusive → day 16
      { phase: 'luteal', start: 16, end: 28 },
    ])
    // contiguous, no gaps
    for (let i = 1; i < info.segments.length; i++) {
      expect(info.segments[i].start).toBe(info.segments[i - 1].end)
    }
    expect(info.segments[0].start).toBe(0)
    expect(info.segments[info.segments.length - 1].end).toBe(28)
  })

  it('long period clamps fertile start so segments stay ordered', () => {
    // last cycle period is 10 days (Jan 31–Feb 9); fertile window (day 9) falls inside it
    const entries = [
      ...['2026-01-03', '2026-01-04', '2026-01-05'].map((d) => day(d)),
      ...Array.from({ length: 10 }, (_, i) => addDays('2026-01-31', i)).map((d) => day(d)),
    ]
    const info = cycleDayInfo(entries, '2026-02-05')!
    let prevEnd = 0
    for (const s of info.segments) {
      expect(s.start).toBeGreaterThanOrEqual(prevEnd)
      expect(s.end).toBeGreaterThanOrEqual(s.start)
      prevEnd = s.end
    }
    expect(info.segments[0].end).toBe(10)
  })
})

describe('predictNext', () => {
  const threeCycles = [
    '2026-01-03', '2026-01-04',
    '2026-01-31', '2026-02-01',
    '2026-02-28', '2026-03-01',
  ].map((d) => day(d))

  it('no entries → all null except default avg', () => {
    const p = predictNext([])
    expect(p.nextPeriodStart).toBeNull()
    expect(p.daysUntil).toBeNull()
    expect(p.ovulationDay).toBeNull()
    expect(p.fertileWindow).toBeNull()
    expect(p.avgCycleLength).toBe(DEFAULT_CYCLE_LENGTH)
  })

  it('single cycle → predicted from last start + default 28 (Fitbit)', () => {
    const p = predictNext(['2026-01-03', '2026-01-04'].map((d) => day(d)))
    expect(p.nextPeriodStart).toBe(addDays('2026-01-03', DEFAULT_CYCLE_LENGTH)) // 2026-01-31
    expect(p.avgCycleLength).toBe(DEFAULT_CYCLE_LENGTH)
    expect(p.ovulationDay).toBe(addDays('2026-01-31', -LUTEAL_PHASE_DAYS))
    expect(p.fertileWindow).toEqual({
      start: addDays(p.ovulationDay!, -FERTILE_RANGE.before),
      end: addDays(p.ovulationDay!, FERTILE_RANGE.after),
    })
    expect(p.daysUntil).toBeGreaterThanOrEqual(0)
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

/**
 * Six cycles matching the Trends reference screen (period days only; spans
 * derive from cycle lengths): intervals 26, 25, 26, 23, 28 days.
 */
function sixCycles(): DayEntry[] {
  const starts = ['2026-03-15', '2026-04-10', '2026-05-05', '2026-05-31', '2026-06-23', '2026-07-21']
  const lengths = [6, 5, 6, 5, 5, 5]
  const entries: DayEntry[] = []
  starts.forEach((s, i) => {
    for (let j = 0; j < lengths[i]; j++) entries.push(day(addDays(s, j)))
  })
  return entries
}

describe('averagePeriodLength', () => {
  it('no cycles → Fitbit default 5-day period', () => {
    expect(averagePeriodLength([])).toBe(DEFAULT_PERIOD_LENGTH)
  })

  it('mean of period spans, rounded', () => {
    expect(averagePeriodLength(detectCycles(sixCycles()))).toBe(5) // (6+5+6+5+5+5)/6 = 5.33
    const three = ['2026-01-03', '2026-01-05', '2026-02-02', '2026-02-04', '2026-03-04', '2026-03-06'].map((d) => day(d))
    expect(averagePeriodLength(detectCycles(three))).toBe(3)
  })
})

describe('cycleTrends', () => {
  it('no entries → empty rows, null stats', () => {
    expect(cycleTrends([])).toEqual({ rows: [], stats: { avgPeriodLength: null, avgOvulationDay: null, avgCycleLength: null } })
  })

  it('single cycle → predicted row at default 28 (Fitbit), not end-of-period', () => {
    const { rows, stats } = cycleTrends(['2026-01-03', '2026-01-04', '2026-01-05'].map((d) => day(d)))
    expect(rows).toEqual([
      { start: '2026-01-03', end: '2026-01-30', periodLength: 3, ovulationDay: 15, cycleLength: 28, nextStart: '2026-01-31', fertileWindow: { start: '2026-01-12', end: '2026-01-18' } },
    ])
    expect(stats).toEqual({ avgPeriodLength: 3, avgOvulationDay: 15, avgCycleLength: 28 })
  })

  it('six cycles → spans, ovulation days and predicted latest match reference rows', () => {
    const { rows, stats } = cycleTrends(sixCycles())
    expect(rows).toEqual([
      { start: '2026-03-15', end: '2026-04-09', periodLength: 6, ovulationDay: 13, cycleLength: 26, nextStart: '2026-04-10', fertileWindow: { start: '2026-03-22', end: '2026-03-28' } },
      { start: '2026-04-10', end: '2026-05-04', periodLength: 5, ovulationDay: 12, cycleLength: 25, nextStart: '2026-05-05', fertileWindow: { start: '2026-04-16', end: '2026-04-22' } },
      { start: '2026-05-05', end: '2026-05-30', periodLength: 6, ovulationDay: 13, cycleLength: 26, nextStart: '2026-05-31', fertileWindow: { start: '2026-05-12', end: '2026-05-18' } },
      { start: '2026-05-31', end: '2026-06-22', periodLength: 5, ovulationDay: 10, cycleLength: 23, nextStart: '2026-06-23', fertileWindow: { start: '2026-06-04', end: '2026-06-10' } },
      { start: '2026-06-23', end: '2026-07-20', periodLength: 5, ovulationDay: 15, cycleLength: 28, nextStart: '2026-07-21', fertileWindow: { start: '2026-07-02', end: '2026-07-08' } },
      // latest cycle: length from the average (prediction), not yet observed
      { start: '2026-07-21', end: '2026-08-15', periodLength: 5, ovulationDay: 13, cycleLength: 26, nextStart: '2026-08-16', fertileWindow: { start: '2026-07-28', end: '2026-08-03' } },
    ])
    expect(stats).toEqual({ avgPeriodLength: 5, avgOvulationDay: 13, avgCycleLength: 26 })
  })

  it('avg ovulation day derives from per-row ovulation days (round)', () => {
    const { stats } = cycleTrends(sixCycles())
    expect(stats.avgOvulationDay).toBe(Math.round((13 + 12 + 13 + 10 + 15 + 13) / 6))
  })

  it('sorts ascending (same order as detectCycles)', () => {
    const { rows } = cycleTrends(sixCycles())
    expect(rows[0].start < rows[rows.length - 1].start).toBe(true)
  })
})

describe('custom settings defaults (BLOOM-0002)', () => {
  it('averageCycleLength falls back to the user default when < 2 cycles', () => {
    const one = detectCycles(['2026-01-03', '2026-01-04'].map((d) => day(d)))
    expect(averageCycleLength(one, 32)).toBe(32)
    expect(averageCycleLength(one)).toBe(DEFAULT_CYCLE_LENGTH) // untouched callers keep 28
  })

  it('averagePeriodLength falls back to the user default with no cycles', () => {
    expect(averagePeriodLength([], 4)).toBe(4)
    expect(averagePeriodLength([])).toBe(DEFAULT_PERIOD_LENGTH)
  })

  it('predictNext anchors on the custom default cycle length', () => {
    const p = predictNext(['2026-01-03', '2026-01-04'].map((d) => day(d)), {
      cycleLength: 32,
      periodLength: 4,
    })
    expect(p.avgCycleLength).toBe(32)
    expect(p.nextPeriodStart).toBe(addDays('2026-01-03', 32))
  })

  it('cycleTrends single-cycle row uses the custom default', () => {
    const { rows, stats } = cycleTrends(['2026-01-03', '2026-01-04', '2026-01-05'].map((d) => day(d)), {
      cycleLength: 30,
      periodLength: 4,
    })
    expect(rows[0].cycleLength).toBe(30)
    expect(rows[0].nextStart).toBe('2026-02-02') // 01-03 + 30
    expect(stats.avgCycleLength).toBe(30)
  })

  it('cycleDayInfo ring length uses the custom default', () => {
    const info = cycleDayInfo(['2026-01-03', '2026-01-04'].map((d) => day(d)), '2026-01-10', {
      cycleLength: 30,
      periodLength: 4,
    })!
    expect(info.cycleLength).toBe(30)
    expect(info.dayInCycle).toBe(7)
  })

  it('real data always beats custom defaults once 2+ cycles are logged', () => {
    const entries = [
      '2026-01-03', '2026-01-05',
      '2026-02-02', '2026-02-04', // +30
    ].map((d) => day(d))
    const p = predictNext(entries, { cycleLength: 40, periodLength: 4 })
    expect(p.avgCycleLength).toBe(30)
    expect(p.nextPeriodStart).toBe(addDays('2026-02-02', 30))
  })
})