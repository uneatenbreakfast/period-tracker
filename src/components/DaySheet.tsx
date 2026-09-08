import { useEffect, useState } from 'react'
import type { DayEntry, FlowLevel } from '../types'
import { fromISODate } from '../lib/dates'
import { FLOW_LEVELS, orderedSymptomKeys, SYMPTOMS } from '../lib/ui'

interface DaySheetProps {
  date: string
  entry: DayEntry | undefined
  onToggleFlow: (flow: FlowLevel) => void
  onToggleSymptom: (key: string) => void
  onSaveNotes: (notes: string) => void
  onClearDay: () => void
  onClose: () => void
}

export default function DaySheet({
  date,
  entry,
  onToggleFlow,
  onToggleSymptom,
  onSaveNotes,
  onClearDay,
  onClose,
}: DaySheetProps) {
  const [notes, setNotes] = useState(entry?.notes ?? '')
  const [notesSaved, setNotesSaved] = useState(true)

  useEffect(() => setNotes(entry?.notes ?? ''), [date, entry?.notes])

  const title = fromISODate(date).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
  const activeSymptoms = orderedSymptomKeys(entry)
  const hasEntry = entry !== undefined

  return (
    <div data-sheet className="fixed inset-0 z-20 flex items-end justify-center bg-ink/30" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-5 pb-8 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-extrabold text-ink">{title}</h2>
            <p className="text-xs text-ink-soft">{hasEntry ? 'Logged day — tap chips to edit' : 'Nothing logged yet'}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-cream p-2 text-ink-soft transition-colors hover:bg-rose-50 hover:text-rose-500"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <section className="mt-4">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-soft">Period flow</h3>
          <div className="flex flex-wrap gap-2">
            {FLOW_LEVELS.map((f) => {
              const active = entry?.flow === f.value
              return (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => onToggleFlow(f.value)}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition-all ${
                    active
                      ? 'bg-rose-400 text-white shadow-[0_3px_10px_rgba(217,111,147,0.4)]'
                      : 'bg-rose-50 text-rose-700 hover:bg-rose-100'
                  }`}
                >
                  {f.emoji} {f.label}
                </button>
              )
            })}
          </div>
        </section>

        <section className="mt-5">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-soft">Symptoms</h3>
          <div className="flex flex-wrap gap-2">
            {SYMPTOMS.map((s) => {
              const active = activeSymptoms.includes(s.key)
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => onToggleSymptom(s.key)}
                  className={`rounded-full px-3.5 py-2 text-sm font-semibold transition-all ${
                    active
                      ? 'bg-lavender-400 text-white shadow-[0_3px_10px_rgba(185,167,217,0.45)]'
                      : 'bg-lavender-50 text-lavender-700 hover:bg-lavender-100'
                  }`}
                >
                  {s.emoji} {s.label}
                </button>
              )
            })}
          </div>
        </section>

        <section className="mt-5">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-soft">Notes</h3>
          <textarea
            value={notes}
            onChange={(e) => {
              setNotes(e.target.value)
              setNotesSaved(false)
            }}
            placeholder="Anything you want to remember about this day…"
            rows={3}
            className="w-full resize-none rounded-2xl bg-cream px-4 py-3 text-sm text-ink placeholder:text-ink-soft/60"
          />
          {!notesSaved && (
            <div className="mt-2 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  onSaveNotes(notes.trim())
                  setNotesSaved(true)
                }}
                className="rounded-full bg-rose-400 px-5 py-2 text-sm font-bold text-white shadow-[0_3px_10px_rgba(217,111,147,0.4)] transition-colors hover:bg-rose-500"
              >
                Save notes
              </button>
            </div>
          )}
        </section>

        {hasEntry && (
          <button
            type="button"
            onClick={onClearDay}
            className="mt-5 w-full rounded-full border border-peach-200 py-2.5 text-sm font-bold text-peach-400 transition-colors hover:bg-peach-50"
          >
            Clear this day
          </button>
        )}
      </div>
    </div>
  )
}