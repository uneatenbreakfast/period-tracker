import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const source = fs.readFileSync(path.resolve(__dirname, '../../components/Calendar.tsx'), 'utf8')

describe('calendar ovulation marker', () => {
  it('renders ovulation icon on ovulation day even when day has fertile shape', () => {
    expect(source).toContain('testId="calendar-ovulation-icon"')
    expect(source).not.toContain('{isOvulation && !shape && (')
    expect(source).toContain("aria-label={testId ? 'Ovulation day' : undefined}")
    expect(source).toContain('dataLegend="ovulation"')
    expect(source).toContain('function OvulationMarker')
    expect(source).toContain('className="pointer-events-none absolute right-0.5 top-0.5 z-20"')
    expect(source).not.toContain('right-1 top-1')
  })

  it('renders today as the same selection circle used by selected days', () => {
    expect(source).toContain('const selRingColor = isSelected || isToday')
    expect(source).toContain('{isToday && !isSelected ? (')
    expect(source).toContain('h-8 w-8 rounded-full border-2')
    expect(source).not.toContain('bottom-1 left-1/2 z-10 h-1 w-1')
  })

  it('rounds month-tint corners without sharp L-shaped wraps', () => {
    expect(source).toContain('calStyle.monthTint')
    expect(source).toContain('futureMonthBackground(seg.monthKey, currentMonthKey, calStyle.monthTint, true)')
    expect(source).toContain('borderRadius: `${seg.tl ? TINT_RADIUS_PX')
    expect(source).toContain('tintCutsByRow')
    expect(source).toContain("borderRadius: '50%'")
  })
})
