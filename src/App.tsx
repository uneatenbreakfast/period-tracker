import { useEffect, useMemo, useState } from 'react'
import type { FlowLevel, Snapshot } from './types'
import Calendar from './components/Calendar'
import DaySheet from './components/DaySheet'
import HistoryCard from './components/HistoryCard'
import MenstrualHealthCard from './components/MenstrualHealthCard'
import { addDays, MONTH_NAMES, todayISO } from './lib/dates'
import { detectCycles, predictNext } from './lib/cycle'
import {
  createLocalStorageAdapter,
  getEntry,
  loadSnapshot,
  removeEntry,
  saveSnapshot,
  upsertReact,
} from './lib/storage'

const storage = createLocalStorageAdapter()

export default function App() {
  const [snap, setSnap] = useState<Snapshot>(() => loadSnapshot(storage))
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const now = new Date()
  const [viewYear, setViewYear] = useState(now.getFullYear())
  const [viewMonth, setViewMonth] = useState(now.getMonth())

  useEffect(() => saveSnapshot(snap, storage), [snap])

  const prediction = useMemo(() => predictNext(snap.entries), [snap.entries])

  const predictedDays = useMemo(() => {
    const last = detectCycles(snap.entries).at(-1)
    if (!prediction.nextPeriodStart || !last) return []
    const days: string[] = []
    for (let i = 0; i < last.length; i++) days.push(addDays(prediction.nextPeriodStart, i))
    return days
  }, [snap.entries, prediction.nextPeriodStart])

  const fertileDays = useMemo(() => {
    const w = prediction.fertileWindow
    if (!w) return []
    const days: string[] = []
    for (let d = w.start; d <= w.end; d = addDays(d, 1)) days.push(d)
    return days
  }, [prediction.fertileWindow])

  const selectedEntry = selectedDate ? getEntry(snap, selectedDate) : undefined

  const apply = (date: string, patch: Partial<Snapshot['entries'][number]>) => {
    setSnap((s) => upsertReact(s, date, patch))
  }

  const toggleFlow = (flow: FlowLevel) => {
    if (!selectedDate) return
    const entry = getEntry(snap, selectedDate)
    if (entry?.flow === flow) {
      // tapping the active flow clears it; drop the day if nothing else remains
      setSnap((s) => {
        const next = upsertReact(s, selectedDate, { flow: undefined })
        const e = getEntry(next, selectedDate)
        if (e && !e.flow && e.symptoms.length === 0 && !e.notes) return removeEntry(next, selectedDate)
        return next
      })
    } else {
      apply(selectedDate, { flow })
    }
  }

  const toggleSymptom = (key: string) => {
    if (!selectedDate) return
    const entry = getEntry(snap, selectedDate)
    const symptoms = entry?.symptoms.includes(key)
      ? entry.symptoms.filter((k) => k !== key)
      : [...(entry?.symptoms ?? []), key]
    apply(selectedDate, { symptoms })
  }

  const saveNotes = (notes: string) => {
    if (!selectedDate) return
    setSnap((s) => {
      const next = upsertReact(s, selectedDate, { notes })
      const e = getEntry(next, selectedDate)
      if (e && !e.flow && e.symptoms.length === 0 && !e.notes) return removeEntry(next, selectedDate)
      return next
    })
  }

  const clearDay = () => {
    if (!selectedDate) return
    setSnap((s) => removeEntry(s, selectedDate))
  }

  const nav = (dir: -1 | 1) => {
    const d = new Date(viewYear, viewMonth + dir, 1)
    setViewYear(d.getFullYear())
    setViewMonth(d.getMonth())
  }

  return (
    <div className="mx-auto min-h-dvh w-full max-w-md px-4 py-6">
      <header className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight text-ink">
            <span className="text-rose-400">🌸</span> Bloom
          </h1>
          <p className="text-xs text-ink-soft">period tracking, softly</p>
        </div>
        <div className="flex items-center gap-1 rounded-full bg-white p-1 shadow-[0_4px_14px_rgba(217,111,147,0.15)]">
          <button
            type="button"
            onClick={() => nav(-1)}
            className="rounded-full px-3 py-1.5 text-ink-soft transition-colors hover:bg-rose-50 hover:text-rose-500"
            aria-label="Previous month"
          >
            ‹
          </button>
          <span className="min-w-28 text-center text-sm font-bold text-ink">
            {MONTH_NAMES[viewMonth]} {viewYear}
          </span>
          <button
            type="button"
            onClick={() => nav(1)}
            className="rounded-full px-3 py-1.5 text-ink-soft transition-colors hover:bg-rose-50 hover:text-rose-500"
            aria-label="Next month"
          >
            ›
          </button>
        </div>
      </header>

      <main className="flex flex-col gap-4">
        <Calendar
          year={viewYear}
          month={viewMonth}
          snap={snap}
          prediction={prediction}
          predictedDays={predictedDays}
          fertileDays={fertileDays}
          selectedDate={selectedDate}
          onSelect={setSelectedDate}
        />
        {viewMonth !== now.getMonth() || viewYear !== now.getFullYear() ? (
          <button
            type="button"
            onClick={() => {
              setViewYear(now.getFullYear())
              setViewMonth(now.getMonth())
            }}
            className="self-center rounded-full bg-white px-4 py-1.5 text-xs font-bold text-rose-500 shadow-[0_4px_14px_rgba(217,111,147,0.15)] transition-colors hover:bg-rose-50"
          >
            Back to today
          </button>
        ) : null}
        <PredictionsCard prediction={prediction} entryCount={snap.entries.length} />
        <HistoryCard snap={snap} />
        <footer className="pb-2 pt-1 text-center text-[11px] text-ink-soft/70">
          Logged {snap.entries.length} day{snap.entries.length === 1 ? '' : 's'} · stored locally on this device
        </footer>
      </main>

      {selectedDate && (
        <DaySheet
          date={selectedDate}
          entry={selectedEntry}
          onToggleFlow={toggleFlow}
          onToggleSymptom={toggleSymptom}
          onSaveNotes={saveNotes}
          onClearDay={() => {
            clearDay()
            setSelectedDate(null)
          }}
          onClose={() => setSelectedDate(null)}
        />
      )}
    </div>
  )
}