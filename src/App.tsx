import { useEffect, useMemo, useState } from 'react'
import type { FlowLevel, Snapshot } from './types'
import Calendar from './components/Calendar'
import DaySheet from './components/DaySheet'
import HistoryCard from './components/HistoryCard'
import MenstrualHealthCard from './components/MenstrualHealthCard'
import TrendsCard from './components/TrendsCard'
import { addDays, addMonths, fromISODate, monthList, todayISO } from './lib/dates'
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
  const [tab, setTab] = useState<'calendar' | 'trends'>('calendar')
  const now = new Date()

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

  // Scrollable calendar: today − 12 months … today + 12 months, extended back to
  // one month before the earliest logged entry so history stays reachable.
  const months = useMemo(() => {
    const start = addMonths(now.getFullYear(), now.getMonth(), -12)
    const end = addMonths(now.getFullYear(), now.getMonth(), 12)
    const earliest = snap.entries.reduce<string | null>(
      (min, e) => (min === null || e.date < min ? e.date : min),
      null,
    )
    if (earliest) {
      const d = fromISODate(earliest)
      const em = addMonths(d.getFullYear(), d.getMonth(), -1)
      if (em.year < start.year || (em.year === start.year && em.month < start.month)) {
        start.year = em.year
        start.month = em.month
      }
    }
    return monthList(start, end)
  }, [snap.entries, now.getFullYear(), now.getMonth()])

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

  const scrollToMonth = (year: number, month: number) => {
    document.querySelector(`[data-month="${year}-${month}"]`)?.scrollIntoView({ block: 'start' })
  }

  useEffect(() => {
    // land on the current month when the calendar first renders
    const id = requestAnimationFrame(() => scrollToMonth(now.getFullYear(), now.getMonth()))
    return () => cancelAnimationFrame(id)
  }, [])

  return (
    <div className="mx-auto min-h-dvh w-full max-w-md px-4 py-6">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight text-ink">
            <span className="text-rose-400">🌸</span> Bloom
          </h1>
          <p className="text-xs text-ink-soft">period tracking, softly</p>
        </div>
        {tab === 'calendar' && (
          <button
            type="button"
            onClick={() => scrollToMonth(now.getFullYear(), now.getMonth())}
            aria-label="Scroll to today"
            className="rounded-full bg-white px-4 py-1.5 text-xs font-bold text-rose-500 shadow-[0_4px_14px_rgba(217,111,147,0.15)] transition-colors hover:bg-rose-50"
          >
            Today
          </button>
        )}
      </header>

      <nav className="mb-5 flex gap-8 border-b border-rose-100" aria-label="Views">
        <button
          type="button"
          onClick={() => setTab('calendar')}
          className={`-mb-px border-b-2 pb-2.5 text-sm font-extrabold uppercase tracking-wider transition-colors ${
            tab === 'calendar' ? 'border-rose-500 text-ink' : 'border-transparent text-ink-soft hover:text-rose-500'
          }`}
        >
          Calendar
        </button>
        <button
          type="button"
          onClick={() => setTab('trends')}
          className={`-mb-px border-b-2 pb-2.5 text-sm font-extrabold uppercase tracking-wider transition-colors ${
            tab === 'trends' ? 'border-rose-500 text-ink' : 'border-transparent text-ink-soft hover:text-rose-500'
          }`}
        >
          Trends
        </button>
      </nav>

      {tab === 'trends' ? (
        <main className="flex flex-col gap-4">
          <TrendsCard snap={snap} />
          <footer className="pb-2 pt-1 text-center text-[11px] text-ink-soft/70">
            Logged {snap.entries.length} day{snap.entries.length === 1 ? '' : 's'} · stored locally on this device
          </footer>
        </main>
      ) : (
        <main className="flex flex-col gap-4">
        <Calendar
          months={months}
          snap={snap}
          prediction={prediction}
          predictedDays={predictedDays}
          fertileDays={fertileDays}
          selectedDate={selectedDate}
          onSelect={setSelectedDate}
        />
        <MenstrualHealthCard
          prediction={prediction}
          entryCount={snap.entries.length}
          snap={snap}
          onLogToConfirm={() => setSelectedDate(todayISO())}
        />
        <HistoryCard snap={snap} />
        <footer className="pb-2 pt-1 text-center text-[11px] text-ink-soft/70">
          Logged {snap.entries.length} day{snap.entries.length === 1 ? '' : 's'} · stored locally on this device
        </footer>
      </main>
      )}

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