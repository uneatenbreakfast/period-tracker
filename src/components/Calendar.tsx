import { useEffect, useMemo, useRef, useState } from 'react'
import type { Prediction, Snapshot } from '../types'
import { monthGrid, MONTH_NAMES, todayISO, WEEKDAY_LABELS } from '../lib/dates'
import type { MonthRef } from '../lib/dates'
import { beginDrag, commitDrag, extendDrag } from '../lib/rangeDrag'
import type { RangeDrag } from '../lib/rangeDrag'

interface CalendarProps {
  /** Months to render, oldest first */
  months: MonthRef[]
  snap: Snapshot
  prediction: Prediction
  /** Dates (ISO) that are predicted period days this month */
  predictedDays: string[]
  fertileDays: string[]
  selectedDate: string | null
  onSelect: (date: string) => void
  /** Drag across days: period range start → end (inclusive, ascending) */
  onRangeComplete: (start: string, end: string) => void
}

export default function Calendar({
  months,
  snap,
  prediction,
  predictedDays,
  fertileDays,
  selectedDate,
  onSelect,
  onRangeComplete,
}: CalendarProps) {
  const today = todayISO()
  const [todayYear, todayMonth] = today.split('-').map(Number)
  const [drag, setDrag] = useState<RangeDrag | null>(null)
  // Set when a drag commits on release; the trailing click (same element) is swallowed.
  const dragJustEnded = useRef(false)
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
  const entriesByDate = useMemo(() => {
    const m = new Map<string, Snapshot['entries'][number]>()
    for (const e of snap.entries) m.set(e.date, e)
    return m
  }, [snap.entries])

  // Release (or cancel) anywhere ends the drag; only a real multi-day drag commits.
  useEffect(() => {
    if (!drag) return
    const up = () => {
      const d = dragRef.current
      dragRef.current = null
      setDrag(null)
      if (!d) return
      const range = commitDrag(d)
      if (range) {
        dragJustEnded.current = true
        rangeCompleteRef.current(range.from, range.to)
      }
    }
    // Pointer cancel = the browser reclaimed the gesture (system gesture,
    // palm, interruption) — abort without committing.
    const cancel = () => {
      dragRef.current = null
      setDrag(null)
    }
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    return () => {
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag !== null])

  const inDragRange = (iso: string) => {
    if (!drag) return false
    const [a, b] = drag.start <= drag.end ? [drag.start, drag.end] : [drag.end, drag.start]
    return iso >= a && iso <= b
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

  return (
    <div className="rounded-3xl bg-white p-5 shadow-[0_6px_24px_rgba(217,111,147,0.12)]">
      {/* Months scroll inside this fixed-height box (≈ one month), not the page */}
      {/* Day cells are touch-none: a touch drag always selects a range and never
          scrolls. Vertical scrolling still works from the sticky month header
          strip, the weekday row, and the Today pill. */}
      <div
        data-calendar-scroll
        className="-mx-5 h-[21rem] overflow-y-auto overscroll-contain px-5 select-none"
        onPointerMove={(e) => {
          // extend the drag to whatever day cell is under the pointer
          const iso = isoAt(e.clientX, e.clientY)
          if (!iso) return
          setDrag((d) => (d ? extendDrag(d, iso) : d))
        }}
      >
      {months.map(({ year, month }, mi) => {
        const grid = monthGrid(year, month)
        const isCurrentMonth = year === todayYear && month === todayMonth
        return (
          <section
            key={`${year}-${month}`}
            data-month={`${year}-${month}`}
            aria-label={`${MONTH_NAMES[month]} ${year}`}
            className={mi === 0 ? '' : 'mt-5 border-t border-rose-50'}
          >
            <div className="sticky top-0 z-10 -mx-5 mb-1 bg-white/95 px-5 pb-1 pt-3 backdrop-blur-sm">
              <div className="flex items-baseline justify-between">
                <h2 className="text-sm font-extrabold uppercase tracking-wider text-ink">
                  {MONTH_NAMES[month]} {year}
                </h2>
                {isCurrentMonth && <span className="text-[11px] font-bold text-rose-400">Today</span>}
              </div>
              <div className="mt-1 grid grid-cols-7 text-center text-[11px] font-bold uppercase tracking-wider text-ink-soft">
                {WEEKDAY_LABELS.map((w) => (
                  <div key={w}>{w}</div>
                ))}
              </div>
            </div>
            {grid.map((week, wi) => (
              <div key={wi} className="grid grid-cols-7">
                {week.map((cell) => {
                  const entry = entriesByDate.get(cell.iso)
                  const isPeriod = entry?.flow !== undefined
                  const isDragRange = inDragRange(cell.iso)
                  const isPredicted = predictedDays.includes(cell.iso)
                  const isFertile = fertileDays.includes(cell.iso)
                  const isToday = cell.iso === today
                  const isSelected = cell.iso === selectedDate

                  let cls =
                    'mx-auto flex aspect-square w-full max-w-11 select-none items-center justify-center rounded-full text-sm transition-colors touch-none'
                  if (!cell.inMonth) cls += ' opacity-25'
                  if (isPeriod || isDragRange) {
                    cls += ' bg-rose-400 font-bold text-white shadow-[0_3px_10px_rgba(217,111,147,0.45)]'
                  } else if (isFertile) {
                    cls += ' bg-lavender-100 font-semibold text-lavender-700'
                  } else if (isPredicted) {
                    cls += ' border-2 border-dashed border-rose-300 text-rose-400'
                  }
                  if (isToday) cls += ' ring-2 ring-rose-400 ring-offset-1 ring-offset-white'
                  if (isSelected) cls += ' outline-2 outline-offset-2 outline-rose-300'
                  if (!cell.inMonth) cls += ' hover:bg-rose-50'

                  return (
                    <button
                      key={cell.iso}
                      type="button"
                      onPointerDown={(e) => {
                        // left button / primary touch only — ignore right-click & second finger
                        if (e.button !== 0 || !e.isPrimary) return
                        dragJustEnded.current = false
                        const d = beginDrag(cell.iso)
                        dragRef.current = d
                        setDrag(d)
                      }}
                      onPointerCancel={() => {
                        dragRef.current = null
                        setDrag(null)
                      }}
                      onClick={() => {
                        // A drag commits on release; swallow the trailing click.
                        if (dragJustEnded.current) {
                          dragJustEnded.current = false
                          return
                        }
                        onSelect(cell.iso)
                      }}
                      className={cls}
                      aria-label={cell.iso}
                    >
                      {Number(cell.iso.slice(8))}
                    </button>
                  )
                })}
              </div>
            ))}
          </section>
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
