import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { FlowLevel, Snapshot } from './types'
import Calendar from './components/Calendar'
import CycleDayDialog from './components/CycleDayDialog'
import DaySheet from './components/DaySheet'
import HistoryCard from './components/HistoryCard'
import MenstrualHealthCard from './components/MenstrualHealthCard'
import SettingsCard from './components/SettingsCard'
import TrendsCard from './components/TrendsCard'
import { todayISO } from './lib/dates'
import { cycleDayLabel, predictNext } from './lib/cycle'
import { DEFAULT_FLOW } from './lib/symptoms'
import {
  FOLLOW_MAX_PX,
  Tab,
  followOffset,
  nextTab,
  prevTab,
  swipeDirection,
  tabDelta,
} from './lib/swipeTabs'
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
  // Day summary dialog (cycle-day position) shown on tap BEFORE the form. The
  // notes & mood form (DaySheet) opens only when the user hits its button.
  const [dialogDate, setDialogDate] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('calendar')
  const now = new Date()

  // ── Tab-navigation motion (design-eng: glide, follow, settle) ──────────
  // Sliding underline: absolutely-positioned pill that glides between tabs
  // instead of each tab's border fading in/out.
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null)
  const navRef = useRef<HTMLElement | null>(null)
  const mainRef = useRef<HTMLElement | null>(null)
  const enterAnimRef = useRef<Animation | null>(null)
  // Where the NEXT tab's content enters from (px). Set by the tab-change
  // initiator — click (±ENTER_SLIDE_PX by direction) or swipe end (finger's
  // clamped travel) — consumed by the [tab] layout effect.
  const pendingEnterRef = useRef<number | null>(null)

  const measureIndicator = useCallback(() => {
    const nav = navRef.current
    if (!nav) return
    const btn = nav.querySelector<HTMLElement>(`[data-tab="${tab}"]`)
    if (!btn) return
    setIndicator({ left: btn.offsetLeft, width: btn.offsetWidth })
  }, [tab])

  useLayoutEffect(() => {
    measureIndicator()
    const onResize = () => measureIndicator()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [measureIndicator])

  // Glide the incoming tab content in from its starting offset (WAAPI —
  // interruptible + GPU, no layout). Opacity starts where the finger left it.
  const animateMainFrom = (offset: number) => {
    const el = mainRef.current
    if (!el) return
    enterAnimRef.current?.cancel()
    enterAnimRef.current = el.animate(
      [
        { opacity: 1 - Math.min(Math.abs(offset) / 240, 0.55), transform: `translateX(${offset}px)` },
        { opacity: 1, transform: 'translateX(0px)' },
      ],
      { duration: 220, easing: 'cubic-bezier(0.23, 1, 0.32, 1)', fill: 'both' },
    )
  }

  // Release a mid-drag position back to rest (non-navigating swipe).
  const settleMain = () => {
    const el = mainRef.current
    if (!el) return
    const t = el.style.transform
    if (!t) return
    const o = el.style.opacity || '1'
    enterAnimRef.current?.cancel()
    enterAnimRef.current = el.animate(
      [
        { transform: t, opacity: o },
        { transform: 'translateX(0px)', opacity: '1' },
      ],
      { duration: 180, easing: 'cubic-bezier(0.23, 1, 0.32, 1)', fill: 'both' },
    )
  }

  const cancelMainMotion = () => {
    enterAnimRef.current?.cancel()
    enterAnimRef.current = null
    const el = mainRef.current
    if (el) {
      el.style.transform = ''
      el.style.opacity = ''
    }
  }

  useEffect(() => saveSnapshot(snap, storage), [snap])

  const prediction = useMemo(() => predictNext(snap.entries, snap.settings), [snap.entries, snap.settings])

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
  // (vertical scroll, long-press range drag). During a horizontal gesture the
  // content FOLLOWS the finger (live transform — no layout); release either
  // glides the next tab in from the finger's position, or settles back.
  const gestureRef = useRef<{ x0: number; y0: number; x: number; y: number } | null>(null)

  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) {
      gestureRef.current = null
      return
    }
    if ((e.target as HTMLElement).closest('[data-calendar], [data-sheet]')) {
      gestureRef.current = null
      return
    }
    cancelMainMotion()
    const t = e.touches[0]
    gestureRef.current = { x0: t.clientX, y0: t.clientY, x: t.clientX, y: t.clientY }
  }

  const onTouchMove = (e: React.TouchEvent) => {
    const g = gestureRef.current
    if (!g) return
    const t = e.touches[0]
    g.x = t.clientX
    g.y = t.clientY
    // Horizontal dominance → content tracks the finger (clamped, GPU-only).
    const off = followOffset(g.x - g.x0, g.y - g.y0)
    const el = mainRef.current
    if (off === null || !el) return
    el.style.transform = `translateX(${off}px)`
    el.style.opacity = String(1 - Math.min(Math.abs(g.x - g.x0) / 240, 0.55))
  }

  const onTouchEnd = () => {
    const g = gestureRef.current
    gestureRef.current = null
    if (!g) return
    const dx = g.x - g.x0
    const dy = g.y - g.y0
    const dir = swipeDirection(dx, dy)
    if (dir === 'left') {
      pendingEnterRef.current = Math.max(-FOLLOW_MAX_PX, dx)
      setTab((t) => nextTab(t))
    } else if (dir === 'right') {
      pendingEnterRef.current = Math.min(FOLLOW_MAX_PX, dx)
      setTab((t) => prevTab(t))
    } else {
      settleMain()
    }
  }

  const onTouchCancel = () => {
    gestureRef.current = null
    cancelMainMotion()
  }

  // Change tabs (nav clicks). The next content enters from the direction of
  // travel; wrap-around counts as backward since calendar sits left.
  const switchTab = (next: Tab) => {
    if (next === tab) return
    pendingEnterRef.current = tabDelta(tab, next) * 20
    setTab(next)
  }

  // Consume the pending enter offset once the new tab's content is mounted.
  useLayoutEffect(() => {
    const from = pendingEnterRef.current
    pendingEnterRef.current = null
    if (from === null) return
    animateMainFrom(from)
  }, [tab])

  const setMainRef = (el: HTMLElement | null) => {
    mainRef.current = el
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
    // Full-viewport wrapper: tab swipes work anywhere outside the interactive
    // surfaces (calendar range drag, day sheet) — on wide screens that means
    // the empty left/right margins of the centered max-w-md column.
    <div
      className={tab === 'calendar' ? 'flex h-dvh flex-col' : 'min-h-dvh'}
      {...swipeProps}
    >
      <div className="mx-auto flex w-full max-w-md min-h-0 flex-1 flex-col px-4 py-6">
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

      <nav
        ref={navRef}
        className="relative mb-5 flex gap-0.5 border-b border-rose-100 sm:gap-8"
        aria-label="Views"
      >
        {(['calendar', 'health', 'trends', 'settings'] as const).map((t) => (
          <button
            key={t}
            type="button"
            data-tab={t}
            data-active={tab === t ? 'true' : 'false'}
            onClick={() => switchTab(t)}
            className={`tab-btn -mb-px flex-1 whitespace-nowrap border-b-2 pb-2.5 text-center text-[11px] font-extrabold uppercase tracking-wide sm:flex-none sm:text-sm sm:tracking-wider ${
              tab === t
                ? 'border-transparent text-ink'
                : 'border-transparent text-ink-soft hover:text-rose-500'
            }`}
          >
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
        {/* Glides to the active tab — transform+width only, 220ms ease-out */}
        <span
          aria-hidden="true"
          className={`tab-indicator absolute -bottom-px left-0 h-0.5 rounded-full bg-rose-500 ${
            indicator ? '' : 'hidden'
          }`}
          style={
            indicator
              ? { transform: `translateX(${indicator.left}px)`, width: `${indicator.width}px` }
              : undefined
          }
        />
      </nav>

      {tab === 'trends' ? (
        <main ref={setMainRef} className="flex flex-col gap-4">
          <TrendsCard snap={snap} settings={snap.settings} />
        </main>
      ) : tab === 'settings' ? (
        <main ref={setMainRef} className="flex flex-col gap-4">
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
        <main ref={setMainRef} className="flex flex-col gap-4">
          <MenstrualHealthCard
            prediction={prediction}
            entryCount={snap.entries.length}
            snap={snap}
            settings={snap.settings}
            onLogToConfirm={() => setSelectedDate(todayISO())}
          />
          <HistoryCard snap={snap} />
        </main>
      ) : (
        <main ref={setMainRef} className="flex min-h-0 flex-1 flex-col gap-4">
          <Calendar
            snap={snap}
            selectedDate={dialogDate ?? selectedDate}
            onSelect={(d) => {
              // Tap opens the cycle-day summary dialog first; the form opens
              // from its button. Clear any open form so dialogs never stack.
              setSelectedDate(null)
              setDialogDate(d)
            }}
            onRangeComplete={commitRange}
            onRangeDelete={deleteRange}
            maxPeriodDays={snap.settings.periodLength}
            undoState={undoState}
            onUndo={performUndo}
            onDismissUndo={dismissUndo}
          />
        </main>
      )}

      {dialogDate && (
        <CycleDayDialog
          date={dialogDate}
          label={cycleDayLabel(snap.entries, dialogDate, snap.settings)}
          onOpenForm={() => {
            setSelectedDate(dialogDate)
            setDialogDate(null)
          }}
          onClose={() => setDialogDate(null)}
        />
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
    </div>
  )
}