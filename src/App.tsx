import { useEffect, useMemo, useRef, useState } from 'react'
import type { FlowLevel, Snapshot } from './types'
import Calendar from './components/Calendar'
import DaySheet from './components/DaySheet'
import HistoryCard from './components/HistoryCard'
import MenstrualHealthCard from './components/MenstrualHealthCard'
import SettingsCard from './components/SettingsCard'
import TrendsCard from './components/TrendsCard'
import { addDays, todayISO } from './lib/dates'
import { detectCycles, predictNext } from './lib/cycle'
import { DEFAULT_FLOW } from './lib/symptoms'
import { nextTab, prevTab, swipeDirection } from './lib/swipeTabs'
import {
  captureDeletedEntries,
  createLocalStorageAdapter,
  deleteRangeFlow,
  getEntry,
  loadSnapshot,
  parseSnapshot,
  removeEntry,
  replaceRangeFlow,
  saveSnapshot,
  serializeSnapshot,
  upsertEntry,
  upsertReact,
} from './lib/storage'

const storage = createLocalStorageAdapter()

// Injected at build time by vite.config.ts define — build counter from VERSION.
declare const __APP_VERSION__: number

export default function App() {
  const [snap, setSnap] = useState<Snapshot>(() => loadSnapshot(storage))
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [tab, setTab] = useState<'calendar' | 'health' | 'trends' | 'settings'>('calendar')
  const now = new Date()

  useEffect(() => saveSnapshot(snap, storage), [snap])

  const prediction = useMemo(() => predictNext(snap.entries, snap.settings), [snap.entries, snap.settings])

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

  // Safe days: luteal phase post-fertile window until predicted period start
  const safeDays = useMemo(() => {
    if (!snap.settings.showSafeDays) return []
    if (!prediction.fertileWindow || !prediction.nextPeriodStart) return []
    const days: string[] = []
    for (let d = addDays(prediction.fertileWindow.end, 1); d < prediction.nextPeriodStart; d = addDays(d, 1)) {
      days.push(d)
    }
    return days
  }, [snap.settings.showSafeDays, prediction.fertileWindow, prediction.nextPeriodStart])

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

  // Undo toast state — captures entries cleared by a destructive operation
  // so the user can restore them within a short window.
  const [undoState, setUndoState] = useState<{
    entries: Snapshot['entries']
    message: string
  } | null>(null)

  const dismissUndo = () => setUndoState(null)

  const performUndo = () => {
    if (!undoState) return
    setSnap((s) => {
      let next = s
      // Restore entries that were cleared by the operation
      for (const e of undoState.entries) {
        next = upsertEntry(next, e)
      }
      return next
    })
    setUndoState(null)
  }

  // Drag across calendar days: additive — the range is added without clearing
  // any other period days in the same month (multiple ranges can coexist).
  const commitRange = (start: string, end: string) => {
    setSnap((s) => replaceRangeFlow(s, start, end, DEFAULT_FLOW))
    setUndoState(null)
  }

  // Delete button in edit mode: clears the committed range entirely.
  const deleteRange = (start: string, end: string) => {
    const deleted = captureDeletedEntries(snap, start, end)
    setSnap((s) => deleteRangeFlow(s, start, end))
    if (deleted.length > 0) {
      setUndoState({
        entries: deleted,
        message: `Deleted ${deleted.length} day${deleted.length === 1 ? '' : 's'}`,
      })
    } else {
      setUndoState(null)
    }
  }

  const handleExport = () => {
    const json = serializeSnapshot(snap)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `bloom-backup-${todayISO()}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleImport = (file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result
      if (typeof text !== 'string') return
      const parsed = parseSnapshot(text)
      if (!parsed) {
        alert('Invalid backup file. Please select a valid Bloom export.')
        return
      }
      if (confirm(`Import ${parsed.entries.length} days of data? This will replace your current data.`)) {
        setSnap(parsed)
      }
    }
    reader.readAsText(file)
  }

  const scrollToMonth = (year: number, month: number) => {
    // scroll the calendar's inner box (data-calendar-scroll), not the page.
    // rect-based: current positions already reflect current scrollTop, so the
    // delta is exact (offsetTop is unreliable across the scroll container).
    const scroller = document.querySelector<HTMLElement>('[data-calendar-scroll]')
    const el = document.querySelector<HTMLElement>(`[data-month="${year}-${month}"]`)
    if (!el) return
    if (scroller) {
      scroller.scrollTop += el.getBoundingClientRect().top - scroller.getBoundingClientRect().top
    } else {
      el.scrollIntoView({ block: 'start' })
    }
  }

  // Horizontal swipe on tab content switches tabs. Gestures that START inside
  // the calendar component never navigate — the calendar owns its touches
  // (vertical scroll, long-press range drag).
  const gestureRef = useRef<{ x0: number; y0: number; x: number; y: number } | null>(null)

  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) {
      gestureRef.current = null
      return
    }
    if ((e.target as HTMLElement).closest('[data-calendar]')) {
      gestureRef.current = null
      return
    }
    const t = e.touches[0]
    gestureRef.current = { x0: t.clientX, y0: t.clientY, x: t.clientX, y: t.clientY }
  }

  const onTouchMove = (e: React.TouchEvent) => {
    const g = gestureRef.current
    if (!g) return
    const t = e.touches[0]
    g.x = t.clientX
    g.y = t.clientY
  }

  const onTouchEnd = () => {
    const g = gestureRef.current
    gestureRef.current = null
    if (!g) return
    const dir = swipeDirection(g.x - g.x0, g.y - g.y0)
    if (dir === 'left') setTab((t) => nextTab(t))
    else if (dir === 'right') setTab((t) => prevTab(t))
  }

  const onTouchCancel = () => {
    gestureRef.current = null
  }

  const swipeProps = {
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    onTouchCancel,
  }

  useEffect(() => {
    // land on the current month when the calendar first renders
    const id = requestAnimationFrame(() => scrollToMonth(now.getFullYear(), now.getMonth()))
    return () => cancelAnimationFrame(id)
  }, [])

  return (
    <div
      className={`mx-auto w-full max-w-md px-4 py-6 ${
        tab === 'calendar' ? 'flex h-dvh flex-col' : 'min-h-dvh'
      }`}
    >
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
          onClick={() => setTab('health')}
          className={`-mb-px border-b-2 pb-2.5 text-sm font-extrabold uppercase tracking-wider transition-colors ${
            tab === 'health' ? 'border-rose-500 text-ink' : 'border-transparent text-ink-soft hover:text-rose-500'
          }`}
        >
          Health
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
        <button
          type="button"
          onClick={() => setTab('settings')}
          className={`-mb-px border-b-2 pb-2.5 text-sm font-extrabold uppercase tracking-wider transition-colors ${
            tab === 'settings' ? 'border-rose-500 text-ink' : 'border-transparent text-ink-soft hover:text-rose-500'
          }`}
        >
          Settings
        </button>
      </nav>

      {tab === 'trends' ? (
        <main {...swipeProps} className="flex flex-col gap-4">
          <TrendsCard snap={snap} settings={snap.settings} />
          <footer className="pb-2 pt-1 text-center text-[11px] text-ink-soft/70">
            Logged {snap.entries.length} day{snap.entries.length === 1 ? '' : 's'} · stored locally on this device
          </footer>
        </main>
      ) : tab === 'settings' ? (
        <main {...swipeProps} className="flex flex-col gap-4">
          <SettingsCard
            settings={snap.settings}
            onChange={(settings) => setSnap((s) => ({ ...s, settings }))}
            onExport={handleExport}
            onImport={handleImport}
          />
          <footer className="pb-2 pt-1 text-center text-[11px] text-ink-soft/70">
            Logged {snap.entries.length} day{snap.entries.length === 1 ? '' : 's'} · stored locally on this device
          </footer>
        </main>
      ) : tab === 'health' ? (
        <main {...swipeProps} className="flex flex-col gap-4">
          <MenstrualHealthCard
            prediction={prediction}
            entryCount={snap.entries.length}
            snap={snap}
            settings={snap.settings}
            onLogToConfirm={() => setSelectedDate(todayISO())}
          />
          <HistoryCard snap={snap} />
          <footer className="pb-2 pt-1 text-center text-[11px] text-ink-soft/70">
            Logged {snap.entries.length} day{snap.entries.length === 1 ? '' : 's'} · stored locally on this device
          </footer>
        </main>
      ) : (
        <main {...swipeProps} className="flex min-h-0 flex-1 flex-col gap-4">
          <Calendar
            snap={snap}
            prediction={prediction}
            predictedDays={predictedDays}
            fertileDays={fertileDays}
            safeDays={safeDays}
            selectedDate={selectedDate}
            onSelect={setSelectedDate}
            onRangeComplete={commitRange}
            onRangeDelete={deleteRange}
            maxPeriodDays={snap.settings.periodLength}
            undoState={undoState}
            onUndo={performUndo}
            onDismissUndo={dismissUndo}
          />
          <footer className="shrink-0 pb-2 pt-1 text-center text-[11px] text-ink-soft/70">
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

      <span className="pointer-events-none fixed bottom-1 left-2 z-50 font-mono text-[10px] text-ink-soft">
        v{__APP_VERSION__}
      </span>
    </div>
  )
}