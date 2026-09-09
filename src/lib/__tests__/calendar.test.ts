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

  it('keeps highlighted range end caps rounded while shared edges stay flush', () => {
    expect(source).toContain('backgroundColor: calStyle.monthTint')
    expect(source).toContain('borderRadius: `${seg.tl ? 16 : 0}px ${seg.tr ? 16 : 0}px ${seg.br ? 16 : 0}px ${seg.bl ? 16 : 0}px`')
    expect(source).not.toContain('tintCutsByRow')
  })
})
