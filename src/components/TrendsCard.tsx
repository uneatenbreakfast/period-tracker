import { useMemo, useState } from 'react'
import type { CalendarStyle, Settings, Snapshot } from '../types'
import { cycleBarLayout, cycleTrends, type CycleTrendRow } from '../lib/cycle'
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
  value: string
  unit: string
  label: string
  testId: string
}

/** Fitbit-style flat stat: icon top-left, bold value below it, label under the value. */
function StatTile({ icon, value, unit, label, testId }: StatTileProps) {
  return (
    <div className="flex items-start gap-2.5" data-testid={testId}>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center">{icon}</span>
      <span className="min-w-0">
        <span className="block text-lg font-extrabold leading-6 tracking-tight text-[#3d4147]">
          {value}
          {unit ? <span className="ml-1 text-xs font-bold text-[#8b9198]">{unit}</span> : null}
        </span>
        <span className="mt-0.5 block text-[11px] font-semibold leading-4 text-[#8b9198]">{label}</span>
      </span>
    </div>
  )
}

function CycleBar({
  row,
  style,
  maxLen,
}: {
  row: CycleTrendRow
  style: CalendarStyle
  maxLen: number
}) {
  const l = cycleBarLayout(row, maxLen)
  return (
    <div
      className="relative mt-4 h-4 rounded-full bg-[#e7ebee]"
      style={{ width: `${l.trackWidth * 100}%` }}
      data-testid={`cycle-bar-${row.start}`}
    >
      <div
        className="absolute inset-y-0 left-0 rounded-l-full"
        style={{ width: `${l.periodEnd * 100}%`, backgroundColor: style.period }}
        data-testid="cycle-bar-period"
      />
      {l.showFertile && (
        <div
          className="absolute inset-y-0 rounded-full"
          style={{
            left: `${l.fertileStart * 100}%`,
            width: `${(l.fertileEnd - l.fertileStart) * 100}%`,
            backgroundColor: style.trendFertile,
          }}
          data-testid="cycle-bar-fertile"
        />
      )}
      <DropletIcon
        className="absolute left-0 top-1/2 z-10 h-5 w-5 -translate-x-1/2 -translate-y-1/2 text-white"
        aria-label="Period start"
      />
      {l.showFertile && (
        <HeartIcon
          className="absolute top-1/2 z-10 h-5 w-5 translate-x-1/2 -translate-y-1/2 text-white"
          style={{ right: `${(1 - l.fertileEnd) * 100}%` }}
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
  const maxLen = useMemo(
    () => rows.reduce((m, r) => Math.max(m, r.cycleLength ?? r.periodLength), 0),
    [rows],
  )

  if (rows.length === 0) {
    return (
      <div className="-mx-4 rounded-3xl border-2 border-dashed border-rose-200 bg-rose-50/50 p-6 text-center">
        <p className="text-3xl">📊</p>
        <p className="mt-2 text-sm font-semibold text-ink">No trends yet</p>
        <p className="mt-1 text-sm text-ink-soft">
          Log a couple of cycles on the calendar to see averages and cycle history here.
        </p>
      </div>
    )
  }

  const statsTile = (testId: string, icon: React.ReactNode, value: string | null, unit: string, label: string) => (
    <StatTile testId={testId} icon={icon} value={value ?? '—'} unit={value === null ? '' : unit} label={label} />
  )

  return (
    <div className="-mx-4 bg-white px-4 pb-6 pt-4" data-testid="trends-panel">
      <div className="grid grid-cols-2 gap-x-2.5 gap-y-4">
        {statsTile(
          'stat-period',
          <DropletIcon className="h-9 w-9" style={{ color: settings.style.period }} />,
          stats.avgPeriodLength === null ? null : String(stats.avgPeriodLength),
          'Days',
          'Average Period Length',
        )}
        {statsTile(
          'stat-ovulation',
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#41b4e6]">
            <HeartIcon className="h-5 w-5 text-white" />
          </span>,
          stats.avgOvulationDay === null ? null : ordinal(stats.avgOvulationDay),
          'Day',
          'Average Estimated Ovulation',
        )}
        {statsTile(
          'stat-cycle',
          <CalendarIcon className="h-9 w-9 text-[#5a5a5f]" />,
          stats.avgCycleLength === null ? null : String(stats.avgCycleLength),
          'Days',
          'Average Cycle Length',
        )}
      </div>

      <h2 className="-mx-4 mt-5 bg-[#f3f3f3] px-4 py-[17px] text-xs font-bold uppercase tracking-wider text-[#677070]">
        My cycles
      </h2>
      <ul className="mt-3 space-y-3">
        {[...rows].reverse().map((row) => (
          <li key={row.start} className="rounded-2xl bg-white px-3.5 pb-3 pt-3 shadow-[0_3px_10px_rgba(0,0,0,0.06)]">
            <button
              type="button"
              onClick={() => setOpenStart(openStart === row.start ? null : row.start)}
              className="w-full text-left"
              data-testid={`cycle-row-${row.start}`}
              aria-expanded={openStart === row.start}
            >
              <span className="block text-[15px] font-bold leading-6 text-[#4b4e57]">
                {formatRange(row.start, row.end)}
              </span>
              <span className="mt-1 flex items-center justify-between gap-2">
                <span className="min-w-0 flex-1 truncate text-[11px] font-semibold leading-5 text-[#4a4e58]">
                  Period: {row.periodLength} Days | Ovulation:{' '}
                  {row.ovulationDay === null ? '—' : `${ordinal(row.ovulationDay)} Day`} | Cycle length:{' '}
                  {row.cycleLength === null ? '—' : `${row.cycleLength} Days`}
                </span>
                <span
                  className={`shrink-0 text-lg leading-none text-[#878787] transition-transform duration-150 ${
                    openStart === row.start ? 'rotate-90' : ''
                  }`}
                  aria-hidden
                >
                  ›
                </span>
              </span>
              <CycleBar row={row} style={settings.style} maxLen={maxLen} />
            </button>
            {openStart === row.start && row.nextStart && (
              <div
                className="mt-3 flex flex-col gap-1 rounded-xl bg-[#f5f6f7] px-3 py-2.5 text-xs font-medium text-[#6e747a]"
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