import { useMemo, useState } from 'react'
import type { CalendarStyle, Settings, Snapshot } from '../types'
import { FERTILE_RANGE, cycleTrends, type CycleTrendRow } from '../lib/cycle'
import { formatDayShort, formatRange, ordinal } from '../lib/ui'

function DropletIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M12 2c.5 4.5 5.5 8.5 5.5 13a5.5 5.5 0 0 1-11 0C6.5 10.5 11.5 6.5 12 2z" />
    </svg>
  )
}

function HeartIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M12 21s-6.7-4.35-9.33-8.11C.9 10.3 2.07 6.9 5.2 6.1c1.9-.5 3.9.1 5.3 1.7l1.5 1.7 1.5-1.7c1.4-1.6 3.4-2.2 5.3-1.7 3.13.8 4.3 4.2 2.53 6.79C18.7 16.65 12 21 12 21z" />
    </svg>
  )
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M3 10h18M8 3v4M16 3v4" strokeLinecap="round" />
    </svg>
  )
}

interface StatTileProps {
  icon: React.ReactNode
  iconClass: string
  value: string
  unit: string
  label: string
  testId: string
}

function StatTile({ icon, iconClass, value, unit, label, testId }: StatTileProps) {
  return (
    <div className="rounded-2xl bg-cream p-4" data-testid={testId}>
      <span className={`inline-flex h-9 w-9 items-center justify-center rounded-full ${iconClass}`}>{icon}</span>
      <p className="mt-2 text-xl font-extrabold tracking-tight text-ink">
        {value}
        {unit ? <span className="ml-1 text-sm font-bold text-ink-soft">{unit}</span> : null}
      </p>
      <p className="mt-0.5 text-[11px] font-semibold leading-tight text-ink-soft">{label}</p>
    </div>
  )
}

function CycleBar({ row, style }: { row: CycleTrendRow; style: CalendarStyle }) {
  const len = row.cycleLength
  const ovulIdx = row.ovulationDay === null ? null : row.ovulationDay - 1 // 0-based
  const periodFrac = len ? row.periodLength / len : 1
  const fertileStartFrac =
    len && ovulIdx !== null ? Math.min(1, Math.max(periodFrac, (ovulIdx - FERTILE_RANGE.before) / len)) : null
  const fertileEndFrac = len && ovulIdx !== null ? Math.min(1, (ovulIdx + FERTILE_RANGE.after + 1) / len) : null
  const showFertile = fertileStartFrac !== null && fertileEndFrac !== null && fertileEndFrac > fertileStartFrac

  return (
    <div className="relative mt-2 h-2.5 rounded-full bg-cream-deep" data-testid={`cycle-bar-${row.start}`}>
      <div
        className="absolute inset-y-0 left-0 rounded-full"
        style={{ width: `${periodFrac * 100}%`, backgroundColor: style.period }}
        data-testid="cycle-bar-period"
      />
      {showFertile && (
        <div
          className="absolute inset-y-0 rounded-full"
          style={{ left: `${fertileStartFrac! * 100}%`, width: `${(fertileEndFrac! - fertileStartFrac!) * 100}%`, backgroundColor: style.trendFertile }}
          data-testid="cycle-bar-fertile"
        />
      )}
      <DropletIcon
        className="absolute h-4 w-4"
        style={{ left: '0%', top: '50%', transform: 'translateY(-50%)', color: style.period }}
        aria-label="Period start"
      />
      {len && ovulIdx !== null && (
        <HeartIcon
          className="absolute h-4 w-4"
          style={{ left: `${(ovulIdx / len) * 100}%`, top: '50%', transform: 'translate(-50%, -50%)', color: style.trendOvulation }}
          aria-label="Ovulation day"
        />
      )}
    </div>
  )
}

interface TrendsCardProps {
  snap: Snapshot
  /** User prediction defaults — seed the trends averages when data is thin (BLOOM-0002). */
  settings: Settings
}

export default function TrendsCard({ snap, settings }: TrendsCardProps) {
  const { rows, stats } = useMemo(() => cycleTrends(snap.entries, settings), [snap.entries, settings])
  const [openStart, setOpenStart] = useState<string | null>(null)

  if (rows.length === 0) {
    return (
      <div className="rounded-3xl border-2 border-dashed border-rose-200 bg-rose-50/50 p-6 text-center">
        <p className="text-3xl">📊</p>
        <p className="mt-2 text-sm font-semibold text-ink">No trends yet</p>
        <p className="mt-1 text-sm text-ink-soft">
          Log a couple of cycles on the calendar to see averages and cycle history here.
        </p>
      </div>
    )
  }

  const statsTile = (testId: string, icon: React.ReactNode, iconClass: string, value: string | null, unit: string, label: string) => (
    <StatTile
      testId={testId}
      icon={icon}
      iconClass={iconClass}
      value={value ?? '—'}
      unit={value === null ? '' : unit}
      label={label}
    />
  )

  return (
    <div className="rounded-3xl bg-white p-5 shadow-[0_6px_24px_rgba(217,111,147,0.12)]">
      <div className="grid grid-cols-2 gap-3">
        {statsTile(
          'stat-period',
          <DropletIcon className="h-4.5 w-4.5" />,
          'bg-rose-50 text-rose-500',
          stats.avgPeriodLength === null ? null : String(stats.avgPeriodLength),
          'Days',
          'Average Period Length',
        )}
        {statsTile(
          'stat-ovulation',
          <HeartIcon className="h-4.5 w-4.5" />,
          'bg-peach-50 text-peach-400',
          stats.avgOvulationDay === null ? null : ordinal(stats.avgOvulationDay),
          'Day',
          'Average Estimated Ovulation',
        )}
        {statsTile(
          'stat-cycle',
          <CalendarIcon className="h-4.5 w-4.5" />,
          'bg-sage-50 text-sage-400',
          stats.avgCycleLength === null ? null : String(stats.avgCycleLength),
          'Days',
          'Average Cycle Length',
        )}
      </div>

      <h2 className="mb-1 mt-5 text-sm font-extrabold uppercase tracking-wider text-ink-soft">My cycles</h2>
      <ul className="divide-y divide-rose-50">
        {[...rows].reverse().map((row) => (
          <li key={row.start} className="py-3">
            <button
              type="button"
              onClick={() => setOpenStart(openStart === row.start ? null : row.start)}
              className="w-full text-left"
              data-testid={`cycle-row-${row.start}`}
              aria-expanded={openStart === row.start}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold text-ink">{formatRange(row.start, row.end)}</span>
                <span
                  className={`text-lg leading-none text-ink-soft transition-transform duration-150 ${
                    openStart === row.start ? 'rotate-90' : ''
                  }`}
                  aria-hidden
                >
                  ›
                </span>
              </span>
              <span className="mt-0.5 block text-xs font-semibold text-ink-soft">
                Period: {row.periodLength} Days | Ovulation: {row.ovulationDay === null ? '—' : `${ordinal(row.ovulationDay)} Day`} |
                Cycle length: {row.cycleLength === null ? '—' : `${row.cycleLength} Days`}
              </span>
              <CycleBar row={row} style={settings.style} />
            </button>
            {openStart === row.start && row.nextStart && (
              <div
                className="mt-2.5 flex flex-col gap-1 rounded-2xl bg-cream px-3 py-2.5 text-xs font-semibold text-ink-soft"
                data-testid={`cycle-detail-${row.start}`}
              >
                <span>
                  Fertile window:{' '}
                  {row.fertileWindow
                    ? `${formatDayShort(row.fertileWindow.start)} – ${formatDayShort(row.fertileWindow.end)}`
                    : '—'}
                </span>
                <span>Next period: {formatDayShort(row.nextStart)}</span>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
