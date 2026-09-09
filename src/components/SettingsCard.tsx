import { useState } from 'react'
import { createPortal } from 'react-dom'
import type { CalendarStyle, Settings } from '../types'
import { SETTINGS_LIMITS } from '../lib/settings'
import ColorPickerModal from './ColorPickerModal'

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
  onClearAll: () => void
}

interface StyleField {
  key: keyof CalendarStyle
  label: string
  hint: string
}

/** Style picker groups (BLOOM-0022 + BLOOM-0023) — each maps to a visual. */
interface StyleGroup {
  title: string
  hint?: string
  fields: StyleField[]
}

const STYLE_GROUPS: StyleGroup[] = [
  {
    title: 'Calendar',
    hint: 'Cells, strips and legend swatches.',
    fields: [
      { key: 'period', label: 'Period', hint: 'Period days on the calendar' },
      { key: 'predicted', label: 'Predicted', hint: 'Dashed outline for the predicted period' },
      { key: 'fertile', label: 'Fertile', hint: 'Fertile window days' },
      { key: 'ovulation', label: 'Ovulation', hint: 'Ovulation day dot' },
      { key: 'safe', label: 'Safe', hint: 'Safe days after the fertile window' },
    ],
  },
  {
    title: 'Month background',
    hint: 'The soft tint behind alternating months.',
    fields: [{ key: 'monthTint', label: 'Month tint', hint: 'Background tint of even months' }],
  },
  {
    title: 'Trend bars',
    hint: 'Cycle chart in the Trends tab — period segment follows the Period color.',
    fields: [
      { key: 'trendFertile', label: 'Fertile bar', hint: 'Fertile window segment in cycle bars' },
      { key: 'trendOvulation', label: 'Ovulation mark', hint: 'Marker circle at ovulation day' },
    ],
  },
  {
    title: 'Health ring',
    hint: 'Phase ring on the Health tab — period phase follows the Period color.',
    fields: [
      { key: 'ringFollicular', label: 'Follicular', hint: 'Pre-ovulation phase of the ring' },
      { key: 'ringOvulation', label: 'Ovulation', hint: 'Ovulation phase of the ring' },
      { key: 'ringLuteal', label: 'Luteal', hint: 'Post-ovulation phase of the ring' },
    ],
  },
]

function StyleRow({
  field,
  value,
  onOpen,
}: {
  field: StyleField
  value: string
  onOpen: () => void
}) {
  return (
    <div
      className="flex items-center justify-between gap-3 rounded-2xl bg-cream px-4 py-3"
      data-testid={`settings-style-${field.key}`}
    >
      <div className="min-w-0">
        <p className="text-sm font-bold text-ink">{field.label}</p>
        <p className="text-[11px] font-semibold leading-tight text-ink-soft">{field.hint}</p>
      </div>
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Change ${field.label} color`}
        data-testid={`settings-style-${field.key}-input`}
        className="h-9 w-9 shrink-0 cursor-pointer rounded-full shadow-[0_2px_8px_rgba(87,66,78,0.2)] transition-transform hover:scale-105"
        style={{ backgroundColor: value }}
      />
    </div>
  )
}

export default function SettingsCard({ settings, onChange, onExport, onImport, onClearAll }: SettingsCardProps) {
  // Which style field's color picker is open — null = no modal.
  const [editing, setEditing] = useState<StyleField | null>(null)

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
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-cream px-4 py-3" data-testid="settings-show-safe-days">
          <div className="min-w-0">
            <p className="text-sm font-bold text-ink">Show safe days</p>
            <p className="text-[11px] font-semibold leading-tight text-ink-soft">
              Highlight the post-fertile window on the calendar.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={settings.showSafeDays}
            aria-label="Show safe days"
            data-testid="settings-show-safe-days-toggle"
            onClick={() => onChange({ ...settings, showSafeDays: !settings.showSafeDays })}
            className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${settings.showSafeDays ? 'bg-rose-500' : 'bg-ink-soft/20'}`}
          >
            <span
              className={`absolute left-0.5 top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${settings.showSafeDays ? 'translate-x-5' : ''}`}
            />
          </button>
        </div>
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-cream px-4 py-3" data-testid="settings-week-start">
          <div className="min-w-0">
            <p className="text-sm font-bold text-ink">Week starts on Sunday</p>
            <p className="text-[11px] font-semibold leading-tight text-ink-soft">Choose the first day shown in each calendar row.</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={settings.weekStartsSunday}
            aria-label="Week starts on Sunday"
            data-testid="settings-week-start-toggle"
            onClick={() => onChange({ ...settings, weekStartsSunday: !settings.weekStartsSunday })}
            className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${settings.weekStartsSunday ? 'bg-rose-500' : 'bg-ink-soft/20'}`}
          >
            <span className={`absolute left-0.5 top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${settings.weekStartsSunday ? 'translate-x-5' : ''}`} />
          </button>
        </div>
      </div>
      <div className="mt-5 flex flex-col gap-3 border-t border-rose-100 pt-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-ink-soft">Style</h3>
        <p className="text-[11px] font-semibold text-ink-soft">
          Tap a circle to set a color — calendar, trends and the health ring all follow.
        </p>
        {STYLE_GROUPS.map((group) => (
          <div key={group.title} className="flex flex-col gap-3">
            <p className="mt-2 text-[11px] font-extrabold uppercase tracking-wider text-ink-soft/80">
              {group.title}
              {group.hint ? <span className="ml-1 font-semibold normal-case tracking-normal text-ink-soft/60">— {group.hint}</span> : null}
            </p>
            {group.fields.map((field) => (
              <StyleRow
                key={field.key}
                field={field}
                value={settings.style[field.key]}
                onOpen={() => setEditing(field)}
              />
            ))}
          </div>
        ))}
        <p className="text-[11px] font-semibold text-ink-soft/70">
          Defaults: Bloom&apos;s pastel rose · lavender · peach · sage palette.
        </p>
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
        <button
          type="button"
          onClick={onClearAll}
          data-testid="settings-clear-all"
          className="rounded-xl border border-rose-200 bg-white px-4 py-2.5 text-sm font-bold text-rose-600 transition-colors hover:border-rose-300 hover:bg-rose-50"
        >
          Clear all data
        </button>
        <p className="text-[11px] font-semibold text-ink-soft/70">
          Export saves your period history and settings as a JSON file. Import replaces your current data. Clear all
          data wipes your history and resets settings to defaults.
        </p>
      </div>
      <p className="mt-4 text-[11px] font-semibold text-ink-soft/80">Saved automatically on this device.</p>

      {editing &&
        createPortal(
          <ColorPickerModal
            label={editing.label}
            value={settings.style[editing.key]}
            onChange={(v) => onChange({ ...settings, style: { ...settings.style, [editing.key]: v } })}
            onClose={() => setEditing(null)}
          />,
          document.body,
        )}
    </div>
  )
}