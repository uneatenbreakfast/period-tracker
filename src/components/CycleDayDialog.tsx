import type { CycleDayLabel } from '../lib/cycle'
import { fromISODate } from '../lib/dates'

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

  return (
    <div
      data-sheet
      className="fixed inset-0 z-20 flex items-end justify-center bg-ink/30 backdrop-blur-[2px]"
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
            Day {label.day} of {label.total}
          </p>
        ) : (
          <p className="mt-2 text-center text-2xl font-extrabold tracking-tight text-ink">
            No cycle yet
          </p>
        )}
        <p className="mt-1 text-center text-xs text-ink-soft">
          {label
            ? 'Tap below to log your notes, flow and symptoms for this day.'
            : 'Log your first period day to start cycle predictions.'}
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
}