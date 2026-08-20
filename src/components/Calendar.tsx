import { useEffect, useMemo, useRef, useState } from 'react'
import type { Prediction, Snapshot } from '../types'
import { addMonths, continuousGrid, MONTH_NAMES, monthList, todayISO, WEEKDAY_LABELS } from '../lib/dates'
import type { MonthRef } from '../lib/dates'
import { hapticPulse } from '../lib/haptics'
import {
  armDrag,
  beginDrag,
  commitDrag,
  extendDrag,
  LONG_PRESS_MS,
  SLOP_PX,
} from '../lib/rangeDrag'
import type { RangeDrag } from '../lib/rangeDrag'
import { dragShape, runShape } from '../lib/rangeStyle'
import type { DayShape } from '../lib/rangeStyle'
import { beginEdit, commitEdit, moveEnd, moveStart, runBoundsAt } from '../lib/editRange'
import type { EditRange } from '../lib/editRange'

/** Scroll a month section within this many px of an edge → grow the window. */
const EXTEND_PX = 240
/** Pointer within this many px of the scroll-box edge → auto-scroll while dragging. */
const EDGE_PX = 64
/** Auto-scroll speed while dragging at an edge (px per animation frame). */
const AUTO_SCROLL_PX = 14
/** Months added per growth step at either end of the window. */
const GROW_STEP = 6

interface CalendarProps {
  snap: Snapshot
  prediction: Prediction
  /** Dates (ISO) that are predicted period days this month */
  predictedDays: string[]
  fertileDays: string[]
  selectedDate: string | null
  onSelect: (date: string) => void
  /** Commit a range: creation drag (start → end) or an edited period save. */
  onRangeComplete: (start: string, end: string) => void
}

/** Initial month window: today ±12 months, extended back one month before the earliest entry. */
function initialMonths(snap: Snapshot): MonthRef[] {
  const now = new Date()
  const start = addMonths(now.getFullYear(), now.getMonth(), -12)
  const end = addMonths(now.getFullYear(), now.getMonth(), 12)
  const earliest = snap.entries.reduce<string | null>(
    (min, e) => (min === null || e.date < min ? e.date : min),
    null,
  )
  if (earliest) {
    const [y, m] = earliest.split('-').map(Number)
    const em = addMonths(y, m - 1, -1)
    if (em.year < start.year || (em.year === start.year && em.month < start.month)) {
      start.year = em.year
      start.month = em.month
    }
  }
  return monthList(start, end)
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
  selectedDate,
  onSelect,
  onRangeComplete,
}: CalendarProps) {
  const today = todayISO()
  // The calendar is continuous: the window starts at today ±12 (plus history)
  // and GROWS in both directions as the user scrolls near either edge.
  const [months, setMonths] = useState<MonthRef[]>(() => initialMonths(snap))
  // ONE flowing week strip across the whole month window — weeks span month
  // boundaries (a month ending Tue 31 continues same-row into Wed 1).
  const weeks = useMemo(() => continuousGrid(months), [months])
  // Edit mode for an existing committed run: drag the start/end handles,
  // confirm with the Save/Cancel modal.
  const [edit, setEdit] = useState<EditRange | null>(null)
  const [editAxis, setEditAxis] = useState<'start' | 'end' | null>(null)
  const [drag, setDrag] = useState<RangeDrag | null>(null)
  // Set when a drag commits on release; the trailing click (same element) is swallowed.
  const dragJustEnded = useRef(false)
  // Long-press gate: hold LONG_PRESS_MS without moving beyond SLOP_PX → arm
  // the drag. Pre-arm movement aborts; quick taps never arm.
  const holdTimer = useRef<number | null>(null)
  const pressOrigin = useRef<{ x: number; y: number } | null>(null)
  const scrollElRef = useRef<HTMLDivElement | null>(null)
  const extendingRef = useRef(false)
  const lastPointerRef = useRef({ x: 0, y: 0 })
  const autoScrollDirRef = useRef(0)
  const rafRef = useRef(0)
  const clearHold = () => {
    if (holdTimer.current !== null) {
      window.clearTimeout(holdTimer.current)
      holdTimer.current = null
    }
  }
  useEffect(() => () => clearHold(), [])
  const rangeCompleteRef = useRef(onRangeComplete)
  useEffect(() => {
    rangeCompleteRef.current = onRangeComplete
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

  const stopAutoScroll = () => {
    autoScrollDirRef.current = 0
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
    }
  }

  // Touch veto: day cells are touch-pan-y so a REGULAR vertical swipe scrolls
  // the calendar (BLOOM-0015 — touch-none made the whole day grid dead to
  // scrolling). A swipe that the user never intends is a browser pan, so it
  // must stay a scroll UNLESS a gesture is armed: once the long-press timer
  // fired (or an edit handle is being dragged) the gesture belongs to the
  // calendar, and the first touchmove is prevented from becoming a pan.
  // Non-passive NATIVE listener — React's onTouchMove is passive and cannot
  // preventDefault. touch-action is consulted at gesture start, so this veto
  // is the only way to hand a cell touch to the selection after arming.
  useEffect(() => {
    const el = scrollElRef.current
    if (!el) return
    const onTouchMove = (e: TouchEvent) => {
      if (dragRef.current?.armed || editAxisRef.current) e.preventDefault()
    }
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    return () => el.removeEventListener('touchmove', onTouchMove)
  }, [])

  // While a drag is armed (or an edit handle is being dragged), hovering at
  // the top/bottom edge of the scroll box keeps it scrolling — the range can
  // cross month after month in ONE gesture. The pointer itself never moves,
  // so each frame re-hits the cell now under the stationary pointer.
  const startAutoScroll = (dir: -1 | 1) => {
    autoScrollDirRef.current = dir
    if (rafRef.current) return
    const tick = () => {
      const dirNow = autoScrollDirRef.current
      const el = scrollElRef.current
      if (!el || dirNow === 0) {
        rafRef.current = 0
        return
      }
      el.scrollTop += dirNow * AUTO_SCROLL_PX
      const p = lastPointerRef.current
      const iso = isoAt(p.x, p.y)
      if (iso) {
        if (editAxisRef.current) {
          const axis = editAxisRef.current
          setEdit((prev) => (prev ? (axis === 'start' ? moveStart(prev, iso) : moveEnd(prev, iso)) : prev))
        } else if (dragRef.current?.armed) {
          setDrag((prev) => (prev ? extendDrag(prev, iso) : prev))
        }
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }

  // Grow the month window when the scroll box nears either end.
  const onScroll = () => {
    const el = scrollElRef.current
    if (!el || extendingRef.current) return
    const top = el.scrollTop
    const bottomGap = el.scrollHeight - el.clientHeight - el.scrollTop
    if (top < EXTEND_PX) {
      extendingRef.current = true
      const first = months[0]
      const anchorEl = el.firstElementChild
      const anchorTop = anchorEl
        ? anchorEl.getBoundingClientRect().top - el.getBoundingClientRect().top
        : 0
      const added = monthList(addMonths(first.year, first.month, -GROW_STEP), addMonths(first.year, first.month, -1))
      setMonths((m) => [...added, ...m])
      requestAnimationFrame(() => {
        // Keep the SAME month at the same viewport position after prepending.
        const fc = el.firstElementChild
        if (fc) el.scrollTop += fc.getBoundingClientRect().top - el.getBoundingClientRect().top - anchorTop
        extendingRef.current = false
      })
    } else if (bottomGap < EXTEND_PX) {
      extendingRef.current = true
      const last = months[months.length - 1]
      const added = monthList(addMonths(last.year, last.month, 1), addMonths(last.year, last.month, GROW_STEP))
      setMonths((m) => [...m, ...added])
      requestAnimationFrame(() => {
        extendingRef.current = false
      })
    }
  }

  const updateAutoScroll = (clientY: number) => {
    const el = scrollElRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const dir = clientY < rect.top + EDGE_PX ? -1 : clientY > rect.bottom - EDGE_PX ? 1 : 0
    if (dir) startAutoScroll(dir)
    else stopAutoScroll()
  }

  // Release (or cancel) anywhere ends the drag. Edit mode is entered AT ARM
  // (see the hold timer) — by the time the pointer lifts, an armed press on a
  // committed period day already owns the gesture, so release only commits
  // creation drags. A long-press tap on a non-flow day stays a plain tap
  // (DaySheet via the trailing click).
  useEffect(() => {
    if (!drag) return
    const up = () => {
      clearHold()
      stopAutoScroll()
      const d = dragRef.current
      dragRef.current = null
      setDrag(null)
      if (!d?.armed) return
      const range = commitDrag(d)
      if (range) {
        dragJustEnded.current = true
        rangeCompleteRef.current(range.from, range.to)
      }
    }
    // Pointer cancel = the browser reclaimed the gesture (system gesture,
    // palm, interruption) — abort without committing.
    const cancel = () => {
      clearHold()
      dragRef.current = null
      setDrag(null)
      stopAutoScroll()
    }
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    return () => {
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag !== null])

  // Edit-handle drag: pointer down on a cap starts it; window moves extend
  // the bound to the cell under the pointer (with edge auto-scroll).
  useEffect(() => {
    if (!editAxis) return
    const move = (e: PointerEvent) => {
      lastPointerRef.current = { x: e.clientX, y: e.clientY }
      updateAutoScroll(e.clientY)
      const iso = isoAt(e.clientX, e.clientY)
      if (!iso) return
      const axis = editAxisRef.current
      setEdit((prev) => (prev ? (axis === 'start' ? moveStart(prev, iso) : moveEnd(prev, iso)) : prev))
    }
    const end = () => {
      stopAutoScroll()
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
    !!prediction && (prediction.fertileWindow !== null || predictedDays.length > 0)

  const saveEdit = () => {
    const ed = editRef.current
    if (!ed) return
    const range = commitEdit(ed)
    rangeCompleteRef.current(range.from, range.to)
    setEdit(null)
    setEditAxis(null)
  }
  const cancelEdit = () => {
    setEdit(null)
    setEditAxis(null)
  }

  return (
    <div className="relative rounded-3xl bg-white p-5 shadow-[0_6px_24px_rgba(217,111,147,0.12)]">
      {edit && (
        <div
          data-edit-modal
          className="absolute left-1/2 top-2 z-30 w-[calc(100%-1.5rem)] -translate-x-1/2 rounded-2xl border border-rose-100 bg-white/95 p-3 shadow-xl backdrop-blur-sm"
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
      {/* Months scroll inside this fixed-height box (≈ one month), not the page */}
      {/* Day cells are touch-pan-y: a REGULAR vertical swipe over the grid
          scrolls the calendar (BLOOM-0015). A quick swipe never arms — the
          browser takes the pan — and once a long press arms (or an edit
          handle is held) a non-passive touchmove veto keeps the gesture with
          the calendar instead of the scroller. Vertical scrolling also works
          from the sticky weekday strip and the Today pill. */}
      <div
        data-calendar-scroll
        ref={scrollElRef}
        onScroll={onScroll}
        className="-mx-5 h-[21rem] overflow-y-auto overscroll-contain px-5 select-none"
        onPointerMove={(e) => {
          lastPointerRef.current = { x: e.clientX, y: e.clientY }
          updateAutoScroll(e.clientY)
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
          setDrag((prev) => (prev ? extendDrag(prev, iso) : prev))
        }}
      >
      {/* One sticky weekday strip stays at the box top while the continuous
          week rows scroll under it; month boundaries are marked by the
          superscript month label on each 1st. */}
      <div
        data-calendar-weekdays
        className="sticky top-0 z-10 -mx-5 mb-1 bg-white/95 px-5 pb-1.5 pt-3 backdrop-blur-sm"
      >
        <div className="grid grid-cols-7 text-center text-[11px] font-bold uppercase tracking-wider text-ink-soft">
          {WEEKDAY_LABELS.map((w) => (
            <div key={w}>{w}</div>
          ))}
        </div>
      </div>
      {weeks.map((week, wi) => {
        // Anchor for the month whose 1st falls in this row — App's Today pill
        // and the initial scroll bring the row containing the 1st to the top.
        const firstCell = week.find((c) => Number(c.iso.slice(8)) === 1)
        const monthRef = firstCell
          ? `${firstCell.iso.slice(0, 4)}-${Number(firstCell.iso.slice(5, 7)) - 1}`
          : undefined
        return (
          <div key={`w${wi}`} data-month={monthRef} className="grid grid-cols-7">
            {week.map((cell) => {
                  const entry = entriesByDate.get(cell.iso)
                  const isPeriod = entry?.flow !== undefined
                  // Committed period run wins over the live drag preview when
                  // they overlap — both paint the same rose, class assembly
                  // below only differs in which shape source to use. Edit mode
                  // replaces the committed run with the edited bounds.
                  const shape = edit
                    ? dragShape(cell.iso, edit.start, edit.end)
                    : isPeriod
                      ? committedShape(cell.iso)
                      : dragShapeFor(cell.iso)
                  const isStrip = shape === 'start' || shape === 'middle' || shape === 'end'
                  const isPredicted = predictedDays.includes(cell.iso)
                  const isFertile = fertileDays.includes(cell.iso)
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

                  // Strip cells (start cap / square / end cap) fill their grid
                  // column edge-to-edge so adjacent days read as ONE continuous
                  // period bar; the run ends are semicircle caps, the middle a
                  // flush square. A lone day keeps the circle. Everything else
                  // stays the small centered circle.
                  let cls =
                    'flex aspect-square select-none items-center justify-center text-sm transition-colors touch-pan-y'
                  if (isStrip) {
                    cls += ' w-full'
                    if (shape === 'start') cls += ' rounded-l-full rounded-r-none'
                    else if (shape === 'end') cls += ' rounded-r-full rounded-l-none'
                    else cls += ' rounded-none'
                  } else {
                    cls += ' mx-auto w-full max-w-11 rounded-full'
                  }
                  if (!cell.inMonth) cls += ' opacity-25'
                  if (shape) {
                    cls += ' bg-rose-400 font-bold text-white shadow-[0_3px_10px_rgba(217,111,147,0.45)]'
                  } else if (isFertile) {
                    cls += ' bg-lavender-100 font-semibold text-lavender-700'
                  } else if (isPredicted) {
                    cls += ' border-2 border-dashed border-rose-300 text-rose-400'
                  }
                  if (editHandle) cls += ' cursor-grab ring-2 ring-white/80'
                  // The today ring and the selected outline would cut through
                  // the strip (ring-offset seam) — drop them on strip cells so
                  // the period bar stays visually continuous.
                  if (isToday && !isStrip) cls += ' ring-2 ring-rose-400 ring-offset-1 ring-offset-white'
                  if (isSelected && !isStrip) cls += ' outline-2 outline-offset-2 outline-rose-300'
                  if (!cell.inMonth) cls += ' hover:bg-rose-50'

                  const grip = <span aria-hidden className="h-4 w-1 rounded-full bg-white/80" />

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
                          if (cell.iso === editRef.current.start) setEditAxis('start')
                          else if (cell.iso === editRef.current.end) setEditAxis('end')
                          return
                        }
                        dragJustEnded.current = false
                        const d = beginDrag(cell.iso)
                        dragRef.current = d
                        setDrag(d)
                        pressOrigin.current = { x: e.clientX, y: e.clientY }
                        clearHold()
                        // Selection starts only after a long press: hold
                        // LONG_PRESS_MS without moving → arm the drag.
                        holdTimer.current = window.setTimeout(() => {
                          const cur = dragRef.current
                          if (!cur) return
                          const armed = armDrag(cur)
                          dragRef.current = armed
                          setDrag(armed)
                          // Tactile confirmation that the long press registered
                          // (no-op on platforms without a vibrator). Fires at
                          // ARM — the same moment edit mode (below) or the
                          // selection highlight appears.
                          hapticPulse()
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
                        stopAutoScroll()
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
                      className={cls}
                      aria-label={cell.iso}
                    >
                      {editHandle === 'start' ? grip : null}
                      <span>
                        {isMonthStart && (
                          <sup className="text-[8px] font-bold uppercase leading-none tracking-wide">
                            {MONTH_NAMES[Number(cell.iso.slice(5, 7)) - 1].slice(0, 3)}
                          </sup>
                        )}
                        {Number(cell.iso.slice(8))}
                      </span>
                      {editHandle === 'end' ? grip : null}
                    </button>
                  )
                })}
              </div>
            )
          })}
      </div>
      {!showLegend ? null : (
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 border-t border-rose-50 pt-3 text-xs text-ink-soft">
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full bg-rose-400" /> period
          </span>
          {predictedDays.length > 0 && (
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-full border-2 border-dashed border-rose-300" /> predicted
            </span>
          )}
          {prediction.fertileWindow !== null && (
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-full bg-lavender-100" /> fertile window
            </span>
          )}
        </div>
      )}
    </div>
  )
}