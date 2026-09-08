import { useEffect } from 'react'
import type { CycleDayLabel } from '../lib/cycle'
import { fromISODate } from '../lib/dates'
import { createPortal } from 'react-dom'
import { revealDelta } from '../lib/sheetReveal'

interface CycleDayDialogProps {
  date: string
  /** Cycle-day position for the tapped date — null when no period logged yet. */
  label: CycleDayLabel | null
  /** Replace this summary with the notes & mood form (DaySheet). */
  onOpenForm: () => void
  /** Dismiss — returns to the calendar without opening the form. */
  onClose: () => void
}

/**
 * Bottom-sheet summary shown when a calendar day is tapped, BEFORE the notes
 * & mood form: tells the user where the day sits in the current cycle (e.g.
 * "day 2 of 26"), with a single button that opens the full logging form.
 */
export default function CycleDayDialog({ date, label, onOpenForm, onClose }: CycleDayDialogProps) {
  const title = fromISODate(date).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  // The sheet slides over the lower part of the calendar. If it covers the
  // day that was just tapped (the day sits behind the opaque sheet panel),
  // scroll the calendar so the day — with its selection ring — is visible in
  // the strip above the sheet. Runs once per date change (the dialog is a
  // fresh mount per tap, so this fires on open).
  useEffect(() => {
    // Measure after layout: the portal content above (this sheet) and the
    // scroller's day buttons both need their final positions.
    const raf = requestAnimationFrame(() => {
      const scroller = document.querySelector<HTMLElement>('[data-calendar-scroll]')
      const sheet = document.querySelector<HTMLElement>('[data-sheet]')
      if (!scroller || !sheet) return
      const cell = scroller.querySelector<HTMLElement>(`button[aria-label="${date}"]`)
      // The white sheet panel is the first child of the [data-sheet] overlay.
      const panel = sheet.firstElementChild as HTMLElement | null
      if (!cell || !panel) return
      const cellBottom = cell.getBoundingClientRect().bottom
      const sheetTop = panel.getBoundingClientRect().top
      const delta = revealDelta(cellBottom, sheetTop)
      if (delta > 0) scroller.scrollTop += delta
    })
    return () => cancelAnimationFrame(raf)
  }, [date])

  return (
    <DialogOverlay
      title={title}
      label={label}
      onOpenForm={onOpenForm}
      onClose={onClose}
    />
  )
}

/**
 * Rendered INSIDE the calendar's scroll box (`data-calendar-scroll`) via portal,
 * so wheel/touch gestures over the dim backdrop fall through to the calendar's
 * own scroll handling — the month grid keeps scrolling while the summary sheet
 * floats above it. No backdrop blur: the grid stays readable behind the sheet.
 */
function DialogOverlay({
  title,
  label,
  onOpenForm,
  onClose,
}: Pick<CycleDayDialogProps, 'label' | 'onOpenForm' | 'onClose'> & { title: string }) {
  const overlay = (
    <div
      data-sheet
      className="fixed inset-0 z-20 flex items-end justify-center bg-ink/30"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${title} — cycle day`}
    >
      <div
        className="w-full max-w-md rounded-t-3xl bg-white p-5 pb-8 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex items-start justify-between">
          <h2 className="text-lg font-extrabold text-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-cream p-2 text-ink-soft transition-colors hover:bg-rose-50 hover:text-rose-500"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {label ? (
          <p className="mt-2 text-center text-2xl font-extrabold tracking-tight text-ink">
            {label.total === null
              ? `Day ${label.day}`
              : `Day ${label.day} of ${label.total}`}
          </p>
        ) : (
          <p className="mt-2 text-center text-2xl font-extrabold tracking-tight text-ink">
            No cycle yet
          </p>
        )}
        <p className="mt-1 text-center text-xs text-ink-soft">
          {label
            ? 'Tap below to log your notes, flow and symptoms for this day.'
            : 'Log your period days to place this day in a cycle.'}
        </p>

        <button
          type="button"
          onClick={onOpenForm}
          className="mt-5 w-full rounded-full bg-rose-400 px-5 py-3 text-sm font-bold text-white shadow-[0_3px_10px_rgba(217,111,147,0.4)] transition-colors hover:bg-rose-500"
        >
          Open notes &amp; mood
        </button>
      </div>
    </div>
  )

  // The summary must live INSIDE the calendar scroller for scroll pass-through.
  // Fall back to plain render if the scroller isn't in the DOM (never happens
  // for a day tap — the calendar is on screen — but keeps mount safe).
  const scroller = document.querySelector('[data-calendar-scroll]')
  return scroller ? createPortal(overlay, scroller) : overlay
}