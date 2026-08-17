import type { Prediction } from '../types'
import { formatShort, predictionSummary } from '../lib/ui'

interface PredictionsCardProps {
  prediction: Prediction
  entryCount: number
}

function Row({ emoji, title, body, tone }: { emoji: string; title: string; body: string; tone: string }) {
  return (
    <div className={`flex items-center gap-3 rounded-2xl ${tone} px-4 py-3`}>
      <span className="text-xl">{emoji}</span>
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wider opacity-70">{title}</p>
        <p className="text-sm font-bold">{body}</p>
      </div>
    </div>
  )
}

export default function PredictionsCard({ prediction, entryCount }: PredictionsCardProps) {
  if (entryCount === 0) {
    return (
      <div className="rounded-3xl border-2 border-dashed border-rose-200 bg-rose-50/50 p-6 text-center">
        <p className="text-3xl">🌸</p>
        <p className="mt-2 text-sm font-semibold text-ink">Welcome to Bloom</p>
        <p className="mt-1 text-sm text-ink-soft">
          Tap a day on the calendar to log your period flow and symptoms. After a couple of cycles, predictions will
          appear here.
        </p>
      </div>
    )
  }

  const fertile = prediction.fertileWindow

  return (
    <div className="rounded-3xl bg-white p-5 shadow-[0_6px_24px_rgba(217,111,147,0.12)]">
      <h2 className="mb-3 text-sm font-extrabold uppercase tracking-wider text-ink-soft">Predictions</h2>
      <div className="flex flex-col gap-2">
        <Row
          emoji="🩷"
          title={prediction.nextPeriodStart ? 'Next period' : 'Waiting for data'}
          body={predictionSummary(prediction, entryCount)}
          tone="bg-rose-50 text-rose-700"
        />
        <Row
          emoji="🌸"
          title="Fertile window"
          body={
            fertile
              ? `${formatShort(fertile.start)} – ${formatShort(fertile.end)}`
              : 'Needs two logged cycles'
          }
          tone="bg-lavender-50 text-lavender-700"
        />
        <Row
          emoji="📅"
          title="Average cycle"
          body={prediction.avgCycleLength !== null ? `${prediction.avgCycleLength} days` : '—'}
          tone="bg-peach-50 text-peach-400"
        />
      </div>
    </div>
  )
}