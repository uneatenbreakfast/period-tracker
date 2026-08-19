import { useEffect, useMemo, useRef, useState } from 'react'
import type { Prediction, Snapshot } from '../types'
import { monthGrid, MONTH_NAMES, todayISO, WEEKDAY_LABELS } from '../lib/dates'
import type { MonthRef } from '../lib/dates'

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
  /** Drag a day to another → log period flow over the whole inclusive range */
  onLogRange: (from: string, to: string) => void
}

export default function Calendar({
  months,
  snap,
  prediction,
  predictedDays,
  fertileDays,
  selectedDate,
  onSelect,
  onLogRange,
}: CalendarProps) {
  const today = todayISO()
  const [todayYear, todayMonth] = today.split('-').map(Number)
  const entriesByDate = useMemo(() => {
    const m = new Map<string, Snapshot['entries'][number]>()
    for (const e of snap.entries) m.set(e.date, e)
    return m
  }, [snap.entries])

  const showLegend =
    !!prediction && (prediction.fertileWindow !== null || predictedDays.length > 0)

  // Drag-to-range: pointer down on a day starts a range, moving over other days
  // extends the live preview, release commits it. Drag state lives in a ref so
  // fast drags can't outrun renders; setDrag mirrors it for the preview.
  const [drag, setDrag] = useState<{ start: string; end: string } | null>(null)
  const dragRef = useRef<{ start: string; end: string } | null>(null)
  const movedRef = useRef(false)

  const endDrag = () => {
    const d = dragRef.current
    dragRef.current = null
    setDrag(null)
    if (!d) return
    // commit only a real drag spanning ≥ 2 days; a plain tap keeps click→DaySheet
    const [a, b] = d.start <= d.end ? [d.start, d.end] : [d.end, d.start]
    if (movedRef.current && a !== b) onLogRange(a, b)
  }

  useEffect(() => {
    if (!drag) return
    // release outside the calendar must end the drag too
    window.addEventListener('pointerup', endDrag)
    return () => window.removeEventListener('pointerup', endDrag)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag !== null])

  const inDragRange = (iso: string) => {
    if (!drag) return false
    const [a, b] = drag.start <= drag.end ? [drag.start, drag.end] : [drag.end, drag.start]
    return iso >= a && iso <= b
  }

  return (
    <div className="rounded-3xl bg-white p-5 shadow-[0_6px_24px_rgba(217,111,147,0.12)]">
      {/* Months scroll inside this fixed-height box (≈ one month), not the page */}
      <div
        data-calendar-scroll
        className="-mx-5 h-[21rem] overflow-y-auto overscroll-contain px-5 select-none"
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
                  const isPredicted = predictedDays.includes(cell.iso)
                  const isFertile = fertileDays.includes(cell.iso)
                  const isToday = cell.iso === today
                  const isSelected = cell.iso === selectedDate
                  const isDragPreview = inDragRange(cell.iso) && !isPeriod

                  let cls =
                    'mx-auto flex aspect-square w-full max-w-11 items-center justify-center rounded-full text-sm transition-colors touch-pan-y'
                  if (!cell.inMonth) cls += ' opacity-25'
                  if (isPeriod) {
                    cls += ' bg-rose-400 font-bold text-white shadow-[0_3px_10px_rgba(217,111,147,0.45)]'
                  } else if (isDragPreview) {
                    // live range preview while dragging
                    cls += ' bg-rose-200 font-bold text-rose-800'
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
                        if (e.button !== 0) return
                        movedRef.current = false
                        dragRef.current = { start: cell.iso, end: cell.iso }
                        setDrag(dragRef.current)
                      }}
                      onPointerEnter={() => {
                        const d = dragRef.current
                        if (!d) return
                        if (d.end !== cell.iso) movedRef.current = true
                        dragRef.current = { ...d, end: cell.iso }
                        setDrag(dragRef.current)
                      }}
                      onPointerUp={endDrag}
                      onPointerCancel={() => {
                        dragRef.current = null
                        movedRef.current = false
                        setDrag(null)
                      }}
                      onClick={() => {
                        // a committed drag also fires click on the release cell — swallow it
                        if (movedRef.current) {
                          movedRef.current = false
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