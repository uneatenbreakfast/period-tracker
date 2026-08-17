import { useMemo } from 'react'
import type { Snapshot } from '../types'
import { cycleHistoryRows } from '../lib/ui'

interface HistoryCardProps {
  snap: Snapshot
}

export default function HistoryCard({ snap }: HistoryCardProps) {
  const rows = useMemo(() => cycleHistoryRows(snap), [snap.entries])

  if (rows.length === 0) return null

  return (
    <div className="rounded-3xl bg-white p-5 shadow-[0_6px_24px_rgba(217,111,147,0.12)]">
      <h2 className="mb-3 text-sm font-extrabold uppercase tracking-wider text-ink-soft">Cycle history</h2>
      <ul className="divide-y divide-rose-50">
        {[...rows].reverse().map((r) => (
          <li key={r.label} className="flex items-center justify-between py-2.5 text-sm">
            <span className="font-semibold text-ink">{r.label}</span>
            <span className="text-ink-soft">started {r.startLabel}</span>
            <span
              className={`rounded-full px-3 py-1 text-xs font-bold ${
                r.cycleLength === null ? 'bg-cream text-ink-soft' : 'bg-rose-50 text-rose-700'
              }`}
            >
              {r.cycleLength === null ? '—' : `${r.cycleLength} days`}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}