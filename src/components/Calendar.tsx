import { useEffect, useMemo, useRef, useState } from 'react'
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
import { cancelHaptic, hapticLongPress } from '../lib/haptics'
import {
  armDrag,
  beginDrag,
  commitDrag,
  extendDrag,
  LONG_PRESS_MS,
  SLOP_PX,
} from '../lib/rangeDrag'
import type { RangeDrag } from '../lib/rangeDrag'
import { cellFillClass, cellLayoutClass, dragShape, monthScoopClass, runShape } from '../lib/rangeStyle'
import type { DayShape } from '../lib/rangeStyle'
import { beginEdit, commitEdit, deleteRange, extendEditRange, moveEnd, moveStart, runBoundsAt } from '../lib/editRange'
import type { EditRange } from '../lib/editRange'

/** Pointer within this many px of the scroll-box edge → auto-scroll while dragging. */
const EDGE_PX = 64
/** Auto-scroll speed while dragging at an edge (px per animation frame). */
const AUTO_SCROLL_PX = 14

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
  /** Delete a committed period range (from edit mode). */
  onRangeDelete: (start: string, end: string) => void
  /** Max days a drag/edit range can span (from settings.periodLength). */
  maxPeriodDays?: number
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
  onRangeDelete,
  maxPeriodDays,
}: CalendarProps) {
  const today = todayISO()
  // The window shows the last PAST_MONTHS months plus FUTURE_MONTHS ahead;
  // older history is revealed on demand via the "Load older periods" button
  // (loadOlder) — the past never auto-grows on scroll.
  const [months, setMonths] = useState<MonthRef[]>(() => initialMonths())
  // ONE flowing week strip across the whole month window — weeks span month
  // boundaries (a month ending Tue 31 continues same-row into Wed 1).
  const weeks = useMemo(() => continuousGrid(months), [months])
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
  const scrollElRef = useRef<HTMLDivElement | null>(null)
  const lastPointerRef = useRef({ x: 0, y: 0 })
  const autoScrollDirRef = useRef(0)
  const rafRef = useRef(0)
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
  const entriesByDate = useMemo(() => {
    const m = new Map<string, Snapshot['entries'][number]>()
    for (const e of snap.entries) m.set(e.date, e)
    return m
  }, [snap.entries])
  // Even-month tint predicate — shared by monthEdges, the cell bg assembly
  // and the concave scoop check so all three stay in sync.
  const cellTinted = (c: { iso: string; inMonth: boolean }) =>
    c.inMonth && Number(c.iso.slice(5, 7)) % 2 === 0
  // Precompute month-block edge corners so even-month blocks get rounded
  // outer edges (e.g. rounded-tl-xl on the top-left cell of a month).
  // A neighbor counts as "connected" if it's the same month OR if it's a
  // scoop cell (odd-month, inMonth, tinted left+top) — the gray continues
  // into scoop cells, so we must not round the shared edge.
  const monthEdges = useMemo(() => {
    const edgeMap = new Map<string, string>()
    const isScoop = (o: { iso: string; inMonth: boolean }, oi: number, row: { iso: string; inMonth: boolean }[], ri: number) => {
      if (!o || !o.inMonth) return false
      const m = Number(o.iso.slice(5, 7))
      if (m % 2 !== 0 && oi > 0 && ri > 0) {
        // Odd month — check if scoop (tinted left AND top)
        return cellTinted(row[oi - 1]) && cellTinted(weeks[ri - 1][oi])
      }
      return false
    }
    for (let wi = 0; wi < weeks.length; wi++) {
      for (let di = 0; di < 7; di++) {
        const c = weeks[wi][di]
        if (!c.inMonth) continue
        const monthNum = Number(c.iso.slice(5, 7))
        if (monthNum % 2 !== 0) continue // only even months get blocks
        const sameMonth = (o: { iso: string; inMonth: boolean }) =>
          o && o.inMonth && o.iso.slice(5, 7) === c.iso.slice(5, 7)
        const left = di > 0 && (sameMonth(weeks[wi][di - 1]) || isScoop(weeks[wi][di - 1], di - 1, weeks[wi], wi))
        const right = di < 6 && (sameMonth(weeks[wi][di + 1]) || isScoop(weeks[wi][di + 1], di + 1, weeks[wi], wi))
        const top = wi > 0 && (sameMonth(weeks[wi - 1][di]) || isScoop(weeks[wi - 1][di], di, weeks[wi - 1], wi - 1))
        const bottom = wi < weeks.length - 1 && (sameMonth(weeks[wi + 1][di]) || isScoop(weeks[wi + 1][di], di, weeks[wi + 1], wi + 1))
        const corners: string[] = []
        if (!top && !left) corners.push('rounded-tl-xl')
        if (!top && !right) corners.push('rounded-tr-xl')
        if (!bottom && !left) corners.push('rounded-bl-xl')
        if (!bottom && !right) corners.push('rounded-br-xl')
        if (corners.length) edgeMap.set(c.iso, corners.join(' '))
      }
    }
    return edgeMap
  }, [weeks])
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
          setEdit((prev) => {
            if (!prev) return prev
            if (prev.dragMode === 'range') return extendEditRange(prev, iso, maxPeriodDays)
            const axis = editAxisRef.current
            return axis === 'start' ? moveStart(prev, iso, maxPeriodDays) : moveEnd(prev, iso, maxPeriodDays)
          })
        } else if (dragRef.current?.armed) {
          setDrag((prev) => (prev ? extendDrag(prev, iso, maxPeriodDays) : prev))
        }
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }

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
      stopAutoScroll()
      dragRef.current = null
      setDrag(null)
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
      stopAutoScroll()
    }
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    return () => {
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
    }
  }, [])

  // Edit-handle drag: pointer down on a cap starts it; window moves extend
  // the bound to the cell under the pointer (with edge auto-scroll).
  useEffect(() => {
    if (!editAxis) return
    const move = (e: PointerEvent) => {
      lastPointerRef.current = { x: e.clientX, y: e.clientY }
      updateAutoScroll(e.clientY)
      const iso = isoAt(e.clientX, e.clientY)
      if (!iso) return
      setEdit((prev) => {
        if (!prev) return prev
        // Range mode: long-press drag sets BOTH bounds from the press origin
        // to the cell under the pointer. Handle mode: only the tapped axis.
        if (prev.dragMode === 'range') return extendEditRange(prev, iso, maxPeriodDays)
        const axis = editAxisRef.current
        return axis === 'start' ? moveStart(prev, iso, maxPeriodDays) : moveEnd(prev, iso, maxPeriodDays)
      })
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
        onScroll={(e) => {
          const t = e.currentTarget.scrollTop
          setAtTop(t < 20)
        }}
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
          setDrag((prev) => (prev ? extendDrag(prev, iso, maxPeriodDays) : prev))
        }}
      >
      {weeks.map((week, wi) => {
        // Anchor for the month whose 1st falls in this row — App's Today pill
        // and the initial scroll bring the row containing the 1st to the top.
        const firstCell = week.find((c) => Number(c.iso.slice(8)) === 1)
        const monthRef = firstCell
          ? `${firstCell.iso.slice(0, 4)}-${Number(firstCell.iso.slice(5, 7)) - 1}`
          : undefined
        return (
          <div key={`w${wi}`} data-month={monthRef} className="grid grid-cols-7">
            {week.map((cell, di) => {
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

                  const monthTint = cell.inMonth && Number(cell.iso.slice(5, 7)) % 2 === 0
                  // Capsule strip membership (start/middle/end); a lone day
                  // keeps its circle. Scoop cells also fill the column so the
                  // tint connects flush with the adjacent even-month block.
                  // Concave scoop: an untinted cell tucked into the inner
                  // corner of an even-month block (tinted left AND top
                  // neighbors) paints the tint itself and covers it with a
                  // white rounded-tl overlay — tint outside, white inside.
                  let scoop = ''
                  if (!monthTint && cell.inMonth) {
                    const leftTinted =
                      di > 0 && cellTinted(weeks[wi][di - 1])
                    const topTinted =
                      wi > 0 && cellTinted(weeks[wi - 1][di])
                    scoop = monthScoopClass(monthTint, leftTinted, topTinted)
                  }
                  // Strip cells (start cap / square / end cap) fill their grid
                  // column edge-to-edge so adjacent days read as ONE continuous
                  // period bar; the run ends are semicircle caps, the middle a
                  // flush square. A lone day keeps the circle. Scoop cells
                  // also fill the column so the tint connects flush with the
                  // adjacent even-month block. Everything else stays the small
                  // centered circle.
                  let cls =
                    'flex aspect-square select-none items-center justify-center text-sm transition-colors touch-pan-y'
                  // Layout: period-shaped cells keep their capsule/circle
                  // geometry on every month (tinted or not); unshaped cells
                  // are full-width squares on tint months, circles elsewhere.
                  cls += ' ' + cellLayoutClass(shape, !!scoop, monthTint)
                  if (!cell.inMonth) cls += ' opacity-25'
                  // Fill: exactly ONE bg utility per cell — stacking the tint
                  // under a specific fill let stylesheet emission order pick
                  // slate over rose, painting strips gray on tinted months.
                  cls += ' ' + cellFillClass(shape, !!scoop, isFertile, isPredicted, monthTint)
                  if (!cell.inMonth) cls += ' hover:bg-rose-50'
                  // Rounded corners on month-block outer edges — only on
                  // unshaped cells; a period capsule/circle keeps its own
                  // rounding (a block corner over a rose cap painted a
                  // squared-off notch on tinted months).
                  const edgeCls = shape ? undefined : monthEdges.get(cell.iso)
                  if (edgeCls) cls += ' ' + edgeCls
                  if (editHandle) cls += ' cursor-grab ring-2 ring-white/80'
                  // Today: simple border circle (no ring-offset that gets cut off).
                  // Selected: outline for non-period cells only.
                  if (isToday) cls += ' border-2 border-rose-400'
                  if (isSelected && !shape) cls += ' outline-2 outline-offset-2 outline-rose-300'
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
                          // Handle taps switch to handle-mode so only that axis
                          // moves on drag (range-mode drags set BOTH bounds).
                          if (cell.iso === editRef.current.start) {
                            setEdit((prev) =>
                              prev ? { ...prev, dragMode: 'handle', pressOriginISO: prev.start } : prev,
                            )
                            setEditAxis('start')
                          } else if (cell.iso === editRef.current.end) {
                            setEdit((prev) =>
                              prev ? { ...prev, dragMode: 'handle', pressOriginISO: prev.end } : prev,
                            )
                            setEditAxis('end')
                          }
                          return
                        }
                        dragJustEnded.current = false
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
                        // modern Chrome Android).  The delay is embedded in
                        // the pattern itself: [LONG_PRESS_MS, 30, 30, 30].
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
                      className={`${cls}${scoop ? ' relative' : ''}`}
                      aria-label={cell.iso}
                    >
                      {scoop && !shape ? (
                        <span aria-hidden className="pointer-events-none absolute inset-y-0 right-0 bg-white rounded-tl-[12px]" style={{ left: '12px' }} />
                      ) : null}
                      {editHandle === 'start' ? grip : null}
                      <span className="relative z-10">
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