import { describe, expect, it } from 'vitest'
import type { DayEntry } from '../../types'
import { DEFAULT_SETTINGS } from '../settings'
import {
  CYCLE_GAP_THRESHOLD_DAYS,
  DEFAULT_CYCLE_LENGTH,
  DEFAULT_PERIOD_LENGTH,
  FERTILE_RANGE,
  LUTEAL_PHASE_DAYS,
  MAX_CYCLE_LENGTH_DAYS,
  averageCycleLength,
  averagePeriodLength,
  cycleDayInfo,
  cycleDayLabel,
  cycleDayLabelOn,
  cycleLengths,
  cycleTrends,
  detectCycles,
  forecastWindow,
  isPeriodDay,
  predictNext,
  cycleBarLayout,
  historicalEstimates,
  type CycleTrendRow,
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

describe('cycleDayLabel', () => {
  it('null with no logged period (no anchor)', () => {
    expect(cycleDayLabel([], '2026-03-01')).toBeNull()
    expect(cycleDayLabel([{ date: '2026-03-01', symptoms: ['cramps'] }], '2026-03-05')).toBeNull()
  })

  it('first period day = day 1 of the predicted cycle', () => {
    const label = cycleDayLabel([day('2026-01-03')], '2026-01-03', { ...DEFAULT_SETTINGS, cycleLength: 26 })!
    expect(label).toEqual({ day: 1, total: 26 })
  })

  it('day after period start = "day 2 of 26" (dialog headline)', () => {
    const entries = ['2026-01-03', '2026-01-04'].map((d) => day(d))
    const label = cycleDayLabel(entries, '2026-01-04', { ...DEFAULT_SETTINGS, cycleLength: 26 })!
    expect(label).toEqual({ day: 2, total: 26 })
  })

  it('uses the recency-weighted average once 2+ cycles are logged', () => {
    // start-to-start gap = 30 days → average 30 overrides the 28 default
    const entries = ['2026-01-03', '2026-01-04', '2026-02-02', '2026-02-03'].map((d) => day(d))
    const label = cycleDayLabel(entries, '2026-02-03', DEFAULT_SETTINGS)!
    expect(label).toEqual({ day: 2, total: 30 })
  })
})

// cycleDayLabelOn(…, today) is the deterministic core (cycleDayLabel injects
// todayISO()). All dates below are pinned to an injected today so the suite
// never depends on the wall clock.
describe('cycleDayLabel actual-cycle semantics (late/short/long cycles)', () => {
  it('completed cycle reports its ACTUAL logged length, not the recency average', () => {
    // Real start-to-start: A→B = 26 days, B→C = 30 days.
    // Recency-weighted average = (26 + 2·30) / 3 ≈ 29 — the old always-same total.
    const entries = [
      '2026-01-03', '2026-01-04', // A
      '2026-01-29', '2026-01-30', // B (+26)
      '2026-02-28', '2026-03-01', // C (+30)
    ].map((d) => day(d))
    // A mid-cycle: total must be A's real 26 (day 18 exists in a 26-day cycle).
    expect(cycleDayLabelOn(entries, '2026-01-20', DEFAULT_SETTINGS, '2026-09-09')).toEqual({ day: 18, total: 26 })
    // B mid-cycle: total must be B's real 30.
    expect(cycleDayLabelOn(entries, '2026-02-12', DEFAULT_SETTINGS, '2026-09-09')).toEqual({ day: 15, total: 30 })
    // C's own first day: day 1 of the CURRENT cycle, still predicted 30 (avg fallback? no — current cycle predicted by avg of prior = 29)
    expect(cycleDayLabelOn(entries, '2026-02-28', DEFAULT_SETTINGS, '2026-09-09')).toEqual({ day: 1, total: 29 })
  })

  it('shorter-than-average logged cycle caps a tapped day at its real length', () => {
    // Completed gaps: A→B = 26, B→C = 30 → recency avg 29. The old label would
    // call A's day 26 "day 26 of 29"; A really ended at 26.
    const entries = [
      '2025-12-01', '2025-12-02', // A
      '2025-12-27', '2025-12-28', // B (+26)
      '2026-01-26', '2026-01-27', // C (+30)
    ].map((d) => day(d))
    // Day 28 of A would exist under a 30-day cycle but A really ended at 26 → day 27 IS the last day of A.
    expect(cycleDayLabelOn(entries, '2025-12-26', DEFAULT_SETTINGS, '2026-09-09')).toEqual({ day: 26, total: 26 })
    // Next day the real cycle B has started.
    expect(cycleDayLabelOn(entries, '2025-12-27', DEFAULT_SETTINGS, '2026-09-09')).toEqual({ day: 1, total: 30 })
  })

  it('no fake wrap when the current cycle runs LONGER than the average (period late)', () => {
    const entries = ['2026-08-01', '2026-08-02'].map((d) => day(d)) // last start 08-01, avg 28 → predicted end 08-29
    // Today 09-01, no bleed logged: real cycle day 32 — must NOT show "day 5 of 28".
    expect(cycleDayLabelOn(entries, '2026-09-01', DEFAULT_SETTINGS, '2026-09-01')).toEqual({ day: 32, total: null })
    // Still counting on 09-03 (day 34).
    expect(cycleDayLabelOn(entries, '2026-09-03', DEFAULT_SETTINGS, '2026-09-03')).toEqual({ day: 34, total: null })
    // Inside the predicted span the label keeps its predicted total.
    expect(cycleDayLabelOn(entries, '2026-08-20', DEFAULT_SETTINGS, '2026-08-20')).toEqual({ day: 20, total: 28 })
  })

  it('future dates still fold into predicted cycles anchored on the last start', () => {
    const entries = ['2026-08-01', '2026-08-02'].map((d) => day(d))
    const today = '2026-08-10'
    // Predicted next period start (08-29) → day 1 of the NEXT predicted cycle.
    expect(cycleDayLabelOn(entries, '2026-08-29', DEFAULT_SETTINGS, today)).toEqual({ day: 1, total: 28 })
    // Two days later in the future → day 3 of the next predicted cycle.
    expect(cycleDayLabelOn(entries, '2026-08-31', DEFAULT_SETTINGS, today)).toEqual({ day: 3, total: 28 })
  })

  it('date before the first logged period has no cycle anchor → null', () => {
    const entries = ['2026-01-03', '2026-01-04'].map((d) => day(d))
    expect(cycleDayLabelOn(entries, '2025-12-20', DEFAULT_SETTINGS, '2026-09-09')).toBeNull()
  })

  it('outlier gap (> MAX_CYCLE_LENGTH_DAYS) is a logging break, not a cycle → null', () => {
    // Single 212-day "gap" between logged runs — mid-break dates belong to no real cycle.
    const entries = ['2026-01-03', '2026-01-04', '2026-08-03', '2026-08-04'].map((d) => day(d))
    expect(cycleDayLabelOn(entries, '2026-03-01', DEFAULT_SETTINGS, '2026-09-09')).toBeNull()
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

describe('historicalEstimates', () => {
  it('no entries → empty markers', () => {
    expect(historicalEstimates([])).toEqual({ ovulationDays: [], fertileDays: [] })
  })

  it('single cycle (no next start) → empty — last cycle is prediction territory', () => {
    expect(historicalEstimates(['2026-01-03', '2026-01-04'].map((d) => day(d)))).toEqual({ ovulationDays: [], fertileDays: [] })
  })

  it('two cycles → ovulation = next logged start − 14, fertile window ±5/+1', () => {
    // three period runs = two completed cycles: Jan 3 → Jan 31 = 28 days,
    // Jan 31 → Feb 28 = 28 days. The LAST run has no next start — skipped.
    const entries = [
      '2026-01-03', '2026-01-04', '2026-01-05',
      '2026-01-31', '2026-02-01',
      '2026-02-28', '2026-03-01',
    ].map((d) => day(d))
    const { ovulationDays, fertileDays } = historicalEstimates(entries)
    expect(ovulationDays).toEqual([addDays('2026-01-31', -LUTEAL_PHASE_DAYS), addDays('2026-02-28', -LUTEAL_PHASE_DAYS)]) // Jan 17, Feb 14
    const expectFertile: string[] = []
    for (const ov of ovulationDays) {
      for (let d = addDays(ov, -FERTILE_RANGE.before); d <= addDays(ov, FERTILE_RANGE.after); d = addDays(d, 1)) expectFertile.push(d)
    }
    expect(fertileDays).toEqual(expectFertile)
    expect(fertileDays).toHaveLength(14)
    expect(fertileDays).toContain('2026-01-17') // ovulation day inside its window
    expect(fertileDays).toContain('2026-02-14')
  })

  it('multiple cycles → one estimate per non-last cycle, driven by ACTUAL gaps', () => {
    const { ovulationDays, fertileDays } = historicalEstimates(sixCycles())
    // intervals 26, 25, 26, 23, 28 — ovulation = next start − 14
    expect(ovulationDays).toEqual([
      addDays('2026-04-10', -LUTEAL_PHASE_DAYS),
      addDays('2026-05-05', -LUTEAL_PHASE_DAYS),
      addDays('2026-05-31', -LUTEAL_PHASE_DAYS),
      addDays('2026-06-23', -LUTEAL_PHASE_DAYS),
      addDays('2026-07-21', -LUTEAL_PHASE_DAYS),
    ])
    expect(fertileDays).toHaveLength(5 * 7)
    // each ovulation has its 7-day window
    for (const ov of ovulationDays) {
      expect(fertileDays).toContain(ov)
      expect(fertileDays).toContain(addDays(ov, -FERTILE_RANGE.before))
      expect(fertileDays).toContain(addDays(ov, FERTILE_RANGE.after))
    }
  })

  it('outlier gap (> 90 days) → that cycle gets NO estimate (logging break)', () => {
    const entries = [
      '2026-01-03', '2026-01-04',
      '2026-06-01', '2026-06-02',   // 149-day break — not a real cycle boundary
      '2026-06-29', '2026-06-30',   // real 28-day interval after the break
    ].map((d) => day(d))
    const { ovulationDays, fertileDays } = historicalEstimates(entries)
    // cycle 1 (Jan 3 → Jun 1) skipped; cycle 2 (Jun 1 → Jun 29) estimated
    expect(ovulationDays).toEqual([addDays('2026-06-29', -LUTEAL_PHASE_DAYS)])
    expect(fertileDays).toHaveLength(7)
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
      { start: '2026-01-03', end: '2026-01-30', periodLength: 3, ovulationDay: 15, cycleLength: 28, nextStart: '2026-01-31', fertileWindow: { start: '2026-01-12', end: '2026-01-18' }, isOutlier: false },
    ])
    expect(stats).toEqual({ avgPeriodLength: 3, avgOvulationDay: 15, avgCycleLength: 28 })
  })

  it('six cycles → spans, ovulation days and predicted latest match reference rows', () => {
    const { rows, stats } = cycleTrends(sixCycles())
    expect(rows).toEqual([
      { start: '2026-03-15', end: '2026-04-09', periodLength: 6, ovulationDay: 13, cycleLength: 26, nextStart: '2026-04-10', fertileWindow: { start: '2026-03-22', end: '2026-03-28' }, isOutlier: false },
      { start: '2026-04-10', end: '2026-05-04', periodLength: 5, ovulationDay: 12, cycleLength: 25, nextStart: '2026-05-05', fertileWindow: { start: '2026-04-16', end: '2026-04-22' }, isOutlier: false },
      { start: '2026-05-05', end: '2026-05-30', periodLength: 6, ovulationDay: 13, cycleLength: 26, nextStart: '2026-05-31', fertileWindow: { start: '2026-05-12', end: '2026-05-18' }, isOutlier: false },
      { start: '2026-05-31', end: '2026-06-22', periodLength: 5, ovulationDay: 10, cycleLength: 23, nextStart: '2026-06-23', fertileWindow: { start: '2026-06-04', end: '2026-06-10' }, isOutlier: false },
      { start: '2026-06-23', end: '2026-07-20', periodLength: 5, ovulationDay: 15, cycleLength: 28, nextStart: '2026-07-21', fertileWindow: { start: '2026-07-02', end: '2026-07-08' }, isOutlier: false },
      // latest cycle: length from the average (prediction), not yet observed
      { start: '2026-07-21', end: '2026-08-15', periodLength: 5, ovulationDay: 13, cycleLength: 26, nextStart: '2026-08-16', fertileWindow: { start: '2026-07-28', end: '2026-08-03' }, isOutlier: false },
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
      ...DEFAULT_SETTINGS,
      cycleLength: 32,
      periodLength: 4,
      showSafeDays: false,
    })
    expect(p.avgCycleLength).toBe(32)
    expect(p.nextPeriodStart).toBe(addDays('2026-01-03', 32))
  })

  it('cycleTrends single-cycle row uses the custom default', () => {
    const { rows, stats } = cycleTrends(['2026-01-03', '2026-01-04', '2026-01-05'].map((d) => day(d)), {
      ...DEFAULT_SETTINGS,
      cycleLength: 30,
      periodLength: 4,
      showSafeDays: false,
    })
    expect(rows[0].cycleLength).toBe(30)
    expect(rows[0].nextStart).toBe('2026-02-02') // 01-03 + 30
    expect(stats.avgCycleLength).toBe(30)
  })

  it('cycleDayInfo ring length uses the custom default', () => {
    const info = cycleDayInfo(['2026-01-03', '2026-01-04'].map((d) => day(d)), '2026-01-10', {
      ...DEFAULT_SETTINGS,
      cycleLength: 30,
      periodLength: 4,
      showSafeDays: false,
    })!
    expect(info.cycleLength).toBe(30)
    expect(info.dayInCycle).toBe(7)
  })

  it('real data always beats custom defaults once 2+ cycles are logged', () => {
    const entries = [
      '2026-01-03', '2026-01-05',
      '2026-02-02', '2026-02-04', // +30
    ].map((d) => day(d))
    const p = predictNext(entries, { ...DEFAULT_SETTINGS, cycleLength: 40, periodLength: 4, showSafeDays: false })
    expect(p.avgCycleLength).toBe(30)
    expect(p.nextPeriodStart).toBe(addDays('2026-02-02', 30))
  })
})

describe('outlier + future date filtering', () => {
  it('excludes cycle gaps > 90 days from average (logging break)', () => {
    const entries = [
      '2026-01-03', '2026-01-05',
      '2026-02-02', '2026-02-04', // +30
      '2026-06-01', '2026-06-03', // +119 → outlier, excluded
      '2026-07-01', '2026-07-03', // +30
    ].map((d) => day(d))
    const cycles = detectCycles(entries)
    expect(cycleLengths(cycles)).toEqual([30, 119, 30])
    // Only the two 30-day gaps count; 119 is filtered out
    expect(averageCycleLength(cycles)).toBe(30)
  })

  it('outlier gap rows are marked isOutlier and get no fabricated predictions (bar geometry stays sane)', () => {
    // Mirrors real-user data: an old 2012 period, a 2026-06 period, and future
    // dates that detectCycles drops. start-to-start gap 2012→2026 = 5237 days.
    const entries = [
      ...['2012-02-14', '2012-02-15', '2012-02-16', '2012-02-17', '2012-02-18'],
      ...['2026-06-17', '2026-06-18'],
      // future-dated — excluded by detectCycles
      ...['2026-12-23', '2026-12-30'],
    ].map((d) => day(d))
    const { rows } = cycleTrends(entries, DEFAULT_SETTINGS)
    expect(rows.map((r) => r.start)).toEqual(['2012-02-14', '2026-06-17'])

    const [old, recent] = rows
    // 5237-day gap → the row is marked as an outlier; length falls back to the
    // avg purely to keep bar geometry sane (never the raw 5237).
    expect(old.isOutlier).toBe(true)
    expect(old.cycleLength).toBe(28) // avg fallback: default cycle length
    expect(old.cycleLength).not.toBeGreaterThan(MAX_CYCLE_LENGTH_DAYS)
    // No prediction math fabricated from a fallback length
    expect(old.ovulationDay).toBeNull()
    expect(old.nextStart).toBeNull()
    expect(old.fertileWindow).toBeNull()
    expect(old.end).toBe('2012-02-18') // last logged period day, not a fake span

    // The 2026-06 row is the latest (rawLen null) → normal predicted row, NOT an outlier
    expect(recent.isOutlier).toBe(false)
    expect(recent.cycleLength).toBe(28)
    expect(recent.ovulationDay).toBe(15)
    expect(recent.nextStart).toBe('2026-07-15') // 06-17 + 28

    // Bar geometry: outlier row keeps a visible period segment but no fertile
    // (no ovulation); the normal row keeps its full Fitbit bar.
    const maxLen = rows.reduce((m, r) => Math.max(m, r.cycleLength ?? r.periodLength), 0)
    const lOld = cycleBarLayout(old, maxLen)
    expect(lOld.periodEnd).toBeGreaterThan(0.05)
    expect(lOld.showFertile).toBe(false)
    const lRecent = cycleBarLayout(recent, maxLen)
    expect(lRecent.periodEnd).toBeGreaterThan(0.05)
    expect(lRecent.showFertile).toBe(true)
    expect(lRecent.fertileEnd - lRecent.fertileStart).toBeGreaterThan(0.05)
  })

  it('falls back to default when all gaps are outliers', () => {
    const entries = [
      '2026-01-03', '2026-01-05',
      '2026-06-01', '2026-06-03', // +149
      '2026-12-01', '2026-12-03', // +183
    ].map((d) => day(d))
    expect(averageCycleLength(detectCycles(entries))).toBe(DEFAULT_CYCLE_LENGTH)
  })

  it('ignores future-dated period entries (test data / typos)', () => {
    const today = new Date().toISOString().slice(0, 10)
    const future = addDays(today, 30)
    const entries = [
      '2026-01-03', '2026-01-05',
      '2026-02-02', '2026-02-04',
      future, addDays(future, 2), // future period → must be excluded
    ].map((d) => day(d))
    const cycles = detectCycles(entries)
    // Only 2 real cycles detected; future one dropped
    expect(cycles).toHaveLength(2)
    expect(cycles[1].start).toBe('2026-02-02')
  })

  it('marks only the row a broken gap lands on; latest predicted row is not an outlier', () => {
    // cycle1 → cycle2 gap = 149 (outlier) → row for cycle1 is marked;
    // cycle2 → cycle3 gap = 30 (normal) → that row stays normal.
    const entries = [
      '2026-01-03', '2026-01-05',
      '2026-06-01', '2026-06-03', // +149 from 01-03
      '2026-07-01', '2026-07-03', // +30 from 06-01
    ].map((d) => day(d))
    const { rows } = cycleTrends(entries, DEFAULT_SETTINGS)
    expect(rows.map((r) => r.isOutlier)).toEqual([true, false, false])
    // avg excludes the 149-day gap → only 30 counts
    expect(rows[0].cycleLength).toBe(30) // fallback to the avg, never 149
    expect(rows[0].nextStart).toBeNull()
    expect(rows[1].cycleLength).toBe(30) // real gap kept
    expect(rows[1].nextStart).toBe('2026-07-01') // 06-01 + 30
    expect(rows[2].isOutlier).toBe(false) // latest row: predicted, not outlier
    expect(rows[2].nextStart).toBe('2026-07-31') // 07-01 + 30
  })

  it('avg ovulation day excludes outlier rows (no synthetic days in the mean)', () => {
    const entries = [
      ...['2012-02-14', '2012-02-15', '2012-02-16', '2012-02-17', '2012-02-18'],
      ...['2026-06-17', '2026-06-18'], // +5237 from 2012 → outlier row
      ...['2026-07-17', '2026-07-18', '2026-07-19'], // +30 → normal row
    ].map((d) => day(d))
    const { rows, stats } = cycleTrends(entries, DEFAULT_SETTINGS)
    expect(rows.map((r) => r.isOutlier)).toEqual([true, false, false])
    // ovulation days: [null (outlier), 17, 17] → mean over the two real rows only
    expect(stats.avgOvulationDay).toBe(17)
    expect(stats.avgCycleLength).toBe(30) // 5237-day gap excluded
  })

  it('predictNext uses filtered average, not poisoned by outliers', () => {
    const entries = [
      '2026-01-03', '2026-01-05',
      '2026-02-02', '2026-02-04', // +30
      '2026-06-01', '2026-06-03', // +119 → outlier
      '2026-07-01', '2026-07-03', // +30
    ].map((d) => day(d))
    const p = predictNext(entries)
    expect(p.avgCycleLength).toBe(30)
    expect(p.nextPeriodStart).toBe(addDays('2026-07-01', 30))
  })
})

describe('cycleBarLayout', () => {
  const refRow = (overrides: Partial<CycleTrendRow> = {}): CycleTrendRow => ({
    start: '2026-07-21',
    end: '2026-08-15',
    periodLength: 5,
    ovulationDay: 13,
    cycleLength: 26,
    nextStart: '2026-08-16',
    fertileWindow: null,
    isOutlier: false,
    ...overrides,
  })

  it('reference row: 26-day cycle, 5-day period, ovulation day 13, max track 28', () => {
    const l = cycleBarLayout(refRow(), 28)
    expect(l.periodEnd).toBeCloseTo(5 / 26, 6)
    // window starts 5 days before ovulation (sperm-survival), clamped past the period
    expect(l.fertileStart).toBeCloseTo(7 / 26, 6)
    // window ends ON the ovulation day (heart caps the blue segment)
    expect(l.fertileEnd).toBeCloseTo(13 / 26, 6)
    expect(l.trackWidth).toBeCloseTo(26 / 28, 6)
    expect(l.showFertile).toBe(true)
    expect(l.ovulationIdx).toBe(12)
  })

  it('window start clamps to period end when ovulation sits right after the period', () => {
    // 23-day cycle, 5-day period, ovulation day 10 → raw start 5/23 == periodEnd anyway
    const l1 = cycleBarLayout(refRow({ periodLength: 5, ovulationDay: 10, cycleLength: 23 }), 28)
    expect(l1.fertileStart).toBeCloseTo(5 / 23, 6)
    expect(l1.fertileEnd).toBeCloseTo(10 / 23, 6)
    // ovulation day 6 → raw window start 1/23 would overlap the period: clamp to periodEnd 5/23
    const l2 = cycleBarLayout(refRow({ periodLength: 5, ovulationDay: 6, cycleLength: 23 }), 28)
    expect(l2.fertileStart).toBeCloseTo(5 / 23, 6)
    expect(l2.fertileEnd).toBeCloseTo(6 / 23, 6)
    expect(l2.showFertile).toBe(true)
  })

  it('no predicted ovulation → no fertile segment and null index', () => {
    const l = cycleBarLayout(refRow({ ovulationDay: null }), 28)
    expect(l.ovulationIdx).toBeNull()
    expect(l.showFertile).toBe(false)
    expect(l.periodEnd).toBeCloseTo(5 / 26, 6)
  })

  it('track width scales against the longest row and caps at 1', () => {
    expect(cycleBarLayout(refRow(), 30).trackWidth).toBeCloseTo(26 / 30, 6)
    expect(cycleBarLayout(refRow(), 20).trackWidth).toBe(1)
    expect(cycleBarLayout(refRow(), 26).trackWidth).toBe(1)
  })

  it('single-record row falls back to period length for the track', () => {
    const l = cycleBarLayout(refRow({ cycleLength: null }), 5)
    expect(l.trackWidth).toBe(1)
    expect(l.periodEnd).toBe(1)
    expect(l.showFertile).toBe(false)
  })
})

describe('forecastWindow (infinite future predictions)', () => {
  // Three 28-day cycles starting Jan 3, Jan 31, Feb 28 → avg 28, avg period 2.
  const threeCycles = [
    '2026-01-03', '2026-01-04',
    '2026-01-31', '2026-02-01',
    '2026-02-28', '2026-03-01',
  ].map((d) => day(d))

  it('no periods ever logged → empty forecast', () => {
    const f = forecastWindow([], undefined, '2026-01-01', '2027-12-31')
    expect(f.predictedDays).toEqual([])
    expect(f.fertileDays).toEqual([])
    expect(f.safeDays).toEqual([])
    expect(f.ovulationDays).toEqual([])
  })

  it('empty window (toISO < fromISO) → empty forecast', () => {
    const f = forecastWindow(threeCycles, undefined, '2030-01-01', '2026-01-01')
    expect(f.predictedDays).toEqual([])
  })

  it('single cycle → first predicted period at last.start + 28, period span from logged data', () => {
    const entries = ['2026-01-03', '2026-01-04'].map((d) => day(d))
    const f = forecastWindow(entries, undefined, '2026-01-01', '2026-03-31')
    // last start = Jan 3 → next = Jan 31. The period span mirrors the single
    // logged period's own length (2 days), consistent with the old
    // single-cycle behavior and the Trends average. Walks every 28-day cycle
    // in the window (Jan 31, Feb 28, Mar 28).
    expect(f.predictedDays).toEqual([
      '2026-01-31', '2026-02-01',
      '2026-02-28', '2026-03-01',
      '2026-03-28', '2026-03-29',
    ])
    expect(f.ovulationDays).toEqual(['2026-01-17', '2026-02-14', '2026-03-14'])
    expect(f.fertileDays[0]).toBe('2026-01-12') // ovu − 5 (first cycle)
    // Safe: after fertile end (Jan 18) up to next period start (Jan 31).
    expect(f.safeDays[0]).toBe('2026-01-19')
    expect(f.safeDays.at(-1)).toBe('2026-03-27')
  })

  it('walks forward one cycle per avg length into the far future', () => {
    const f = forecastWindow(threeCycles, undefined, '2026-01-01', '2026-12-31')
    // First predicted start = Feb 28 + 28 = Mar 28; then +28 each cycle.
    expect(f.predictedDays.includes('2026-03-28')).toBe(true)
    expect(f.predictedDays.includes('2026-03-29')).toBe(true)
    // Next cycle 28 days later.
    expect(f.predictedDays.includes('2026-04-25')).toBe(true)
    // A cycle in December of the same window.
    expect(f.predictedDays.includes('2026-12-05')).toBe(true)
    // One ovulation per predicted cycle, 28 apart.
    expect(f.ovulationDays[0]).toBe('2026-03-14') // Mar 28 − 14
    expect(f.ovulationDays).toHaveLength(10) // Mar 28 … Dec 05 (+ Dec 26 out)
  })

  it('excludes predicted days before the window start (fromISO)', () => {
    // Window starts AFTER the first predicted period, so only later cycles show.
    const f = forecastWindow(threeCycles, undefined, '2026-04-01', '2026-06-30')
    expect(f.predictedDays.includes('2026-03-28')).toBe(false)
    expect(f.predictedDays[0]).toBe('2026-04-25')
  })

  it('period span uses the average logged period length (not default)', () => {
    const f = forecastWindow(threeCycles, undefined, '2026-01-01', '2026-04-30')
    // Avg period length = 2 → each predicted period is 2 days.
    expect(f.predictedDays.slice(0, 2)).toEqual(['2026-03-28', '2026-03-29'])
    expect(f.predictedDays[2]).toBe('2026-04-25') // next cycle
    expect(f.predictedDays.includes('2026-03-30')).toBe(false)
  })

  it('honors the user default settings when data is thin', () => {
    const entries = ['2026-01-03', '2026-01-04'].map((d) => day(d))
    const settings = { ...DEFAULT_SETTINGS, cycleLength: 35, periodLength: 4 }
    const f = forecastWindow(entries, settings, '2026-01-01', '2026-04-30')
    // Single cycle → cycleLength 35 (settings default; no start-to-start gap);
    // first prediction Jan 3 + 35 = Feb 7, then 35-day cycles through the
    // window (Feb 7, Mar 14, Apr 18). Period span mirrors the logged period
    // length (2), not the settings.periodLength.
    expect(f.predictedDays).toEqual([
      '2026-02-07', '2026-02-08',
      '2026-03-14', '2026-03-15',
      '2026-04-18', '2026-04-19',
    ])
  })
})