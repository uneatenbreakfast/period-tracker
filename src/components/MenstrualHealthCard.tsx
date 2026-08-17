import { useMemo } from 'react'
import type { Prediction, Snapshot } from '../types'
import { cycleDayInfo, type CycleDayInfo, type CyclePhase } from '../lib/cycle'
import { diffDays, todayISO } from '../lib/dates'
import { getEntry } from '../lib/storage'
import { formatShort } from '../lib/ui'

const PHASE_COLORS: Record<CyclePhase, string> = {
  period: '#e58aa8', // rose-400
  follicular: '#e4dcf3', // lavender-100
  ovulation: '#f4a88e', // peach-400
  luteal: '#8fae8b', // sage-400
}
const TRACK_COLOR = '#f2e7e3' // unfilled ring track

const SIZE = 120
const CENTER = SIZE / 2
const RADIUS = 46
const CIRCUMFERENCE = 2 * Math.PI * RADIUS
const SEGMENT_GAP = 2.5

function CycleRing({ info }: { info: CycleDayInfo | null }) {
  const total = info?.cycleLength ?? 1
  const segments = info?.segments ?? []

  let offset = 0
  const arcs = segments.map((s) => {
    const frac = (s.end - s.start) / total
    const dash = Math.max(frac * CIRCUMFERENCE - SEGMENT_GAP, 0)
    const el = (
      <circle
        key={s.phase}
        cx={CENTER}
        cy={CENTER}
        r={RADIUS}
        fill="none"
        stroke={PHASE_COLORS[s.phase]}
        strokeWidth={10}
        strokeLinecap="round"
        strokeDasharray={`${dash} ${CIRCUMFERENCE - dash}`}
        strokeDashoffset={-offset}
        transform={`rotate(-90 ${CENTER} ${CENTER})`}
      />
    )
    offset += frac * CIRCUMFERENCE
    return el
  })

  const day = info?.dayInCycle
  const angle = day !== undefined ? (day / total) * 2 * Math.PI - Math.PI / 2 : null
  const dot =
    angle === null ? null : (
      <circle
        cx={CENTER + RADIUS * Math.cos(angle)}
        cy={CENTER + RADIUS * Math.sin(angle)}
        r={5}
        fill="#57424e" // ink — current position
        stroke="#fff"
        strokeWidth={2}
      />
    )

  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="h-28 w-28 shrink-0" aria-label="Cycle progress ring">
      <circle cx={CENTER} cy={CENTER} r={RADIUS} fill="none" stroke={TRACK_COLOR} strokeWidth={10} />
      {arcs}
      <g transform={`translate(${CENTER} ${CENTER})`}>
        <svg viewBox="0 0 24 24" className="h-7 w-7" fill="#d96f93" aria-hidden>
          <path d="M12 2c.5 4.5 5.5 8.5 5.5 13a5.5 5.5 0 0 1-11 0C6.5 10.5 11.5 6.5 12 2z" />
        </svg>
      </g>
      {dot}
    </svg>
  )
}

interface MenstrualHealthCardProps {
  prediction: Prediction
  entryCount: number
  snap: Snapshot
  /** Open the day sheet for today so the user can log flow ("Log to confirm"). */
  onLogToConfirm: () => void
}

export default function MenstrualHealthCard({
  prediction,
  entryCount,
  snap,
  onLogToConfirm,
}: MenstrualHealthCardProps) {
  const today = todayISO()
  const info = useMemo(() => cycleDayInfo(snap.entries, today), [snap.entries, today])
  const loggedToday = getEntry(snap, today)?.flow !== undefined
  const next = prediction.nextPeriodStart

  if (entryCount === 0) {
    return (
      <div className="rounded-3xl border-2 border-dashed border-rose-200 bg-rose-50/50 p-6 text-center">
        <p className="text-3xl">🌸</p>
        <p className="mt-2 text-sm font-semibold text-ink">Welcome to Bloom</p>
        <p className="mt-1 text-sm text-ink-soft">
          Tap a day on the calendar to log your period flow and symptoms. After a couple of cycles, predictions will
          appear here.
        </p>
      </div>
    )
  }

  const due = next !== null && next <= today
  const daysLate = next === null ? null : Math.max(0, diffDays(today, next))
  const fertile = prediction.fertileWindow

  let headline = 'Predicted period'
  let subtext: string
  let showConfirm = false
  if (next === null) {
    headline = 'Waiting for data'
    subtext = 'Log one more cycle to predict your next period'
  } else if (loggedToday && due) {
    subtext = 'Logged today — period confirmed'
  } else if (next === today) {
    subtext = 'Today · Log to confirm'
    showConfirm = true
  } else if (due) {
    subtext = `${daysLate} ${daysLate === 1 ? 'day' : 'days'} ago · Log to confirm`
    showConfirm = true
  } else {
    subtext = `In ${prediction.daysUntil} ${prediction.daysUntil === 1 ? 'day' : 'days'} · ${formatShort(next)}`
  }

  return (
    <div className="rounded-3xl bg-white p-5 shadow-[0_6px_24px_rgba(217,111,147,0.12)]">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-sm font-extrabold uppercase tracking-wider text-ink-soft">Menstrual health</h2>
          <p className="mt-1 text-2xl font-extrabold tracking-tight text-ink">{headline}</p>
          <p className="mt-0.5 text-xs font-semibold text-ink-soft">{subtext}</p>
          {showConfirm && (
            <button
              type="button"
              onClick={onLogToConfirm}
              className="mt-3 rounded-full bg-rose-400 px-5 py-2 text-sm font-bold text-white shadow-[0_3px_10px_rgba(217,111,147,0.4)] transition-colors hover:bg-rose-500"
            >
              Log to confirm
            </button>
          )}
        </div>
        <CycleRing info={info} />
      </div>

      <div className="mt-4 flex flex-col gap-2 border-t border-rose-50 pt-3">
        <div className="flex items-center gap-3 rounded-2xl bg-lavender-50 px-4 py-2.5 text-lavender-700">
          <span className="text-lg">🌸</span>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider opacity-70">Fertile window</p>
            <p className="text-sm font-bold">
              {fertile ? `${formatShort(fertile.start)} – ${formatShort(fertile.end)}` : 'Needs two logged cycles'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-2xl bg-peach-50 px-4 py-2.5 text-peach-400">
          <span className="text-lg">📅</span>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider opacity-70">Average cycle</p>
            <p className="text-sm font-bold">{prediction.avgCycleLength !== null ? `${prediction.avgCycleLength} days` : '—'}</p>
          </div>
        </div>
      </div>
    </div>
  )
}