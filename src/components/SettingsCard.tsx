import type { Settings } from '../types'
import { SETTINGS_LIMITS } from '../lib/settings'

interface StepperProps {
  label: string
  hint: string
  value: number
  min: number
  max: number
  testId: string
  onChange: (v: number) => void
}

function Stepper({ label, hint, value, min, max, testId, onChange }: StepperProps) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v))
  const btn =
    'flex h-8 w-8 items-center justify-center rounded-full bg-white text-lg font-bold text-rose-500 shadow-[0_2px_8px_rgba(217,111,147,0.15)] transition-colors hover:bg-rose-50 disabled:opacity-40 disabled:hover:bg-white'
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-cream px-4 py-3" data-testid={testId}>
      <div className="min-w-0">
        <p className="text-sm font-bold text-ink">{label}</p>
        <p className="text-[11px] font-semibold leading-tight text-ink-soft">{hint}</p>
      </div>
      <div className="flex shrink-0 items-center">
        <button
          type="button"
          aria-label={`Decrease ${label}`}
          data-testid={`${testId}-minus`}
          onClick={() => onChange(clamp(value - 1))}
          disabled={value <= min}
          className={btn}
        >
          −
        </button>
        <span className="w-12 text-center text-lg font-extrabold text-ink" data-testid={`${testId}-value`}>
          {value}
        </span>
        <button
          type="button"
          aria-label={`Increase ${label}`}
          data-testid={`${testId}-plus`}
          onClick={() => onChange(clamp(value + 1))}
          disabled={value >= max}
          className={btn}
        >
          +
        </button>
      </div>
    </div>
  )
}

interface SettingsCardProps {
  settings: Settings
  onChange: (next: Settings) => void
  onExport: () => void
  onImport: (file: File) => void
}

export default function SettingsCard({ settings, onChange, onExport, onImport }: SettingsCardProps) {
  return (
    <div className="rounded-3xl bg-white p-5 shadow-[0_6px_24px_rgba(217,111,147,0.12)]">
      <h2 className="text-sm font-extrabold uppercase tracking-wider text-ink-soft">Settings</h2>
      <p className="mt-1 text-xs font-semibold text-ink-soft">
        These defaults seed predictions until Bloom has enough logged cycles to learn from your own data.
      </p>
      <div className="mt-4 flex flex-col gap-3">
        <Stepper
          label="Cycle length"
          hint="Default days between periods — used until 2+ cycles are logged."
          value={settings.cycleLength}
          min={SETTINGS_LIMITS.cycleLength.min}
          max={SETTINGS_LIMITS.cycleLength.max}
          testId="settings-cycle-length"
          onChange={(cycleLength) => onChange({ ...settings, cycleLength })}
        />
        <Stepper
          label="Period length"
          hint="Default period duration — used when no period history exists yet."
          value={settings.periodLength}
          min={SETTINGS_LIMITS.periodLength.min}
          max={SETTINGS_LIMITS.periodLength.max}
          testId="settings-period-length"
          onChange={(periodLength) => onChange({ ...settings, periodLength })}
        />
      </div>
      <div className="mt-5 flex flex-col gap-2 border-t border-rose-100 pt-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-ink-soft">Data</h3>
        <button
          type="button"
          onClick={onExport}
          className="rounded-xl bg-rose-50 px-4 py-2.5 text-sm font-bold text-rose-600 transition-colors hover:bg-rose-100"
        >
          Export all data
        </button>
        <label className="cursor-pointer rounded-xl bg-white px-4 py-2.5 text-center text-sm font-bold text-rose-600 shadow-[0_2px_8px_rgba(217,111,147,0.15)] transition-colors hover:bg-rose-50">
          Import data
          <input
            type="file"
            accept=".json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) onImport(file)
              e.target.value = ''
            }}
          />
        </label>
        <p className="text-[11px] font-semibold text-ink-soft/70">
          Export saves your period history and settings as a JSON file. Import replaces your current data.
        </p>
      </div>
      <p className="mt-4 text-[11px] font-semibold text-ink-soft/80">Saved automatically on this device.</p>
    </div>
  )
}