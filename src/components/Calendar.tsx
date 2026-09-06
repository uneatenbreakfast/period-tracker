import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Prediction, Snapshot } from '../types'
import {
  continuousGrid,
  initialMonths,
  loadOlderMonths,
  MONTH_NAMES,
  todayISO,
  WEEKDAY_LABELS,
} from '../lib/dates'
import type { MonthRef } from '../lib/dates'
import { cancelHaptic, hapticLongPress, hapticTick } from '../lib/haptics'
import {
  armDrag,
  beginDrag,
  commitDrag,
  extendDrag,
  LONG_PRESS_MS,
  SLOP_PX,
} from '../lib/rangeDrag'
import type { RangeDrag } from '../lib/rangeDrag'
import { cellFillClass, cellFillStyle, cellLayoutClass, dragShape, monthBackgroundPaths, ovulationRing, runShape } from '../lib/rangeStyle'
import type { DayShape } from '../lib/rangeStyle'
import { beginEdit, commitEdit, deleteRange, editAnchorWeek, extendEditRange, moveEnd, moveStart, runBoundsAt } from '../lib/editRange'
import type { EditRange } from '../lib/editRange'

export interface UndoState {
  entries: import('../types').DayEntry[]
  message: string
}

interface CalendarProps {
  snap: Snapshot
  prediction: Prediction
  /** Dates (ISO) that are predicted period days this month */
  predictedDays: string[]
  fertileDays: string[]
  safeDays: string[]
  selectedDate: string | null
  onSelect: (date: string) => void
  /** Commit a range: creation drag (start → end) or an edited period save. */
  onRangeComplete: (start: string, end: string) => void
  /** Delete a committed period range (from edit mode). */
  onRangeDelete: (start: string, end: string) => void
  /** Max days a drag/edit range can span (from settings.periodLength). */
  maxPeriodDays?: number
  /** Undo toast state — truthy shows the toast. */
  undoState?: UndoState | null
  /** User tapped Undo — restore captured entries. */
  onUndo?: () => void
  /** Dismiss the toast (manual or auto-timer). */
  onDismissUndo?: () => void
}

const fmtDay = (iso: string) => {
  const [, m, d] = iso.split('-').map(Number)
  return `${MONTH_NAMES[m - 1].slice(0, 3)} ${d}`
}

export default function Calendar({
  snap,
  prediction,
  predictedDays,
  fertileDays,
  safeDays,
  selectedDate,
  onSelect,
  onRangeComplete,
  onRangeDelete,
  maxPeriodDays,
  undoState,
  onUndo,
  onDismissUndo,
}: CalendarProps) {
  const today = todayISO()
  // User-pickable calendar colors (BLOOM-0022) — drives cells + legend fills.
  const calStyle = snap.settings.style
  // The window shows the last PAST_MONTHS months plus FUTURE_MONTHS ahead;
  // older history is revealed on demand via the "Load older periods" button
  // (loadOlder) — the past never auto-grows on scroll.
  const [months, setMonths] = useState<MonthRef[]>(() => initialMonths())
  // ONE flowing week strip across the whole month window — weeks span month
  // boundaries (a month ending Tue 31 continues same-row into Wed 1).
  const weeks = useMemo(() => continuousGrid(months), [months])
  // Unified SVG month background paths — replaces per-cell rounded corners + tint
  const monthBgPaths = useMemo(() => monthBackgroundPaths(weeks), [weeks])
  // Edit mode for an existing committed run: drag the start/end handles,
  // confirm with the Save/Cancel modal.
  const [edit, setEdit] = useState<EditRange | null>(null)
  const [editAxis, setEditAxis] = useState<'start' | 'end' | null>(null)
  const [drag, setDrag] = useState<RangeDrag | null>(null)
  // "Load older periods" floating button visibility: only shows while the
  // scroll box is at (or near) the top. Once the user scrolls down to read
  // the calendar, the button fades away so it doesn't cover content.
  const [atTop, setAtTop] = useState(true)
  // Set when a drag commits on release; the trailing click (same element) is swallowed.
  const dragJustEnded = useRef(false)
  // Long-press gate: hold LONG_PRESS_MS without moving beyond SLOP_PX → arm
  // the drag. Pre-arm movement aborts; quick taps never arm.
  const holdTimer = useRef<number | null>(null)
  const pressOrigin = useRef<{ x: number; y: number } | null>(null)
  // Last ISO we fired a per-cell haptic tick for — prevents re-ticking while
  // the pointer jitters within the same day cell during a drag.
  const lastTickISORef = useRef<string | null>(null)
  const scrollElRef = useRef<HTMLDivElement | null>(null)
  const tintBoxRef = useRef<HTMLDivElement | null>(null)
  const [tintBox, setTintBox] = useState<{ w: number; h: number } | null>(null)
  // Measure the month-tint overlay's containing box in real pixels. The SVG
  // is absolutely positioned inside a height-auto wrapper, so a percentage
  // height can resolve against the wrong box (or fall back to the intrinsic
  // 7:36 ratio) on some engines, which drifts the tint away from the cells.
  // Explicit px sizing makes the overlay track the rows exactly, always.
  useLayoutEffect(() => {
    const el = tintBoxRef.current
    if (!el) return
    const measure = () => {
      const r = el.getBoundingClientRect()
      setTintBox((prev) =>
        prev && Math.abs(prev.w - r.width) < 0.5 && Math.abs(prev.h - r.height) < 0.5
          ? prev
          : { w: r.width, h: r.height },
      )
    }
    measure()
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(measure)
      ro.observe(el)
      return () => ro.disconnect()
    }
    return undefined
  }, [weeks.length])
  const lastPointerRef = useRef({ x: 0, y: 0 })
  const clearHold = () => {
    if (holdTimer.current !== null) {
      window.clearTimeout(holdTimer.current)
      holdTimer.current = null
      // Cancel haptic only when aborting BEFORE the timer fired — the
      // pointerdown scheduled a delayed pulse ([LONG_PRESS_MS, ...]) that
      // must be killed on tap/scroll/drag abort. After the timer fires
      // naturally (holdTimer null), the vibration is intentional feedback
      // and must NOT be cancelled by the subsequent pointerup clearHold.
      cancelHaptic()
    }
  }
  useEffect(() => () => clearHold(), [])
  const rangeCompleteRef = useRef(onRangeComplete)
  useEffect(() => {
    rangeCompleteRef.current = onRangeComplete
  })
  const rangeDeleteRef = useRef(onRangeDelete)
  useEffect(() => {
    rangeDeleteRef.current = onRangeDelete
  })
  // Mirror for the window listener — the effect below only re-subscribes when
  // a drag starts/ends, so it must read the CURRENT drag, not a stale one.
  const dragRef = useRef<RangeDrag | null>(null)
  useEffect(() => {
    dragRef.current = drag
  })
  const editRef = useRef<EditRange | null>(null)
  useEffect(() => {
    editRef.current = edit
  })
  const editAxisRef = useRef<'start' | 'end' | null>(null)
  useEffect(() => {
    editAxisRef.current = editAxis
  })
  // Auto-dismiss undo toast after 5s
  useEffect(() => {
    if (!undoState || !onDismissUndo) return
    const timer = window.setTimeout(onDismissUndo, 5000)
    return () => window.clearTimeout(timer)
  }, [undoState, onDismissUndo])
  const entriesByDate = useMemo(() => {
    const m = new Map<string, Snapshot['entries'][number]>()
    for (const e of snap.entries) m.set(e.date, e)
    return m
  }, [snap.entries])
  const entriesRef = useRef(entriesByDate)
  useEffect(() => {
    entriesRef.current = entriesByDate
  })
  const hasFlowAt = (iso: string) => !!entriesRef.current.get(iso)?.flow

  // Touch handling: day cells are touch-none so ALL touch events stay on the
  // main thread (BLOOM-0015 — touch-pan-y let the compositor steal gestures
  // before our veto could fire). Two modes:
  //   1. Drag armed OR edit active → preventDefault blocks scroll, gesture
  //      owns vertical movement.
  //   2. Neither → JS-driven scroll: track last touch Y, apply delta to
  //      scrollTop. Native scroll impossible because touch-none kills it.
  // Non-passive NATIVE listener — React's onTouchMove is passive and cannot
  // preventDefault. Capture phase ensures we run before any bubble handler.
  useEffect(() => {
    const el = scrollElRef.current
    if (!el) return
    let lastTouchY = 0
    let lastTouchT = 0
    let velocityY = 0          // px per ms, positive = scrolling down (content up)
    let inertiaRAF: number | null = null
    const stopInertia = () => {
      if (inertiaRAF !== null) {
        cancelAnimationFrame(inertiaRAF)
        inertiaRAF = null
      }
    }
    const onTouchStart = (e: TouchEvent) => {
      stopInertia()
      const t = e.touches[0]
      lastTouchY = t.clientY
      lastTouchT = e.timeStamp
      velocityY = 0
    }
    const onTouchMove = (e: TouchEvent) => {
      if (dragRef.current || editAxisRef.current) {
        e.preventDefault()
        stopInertia()
        return
      }
      // Pending drag (hold timer running) — block JS scroll. Finger should
      // stay still for the long press. Movement > SLOP_PX clears drag via
      // pointermove, then subsequent touchmoves resume JS scroll.
      if (dragRef.current) {
        stopInertia()
        return
      }
      const t = e.touches[0]
      const now = e.timeStamp
      const y = t.clientY
      const dy = lastTouchY - y
      const dt = Math.max(1, now - lastTouchT)
      // Smoothed velocity: 70% new sample + 30% carry, dampens jitter.
      velocityY = 0.7 * (dy / dt) + 0.3 * velocityY
      lastTouchY = y
      lastTouchT = now
      el.scrollTop += dy
    }
    const onTouchEnd = () => {
      if (dragRef.current || editAxisRef.current || editRef.current) return
      // Kick off inertia only if finger was moving fast enough to matter.
      if (Math.abs(velocityY) < 0.15) {
        velocityY = 0
        return
      }
      const FRICTION = 0.955       // per-frame velocity multiplier
      const MIN_VEL = 0.03         // px/ms — below this, stop
      let lastFrame = performance.now()
      const step = (now: number) => {
        const dt = now - lastFrame
        lastFrame = now
        velocityY *= Math.pow(FRICTION, dt / 16.67)
        if (Math.abs(velocityY) < MIN_VEL) {
          inertiaRAF = null
          return
        }
        el.scrollTop += velocityY * dt
        // Clamp: stop inertia at bounds (don't rubber-band).
        const atTop = el.scrollTop <= 0
        const atBot = el.scrollTop + el.clientHeight >= el.scrollHeight
        if ((atTop && velocityY < 0) || (atBot && velocityY > 0)) {
          inertiaRAF = null
          return
        }
        inertiaRAF = requestAnimationFrame(step)
      }
      inertiaRAF = requestAnimationFrame(step)
    }
    // Wheel veto: mouse wheel must not scroll the calendar while a drag
    // is pending (hold timer running) or armed — the gesture owns vertical
    // movement from press until release.
    const onWheel = (e: WheelEvent) => {
      if (dragRef.current || editAxisRef.current) e.preventDefault()
    }
    // Capture phase: veto runs BEFORE browser processes scroll. Bubble phase
    // is too late — the browser has already committed to the pan gesture.
    el.addEventListener('touchstart', onTouchStart, { passive: true, capture: true })
    el.addEventListener('touchmove', onTouchMove, { passive: false, capture: true })
    el.addEventListener('touchend', onTouchEnd, { passive: true, capture: true })
    el.addEventListener('touchcancel', stopInertia, { passive: true, capture: true })
    el.addEventListener('wheel', onWheel, { passive: false, capture: true })
    return () => {
      stopInertia()
      el.removeEventListener('touchstart', onTouchStart, { capture: true })
      el.removeEventListener('touchmove', onTouchMove, { capture: true })
      el.removeEventListener('touchend', onTouchEnd, { capture: true })
      el.removeEventListener('touchcancel', stopInertia, { capture: true })
      el.removeEventListener('wheel', onWheel, { capture: true })
    }
  }, [])

  // Window-level scroll lock: when drag ARMED (or edit active), prevent ANY
  // page scroll. Calendar scroll box is locked via CSS + capture listeners,
  // but touches on weekday strip, header, or body padding can still scroll
  // the page itself. Pre-arm hold must NOT lock — user may be starting a
  // regular scroll swipe, not a range gesture.
  //
  // Listener attached IMMEDIATELY (not conditionally) — gating inside the
  // handler via refs avoids the re-render delay that left a gap where the
  // page could scroll between arm-time and state-update-time.
  useEffect(() => {
    const veto = (e: TouchEvent) => {
      if (dragRef.current || editAxisRef.current) e.preventDefault()
    }
    const wheelVeto = (e: WheelEvent) => {
      if (dragRef.current || editAxisRef.current) e.preventDefault()
    }
    document.addEventListener('touchmove', veto, { passive: false, capture: true })
    document.addEventListener('wheel', wheelVeto, { passive: false, capture: true })
    return () => {
      document.removeEventListener('touchmove', veto, { capture: true })
      document.removeEventListener('wheel', wheelVeto, { capture: true })
    }
  }, [])

  // PAGE-level scroll lock: when armed, set touch-action: none + overflow:
  // hidden on html AND body. preventDefault on touchmove alone is NOT enough
  // — the browser commits to a scroll gesture based on touch-action at
  // touchstart time, before our JS can react. Setting CSS touch-action: none
  // tells the browser upfront that NO element on the page should scroll via
  // touch. overflow: hidden is the belt to that suspenders.
  const pageScrollLocked = !!drag || !!editAxis
  useEffect(() => {
    if (!pageScrollLocked) return
    const html = document.documentElement
    const body = document.body
    const prevHtmlTouch = html.style.touchAction
    const prevBodyTouch = body.style.touchAction
    const prevHtmlOverflow = html.style.overflow
    const prevBodyOverflow = body.style.overflow
    html.style.touchAction = 'none'
    body.style.touchAction = 'none'
    html.style.overflow = 'hidden'
    body.style.overflow = 'hidden'
    return () => {
      html.style.touchAction = prevHtmlTouch
      body.style.touchAction = prevBodyTouch
      html.style.overflow = prevHtmlOverflow
      body.style.overflow = prevBodyOverflow
    }
  }, [pageScrollLocked])

  // Reveal another LOAD_STEP months of history behind the oldest loaded month.
  // Triggered by the "Load older periods" button (not auto-scroll) so the past
  // stays bounded until the user asks for more. Scroll position is held so the
  // view stays anchored on the same month after the prepend.
  const loadOlder = () => {
    const el = scrollElRef.current
    if (!el || months.length === 0) return
    const prevHeight = el.scrollHeight
    setMonths((m) => [...loadOlderMonths(m[0]), ...m])
    requestAnimationFrame(() => {
      const node = scrollElRef.current
      if (node) node.scrollTop += node.scrollHeight - prevHeight
    })
  }

  // Release (or cancel) anywhere ends the drag. Edit mode is entered AT ARM
  // (see the hold timer) — by the time the pointer lifts, an armed press on a
  // committed period day already owns the gesture, so release only commits
  // creation drags. A long-press tap on a non-flow day stays a plain tap
  // (DaySheet via the trailing click).
  //
  // Listener is ALWAYS attached — not gated on drag state. A conditional
  // useEffect([drag !== null]) left gaps between taps where no pointerup
  // listener existed; a quick tap's pointerup would fire before React
  // re-rendered to attach the listener, so clearHold() never ran and the
  // scheduled haptic buzzed 400ms later (every-other-tap vibration bug).
  useEffect(() => {
    const up = () => {
      const d = dragRef.current
      if (!d) return
      clearHold()
      dragRef.current = null
      setDrag(null)
      lastTickISORef.current = null
      if (!d.armed) return
      const range = commitDrag(d)
      if (range) {
        dragJustEnded.current = true
        rangeCompleteRef.current(range.from, range.to)
      }
    }
    // Pointer cancel = the browser reclaimed the gesture (system gesture,
    // palm, interruption) — abort without committing.
    const cancel = () => {
      if (!dragRef.current) return
      clearHold()
      dragRef.current = null
      setDrag(null)
      lastTickISORef.current = null
    }
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    return () => {
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
    }
  }, [])

  // Edit-handle drag: pointer down on a cap starts it; window moves extend
  // the bound to the cell under the pointer.
  useEffect(() => {
    if (!editAxis) return
    const move = (e: PointerEvent) => {
      lastPointerRef.current = { x: e.clientX, y: e.clientY }
      const iso = isoAt(e.clientX, e.clientY)
      if (!iso) return
      setEdit((prev) => {
        if (!prev) return prev
        // Range mode: long-press drag sets BOTH bounds from the press origin
        // to the cell under the pointer. Handle mode: only the tapped axis.
        let next: EditRange | null = null
        if (prev.dragMode === 'range') next = extendEditRange(prev, iso, maxPeriodDays)
        else {
          const axis = editAxisRef.current
          next = axis === 'start' ? moveStart(prev, iso, maxPeriodDays) : moveEnd(prev, iso, maxPeriodDays)
        }
        // Per-cell tick on edit bound change (same transient-activation rule).
        if (next) {
          const bound = next.dragMode === 'range' ? next.end : editAxisRef.current === 'start' ? next.start : next.end
          if (bound !== lastTickISORef.current) {
            lastTickISORef.current = bound
            hapticTick()
          }
        }
        return next
      })
    }
    const end = () => {
      setEditAxis(null)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editAxis !== null])

  // Continuous-strip shape for a cell: run caps (start/end get the semicircle
  // ends, interior days are flush squares, a lone day stays a circle). The
  // committed period run is shaped from global day-neighbors (spans month
  // boundaries without a seam); the armed drag preview is shaped from the
  // drag bounds; in edit mode the EDITED bounds replace the committed run as
  // the live WYSIWYG of what Save would persist.
  const committedShape = (iso: string): DayShape | null =>
    runShape(iso, (i) => !!entriesByDate.get(i)?.flow)
  const dragShapeFor = (iso: string): DayShape | null => {
    if (!drag?.armed) return null
    return dragShape(iso, drag.start, drag.end)
  }

  // Cell under the pointer, by coordinates. Used instead of pointerenter:
  // touch pointers get IMPLICIT capture on the pressed cell, so boundary
  // events never fire on other cells during a touch drag.
  const isoAt = (x: number, y: number): string | null => {
    const el = document.elementFromPoint(x, y)
    const label = el instanceof Element ? (el.closest('button[aria-label]')?.getAttribute('aria-label') ?? '') : ''
    return /^\d{4}-\d{2}-\d{2}$/.test(label) ? label : null
  }

  const showLegend =
    !!prediction && (prediction.fertileWindow !== null || predictedDays.length > 0 || safeDays.length > 0)

  const saveEdit = () => {
    const ed = editRef.current
    if (!ed) return
    const range = commitEdit(ed)
    rangeCompleteRef.current(range.from, range.to)
    setEdit(null)
    setEditAxis(null)
  }
  const deleteEdit = () => {
    const ed = editRef.current
    if (!ed) return
    const range = deleteRange(ed)
    rangeDeleteRef.current(range.from, range.to)
    setEdit(null)
    setEditAxis(null)
  }
  const cancelEdit = () => {
    setEdit(null)
    setEditAxis(null)
  }

  return (
    <div data-calendar className="relative flex min-h-0 flex-col rounded-3xl bg-white p-5 shadow-[0_6px_24px_rgba(217,111,147,0.12)]">
      {edit && (
        <div
          data-edit-modal
          className="absolute bottom-2 left-1/2 z-30 w-[calc(100%-1.5rem)] -translate-x-1/2 animate-slide-up rounded-2xl border border-rose-100 bg-white/95 p-3 shadow-xl backdrop-blur-sm"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-wider text-ink-soft">Edit period</p>
              <p data-edit-range className="truncate text-sm font-extrabold text-ink">
                {fmtDay(edit.start)} – {fmtDay(edit.end)}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                aria-label="Delete period"
                onClick={deleteEdit}
                className="rounded-full bg-rose-100 px-3 py-1.5 text-xs font-bold text-rose-500 transition-colors hover:bg-rose-200"
              >
                Delete
              </button>
              <button
                type="button"
                aria-label="Cancel edit"
                onClick={cancelEdit}
                className="rounded-full bg-cream px-4 py-1.5 text-xs font-bold text-ink-soft transition-colors hover:bg-rose-50 hover:text-rose-500"
              >
                Cancel
              </button>
              <button
                type="button"
                aria-label="Save edit"
                onClick={saveEdit}
                className="rounded-full bg-rose-400 px-4 py-1.5 text-xs font-bold text-white shadow-[0_3px_10px_rgba(217,111,147,0.4)] transition-colors hover:bg-rose-500"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={loadOlder}
        aria-label="Load older periods"
        className={`absolute left-1/2 top-2 z-20 -translate-x-1/2 rounded-full bg-white/95 px-4 py-1.5 text-xs font-bold text-ink-soft shadow-lg backdrop-blur-sm transition-all duration-200 hover:bg-rose-50 hover:text-rose-500 ${atTop ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}`}
      >
        ↑ Load older
      </button>
      {/* Weekday labels sit ABOVE the scroll box — always fully visible,
          never overlapped by scrolling day rows. */}
      <div
        data-calendar-weekdays
        className="-mx-5 mb-1 bg-white px-5 pb-1.5 pt-3"
      >
        <div className="grid grid-cols-7 text-center text-[11px] font-bold uppercase tracking-wider text-ink-soft">
          {WEEKDAY_LABELS.map((w) => (
            <div key={w}>{w}</div>
          ))}
        </div>
      </div>
      {/* Months scroll inside this box, which flexes to fill ALL remaining
          viewport height (taller screen = more calendar visible). CRITICAL:
          must stay flex-1 min-h-0 — the box absorbs the slack so the page
          itself never scrolls (no root scrollbar). */}
      {/* Day cells are touch-pan-y: a REGULAR vertical swipe over the grid
          scrolls the calendar (BLOOM-0015). A quick swipe never arms — the
          browser takes the pan — and once a long press arms (or an edit
          handle is held) a non-passive touchmove veto keeps the gesture with
          the calendar instead of the scroller. Vertical scrolling also works
          from the sticky weekday strip and the Today pill. */}
      <div
        data-calendar-scroll
        ref={scrollElRef}
        onScroll={(e) => {
          const t = e.currentTarget.scrollTop
          setAtTop(t < 20)
        }}
        className={`relative -mx-5 min-h-0 flex-1 overscroll-contain px-5 select-none touch-none ${
          drag?.armed ? 'overflow-hidden' : 'overflow-y-auto'
        }`}
        onPointerMove={(e) => {
          lastPointerRef.current = { x: e.clientX, y: e.clientY }
          const d = dragRef.current
          if (!d || editAxisRef.current) return
          if (!d.armed) {
            // Pre-arm movement beyond the slop aborts the long press — a fast
            // drag (or scroll attempt) is not a range selection. Jitter within
            // the slop keeps the hold alive.
            const o = pressOrigin.current
            if (o && (Math.abs(e.clientX - o.x) > SLOP_PX || Math.abs(e.clientY - o.y) > SLOP_PX)) {
              clearHold()
              dragRef.current = null
              setDrag(null)
            }
            return
          }
          // extend the armed drag to whatever day cell is under the pointer
          const iso = isoAt(e.clientX, e.clientY)
          if (!iso) return
          setDrag((prev) => {
            if (!prev) return prev
            const next = extendDrag(prev, iso, maxPeriodDays)
            // Per-cell haptic tick: fire when the drag end crosses into a new
            // day. Called from pointermove (user gesture) so navigator.vibrate
            // retains transient-activation context.
            if (next && next.end !== lastTickISORef.current) {
              lastTickISORef.current = next.end
              hapticTick()
            }
            return next
          })
        }}
      >
      {/* Positioning wrapper: SVG fills exactly the grid content area */}
      <div ref={tintBoxRef} className="relative">
      {/* SVG month background layer: one continuous path per month, rounded
          on convex outer corners, flush on interior edges. */}
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        style={tintBox ? { width: `${tintBox.w}px`, height: `${tintBox.h}px` } : undefined}
        viewBox={`0 0 7 ${weeks.length}`}
        preserveAspectRatio="none"
        aria-hidden
      >
        {monthBgPaths.map(({ monthKey, pathD }) => {
          const m = Number(monthKey.slice(5, 7))
          // Odd months get the user-pickable tint (BLOOM-0023); even months stay plain.
          return m % 2 !== 0 ? (
            <path key={monthKey} d={pathD} style={{ fill: calStyle.monthTint }} />
          ) : null
        })}
      </svg>
      {weeks.map((week, wi) => {
        // Anchor for the month whose 1st falls in this row — App's Today pill
        // and the initial scroll bring the row containing the 1st to the top.
        const firstCell = week.find((c) => Number(c.iso.slice(8)) === 1)
        const monthRef = firstCell
          ? `${firstCell.iso.slice(0, 4)}-${Number(firstCell.iso.slice(5, 7)) - 1}`
          : undefined
        const isAnchor = edit !== null && editAnchorWeek(weeks, edit) === wi
        const isLastWeek = wi === weeks.length - 1
        return (
          <div key={`w${wi}`} data-month={monthRef} className="relative grid grid-cols-7">
            {week.map((cell) => {
                  const entry = entriesByDate.get(cell.iso)
                  const isPeriod = entry?.flow !== undefined
                  const isPredicted = predictedDays.includes(cell.iso)
                  const isFertile = fertileDays.includes(cell.iso)
                  const isOvulation = prediction.ovulationDay === cell.iso
                  const isSafe = safeDays.includes(cell.iso)
                  // Calculate shapes for all range types (connected-strip look).
                  // Priority: period > fertile > predicted > safe. Edit mode
                  // replaces the committed run with the edited bounds.
                  const fertileShape = isFertile ? runShape(cell.iso, (iso) => fertileDays.includes(iso)) : null
                  const predictedShape = isPredicted ? runShape(cell.iso, (iso) => predictedDays.includes(iso)) : null
                  const safeShape = isSafe ? runShape(cell.iso, (iso) => safeDays.includes(iso)) : null
                  const shape = edit
                    ? dragShape(cell.iso, edit.start, edit.end)
                    : isPeriod
                      ? committedShape(cell.iso)
                      : dragShapeFor(cell.iso) ?? fertileShape ?? predictedShape ?? safeShape
                  // Which range produced the shape? Drives fill color.
                  const shapeOrigin: 'period' | 'fertile' | 'predicted' | 'safe' | undefined =
                    edit ? undefined
                    : isPeriod ? 'period'
                    : dragShapeFor(cell.iso) ? undefined   // drag preview = period
                    : fertileShape ? 'fertile'
                    : predictedShape ? 'predicted'
                    : safeShape ? 'safe'
                    : undefined
                  // Rose overlay paints ONLY period visuals (committed run, drag
                  // preview, edit bounds). Fertile/predicted/safe shapes must NOT
                  // get the solid rose overlay — it painted every shaped cell on
                  // tinted months as a solid pink block (legend mismatch).
                  const isPeriodVisual =
                    isPeriod || !!edit || dragShapeFor(cell.iso) !== null
                  const isToday = cell.iso === today
                  const isSelected = cell.iso === selectedDate
                  // Superscript month tag on the 1st of every month (e.g. “AUG 1”
                  // with AUG raised) — the only per-month marker in the strip.
                  const isMonthStart = Number(cell.iso.slice(8)) === 1
                  const editHandle = edit
                    ? cell.iso === edit.start
                      ? 'start'
                      : cell.iso === edit.end
                        ? 'end'
                        : null
                    : null

                  const monthTint = cell.inMonth && Number(cell.iso.slice(5, 7)) % 2 !== 0
                  // Layout: centered circles by default; period shapes use
                  // capsule geometry. SVG layer behind grid provides month tint.
                  let cls =
                    'flex aspect-square select-none items-center justify-center text-sm transition-colors touch-none'
                  cls += ' ' + cellLayoutClass(shape)
                  if (!cell.inMonth) cls += ' opacity-15 text-ink-soft/40'
                  // Fill: shapes paint rose/lavender/sage depending on range;
                  // unshaped cells are transparent so SVG month bg shows through.
                  cls += ' ' + cellFillClass(shape, isFertile, isPredicted, isSafe, monthTint, shapeOrigin)
                  // User-pickable colors (BLOOM-0022) — inline styles replace
                  // the old fixed Tailwind color utilities.
                  const fillStyle = cellFillStyle(shape, isFertile, isPredicted, isSafe, monthTint, calStyle, shapeOrigin)
                  if (!cell.inMonth) cls += ' hover:bg-rose-50'
                  if (editHandle) cls += ' cursor-grab ring-2 ring-white/80'
                  // Today: small ink dot below number — distinct from rose period
                  // fill, zero state ambiguity. Selected: outline for non-period.
                  if (isSelected && !shape) cls += ' outline-2 outline-offset-2 outline-rose-300'
                  if (!cell.inMonth) cls += ' hover:bg-rose-50'

                  const grip = <span aria-hidden className="relative z-20 h-4 w-1 rounded-full bg-white/80" />

                  return (
                    <button
                      key={cell.iso}
                      type="button"
                      data-edit-handle={editHandle ?? undefined}
                      onPointerDown={(e) => {
                        // left button / primary touch only — ignore right-click & second finger
                        if (e.button !== 0 || !e.isPrimary) return
                        // Edit mode: only the cap handles start a gesture; any
                        // other press is ignored until Save/Cancel.
                        if (editRef.current) {
                          // Handle taps switch to handle-mode so only that axis
                          // moves on drag (range-mode drags set BOTH bounds).
                          if (cell.iso === editRef.current.start) {
                            setEdit((prev) =>
                              prev ? { ...prev, dragMode: 'handle', pressOriginISO: prev.start } : prev,
                            )
                            setEditAxis('start')
                            lastTickISORef.current = cell.iso
                          } else if (cell.iso === editRef.current.end) {
                            setEdit((prev) =>
                              prev ? { ...prev, dragMode: 'handle', pressOriginISO: prev.end } : prev,
                            )
                            setEditAxis('end')
                            lastTickISORef.current = cell.iso
                          }
                          return
                        }
                        dragJustEnded.current = false
                        lastTickISORef.current = cell.iso
                        const d = beginDrag(cell.iso)
                        dragRef.current = d
                        setDrag(d)
                        pressOrigin.current = { x: e.clientX, y: e.clientY }
                        // Cancel any pending vibration from a previous press
                        // BEFORE scheduling a new one — otherwise the new
                        // hapticLongPress() schedules a vibration that
                        // clearHold() won't cancel (it only cancels when
                        // holdTimer.current !== null, which is false after
                        // a release).
                        clearHold()
                        // Fire the long-press vibration from the user-gesture
                        // handler so navigator.vibrate retains transient-
                        // activation context (setTimeout callbacks lose it on
                        // modern Chrome Android).  Pattern: [0, LONG_PRESS_MS, 30, 30, 30]
                        // — 0ms vibrate, delay pause, then double pulse.
                        hapticLongPress(LONG_PRESS_MS)
                        // Selection starts only after a long press: hold
                        // LONG_PRESS_MS without moving → arm the drag.
                        holdTimer.current = window.setTimeout(() => {
                          // Timer fired — clear the ref so subsequent taps
                          // don't see a stale ID.
                          holdTimer.current = null
                          const cur = dragRef.current
                          if (!cur) return
                          const armed = armDrag(cur)
                          dragRef.current = armed
                          setDrag(armed)
                          // BLOOM-0015: long press REGISTERED = edit mode NOW,
                          // not on finger release. An armed press on a day with
                          // committed flow becomes the run's new START (the END
                          // stays) and the still-down pointer continues as the
                          // start handle — the modal shows up while the finger
                          // is still on the screen.
                          if (hasFlowAt(cur.start) && !editRef.current) {
                            const run = runBoundsAt(hasFlowAt, cur.start)
                            if (run) {
                              dragRef.current = null
                              setDrag(null)
                              dragJustEnded.current = true
                              // Set the ref SYNCHRONOUSLY: the modal render
                              // commits on the next tick, but the touch-veto
                              // must reject panning from the very next
                              // touchmove — no window for the browser to steal
                              // the still-down finger as a scroll.
                              editAxisRef.current = 'start'
                              setEditAxis('start')
                              setEdit(beginEdit(run, cur.start))
                            }
                          }
                        }, LONG_PRESS_MS)
                      }}
                      onPointerCancel={() => {
                        clearHold()
                        dragRef.current = null
                        setDrag(null)
                      }}
                      onClick={() => {
                        // A drag commits on release; swallow the trailing click.
                        if (dragJustEnded.current) {
                          dragJustEnded.current = false
                          return
                        }
                        // Edit mode owns the gesture surface — plain taps do
                        // nothing until Save/Cancel.
                        if (editRef.current || editAxisRef.current) return
                        onSelect(cell.iso)
                      }}
                      className={`${cls} relative`}
                      style={fillStyle}
                      aria-label={cell.iso}
                    >
                      {shape && monthTint && isPeriodVisual ? (
                        <span
                          aria-hidden
                          style={{ backgroundColor: calStyle.period }}
                          className={`pointer-events-none absolute inset-0 ${
                            shape === 'single' ? 'rounded-full' : shape === 'start' ? 'rounded-l-full' : shape === 'end' ? 'rounded-r-full' : ''
                          }`}
                        />
                      ) : null}
                      {editHandle === 'start' ? grip : null}
                      <span className="relative z-10 flex flex-col items-center justify-center gap-0.5">
                        {isMonthStart && (
                          <span className={`text-[9px] font-bold uppercase leading-none tracking-wide opacity-80 ${edit ? 'border-l-2 border-rose-400 pl-0.5' : ''}`}>
                            {MONTH_NAMES[Number(cell.iso.slice(5, 7)) - 1].slice(0, 3)}
                          </span>
                        )}
                        <span>{Number(cell.iso.slice(8))}</span>
                      </span>
                      {editHandle === 'end' ? grip : null}
                      {isOvulation && !shape && (
                        <span
                          aria-hidden
                          className="pointer-events-none absolute inset-0 flex items-center justify-center"
                        >
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{
                              backgroundColor: calStyle.ovulation,
                              boxShadow: `0 0 0 2px ${ovulationRing(calStyle)}`,
                            }}
                          />
                        </span>
                      )}
                      {isToday && (
                        <span
                          aria-hidden
                          className={`pointer-events-none absolute bottom-1 left-1/2 z-10 h-1 w-1 -translate-x-1/2 rounded-full ${
                            shape ? 'bg-white' : 'bg-ink'
                          }`}
                        />
                      )}
                    </button>
                  )
                })}
                {isAnchor && edit && (
                  <div
                    data-edit-modal
                    className={`absolute left-1/2 z-30 w-[calc(100%-1.5rem)] -translate-x-1/2 animate-slide-up rounded-2xl border border-rose-100 bg-white/95 p-3 shadow-xl backdrop-blur-sm pointer-events-none ${
                      isLastWeek ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-bold uppercase tracking-wider text-ink-soft">Edit period</p>
                        <p data-edit-range className="truncate text-sm font-extrabold text-ink">
                          {fmtDay(edit.start)} – {fmtDay(edit.end)}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <button
                          type="button"
                          aria-label="Delete period"
                          onClick={deleteEdit}
                          className="pointer-events-auto rounded-full bg-rose-100 px-3 py-1.5 text-xs font-bold text-rose-500 transition-colors hover:bg-rose-200"
                        >
                          Delete
                        </button>
                        <button
                          type="button"
                          aria-label="Cancel edit"
                          onClick={cancelEdit}
                          className="pointer-events-auto rounded-full bg-cream px-4 py-1.5 text-xs font-bold text-ink-soft transition-colors hover:bg-rose-50 hover:text-rose-500"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          aria-label="Save edit"
                          onClick={saveEdit}
                          className="pointer-events-auto rounded-full bg-rose-400 px-4 py-1.5 text-xs font-bold text-white shadow-[0_3px_10px_rgba(217,111,147,0.4)] transition-colors hover:bg-rose-500"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
      </div>
      </div>
      {undoState && (
        <div className="animate-slide-up absolute bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-full bg-ink px-4 py-2 shadow-lg">
          <span className="text-sm font-bold text-white">{undoState.message}</span>
          <button
            type="button"
            onClick={onUndo}
            className="rounded-full bg-white/20 px-3 py-1 text-xs font-bold text-white transition-colors hover:bg-white/30"
          >
            Undo
          </button>
        </div>
      )}
      {!showLegend ? null : (
        <div
          data-testid="calendar-legend"
          className="mt-4 flex flex-wrap gap-x-4 gap-y-2 border-t border-rose-50 pt-3 text-xs text-ink-soft"
        >
          <span className="flex items-center gap-1.5">
            <span data-legend="period" className="h-3 w-3 rounded-full" style={{ backgroundColor: calStyle.period }} /> period
          </span>
          {predictedDays.length > 0 && (
            <span className="flex items-center gap-1.5">
              <span
                data-legend="predicted"
                className="h-3 w-3 rounded-full border border-dashed"
                style={{ borderColor: calStyle.predicted }}
              />{' '}
              predicted
            </span>
          )}
          {prediction.fertileWindow !== null && (
            <span className="flex items-center gap-1.5">
              <span data-legend="fertile" className="h-3 w-3 rounded-full" style={{ backgroundColor: calStyle.fertile }} /> fertile
            </span>
          )}
          {prediction.ovulationDay && (
            <span className="flex items-center gap-1.5">
              <span
                data-legend="ovulation"
                className="flex h-3 w-3 items-center justify-center rounded-full bg-white"
                style={{ boxShadow: `0 0 0 2px ${calStyle.ovulation}` }}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: calStyle.ovulation }} />
              </span>
              ovulation
            </span>
          )}
          {safeDays.length > 0 && (
            <span className="flex items-center gap-1.5">
              <span data-legend="safe" className="h-3 w-3 rounded-full" style={{ backgroundColor: calStyle.safe }} /> safe
            </span>
          )}
        </div>
      )}
    </div>
  )
}