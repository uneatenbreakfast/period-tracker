import { useCallback, useEffect, useRef, useState } from 'react'
import { DEFAULT_CALENDAR_STYLE } from '../lib/settings'
import { hexToHsv, hsvToHex } from '../lib/color'

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i

/** Expand `#abc` → `#aabbcc` while typing in the modal's hex field. */
const expandHex = (short: string) =>
  `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`

/** Unique swatches from the shipped palette — quick reset chips. */
const PRESETS = Array.from(new Set(Object.values(DEFAULT_CALENDAR_STYLE)))

/** Clamp a pointer ratio into 0–1. */
const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

interface ColorPickerModalProps {
  /** Human label of the field being edited (e.g. "Period"). */
  label: string
  /** Current color — a normalized lowercase `#rrggbb`. */
  value: string
  /** Live commit — fires on every picker drag / valid hex entry. */
  onChange: (hex: string) => void
  onClose: () => void
}

/**
 * In-app color picker (BLOOM settings). Tapping a color row on the settings
 * page opens this bottom sheet: an HSV saturation/value box, a hue bar, the
 * hex code, and the shipped pastel palette as quick chips. Commits live.
 */
export default function ColorPickerModal({ label, value, onChange, onClose }: ColorPickerModalProps) {
  const { h, s, v } = hexToHsv(value)

  const svRef = useRef<HTMLDivElement | null>(null)
  const hueRef = useRef<HTMLDivElement | null>(null)

  // Draft for the hex text field — lets the user type partial values.
  const [hexDraft, setHexDraft] = useState(value)
  useEffect(() => setHexDraft(value), [value])

  const update = useCallback(
    (patch: { h?: number; s?: number; v?: number }) => {
      onChange(hsvToHex({ h: patch.h ?? h, s: patch.s ?? s, v: patch.v ?? v }))
    },
    [h, s, v, onChange],
  )

  const updateFromSv = (e: React.PointerEvent) => {
    const el = svRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    update({ s: clamp01((e.clientX - rect.left) / rect.width), v: 1 - clamp01((e.clientY - rect.top) / rect.height) })
  }

  const updateFromHue = (e: React.PointerEvent) => {
    const el = hueRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    update({ h: clamp01((e.clientX - rect.left) / rect.width) * 360 })
  }

  const handleSvPointer = (e: React.PointerEvent) => {
    updateFromSv(e)
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const handleHuePointer = (e: React.PointerEvent) => {
    updateFromHue(e)
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const commitHexDraft = (raw: string) => {
    const hex = raw.trim()
    if (HEX_RE.test(hex)) onChange(hex.length === 4 ? expandHex(hex.toLowerCase()) : hex.toLowerCase())
  }

  return (
    <div
      data-sheet
      className="fixed inset-0 z-20 flex items-end justify-center bg-ink/30 backdrop-blur-[2px]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${label} color`}
    >
      <div
        className="w-full max-w-md rounded-t-3xl bg-white p-5 pb-8 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-extrabold text-ink">{label}</h2>
            <p className="text-xs text-ink-soft">Pick a color for {label.toLowerCase()}</p>
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

        {/* Preview + hex code */}
        <div className="mt-3 flex items-center gap-3">
          <span
            className="h-12 w-12 shrink-0 rounded-2xl shadow-[0_3px_10px_rgba(87,66,78,0.25)]"
            style={{ backgroundColor: value }}
            aria-hidden="true"
          />
          <label className="flex h-11 flex-1 items-center gap-1 rounded-xl border border-rose-100 bg-cream px-3">
            <span className="text-sm font-bold text-ink-soft">#</span>
            <input
              type="text"
              value={hexDraft.startsWith('#') ? hexDraft.slice(1) : hexDraft}
              spellCheck={false}
              autoCapitalize="off"
              aria-label={`${label} hex code`}
              data-testid="color-picker-hex-input"
              onChange={(e) => {
                const raw = e.target.value
                const withHash = raw.startsWith('#') ? raw : `#${raw}`
                setHexDraft(withHash)
                commitHexDraft(withHash)
              }}
              onBlur={() => setHexDraft(value)}
              className="w-full bg-transparent text-base font-bold tabular-nums uppercase text-ink outline-none placeholder:text-ink-soft/40"
              placeholder="f2318c"
            />
          </label>
        </div>

        {/* Saturation / value box */}
        <div
          ref={svRef}
          onPointerDown={handleSvPointer}
          onPointerMove={(e) => {
            if (e.buttons === 1) updateFromSv(e)
          }}
          data-testid="color-picker-sv"
          className="relative mt-4 h-40 w-full touch-none cursor-crosshair rounded-2xl select-none"
          style={{
            backgroundColor: hsvToHex({ h, s: 1, v: 1 }),
            backgroundImage:
              'linear-gradient(to right, #fff, rgba(255,255,255,0)), linear-gradient(to top, #000, rgba(0,0,0,0))',
          }}
        >
          <span
            className="pointer-events-none absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_1px_4px_rgba(0,0,0,0.4)]"
            style={{ left: `${s * 100}%`, top: `${(1 - v) * 100}%` }}
            aria-hidden="true"
          />
        </div>

        {/* Hue bar */}
        <div
          ref={hueRef}
          onPointerDown={handleHuePointer}
          onPointerMove={(e) => {
            if (e.buttons === 1) updateFromHue(e)
          }}
          data-testid="color-picker-hue"
          className="relative mt-3 h-5 w-full touch-none cursor-pointer rounded-full select-none"
          style={{
            background:
              'linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)',
          }}
        >
          <span
            className="pointer-events-none absolute top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_1px_4px_rgba(0,0,0,0.4)]"
            style={{ left: `${(h / 360) * 100}%` }}
            aria-hidden="true"
          />
        </div>

        {/* Palette chips */}
        <p className="mt-4 text-[11px] font-extrabold uppercase tracking-wider text-ink-soft">Palette</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {PRESETS.map((hex) => (
            <button
              key={hex}
              type="button"
              onClick={() => onChange(hex)}
              aria-label={`Use ${hex}`}
              data-testid={`color-picker-preset-${hex}`}
              className={`h-8 w-8 rounded-full shadow-[0_2px_6px_rgba(87,66,78,0.25)] transition-transform hover:scale-110 ${
                value === hex ? 'ring-2 ring-rose-400 ring-offset-2' : ''
              }`}
              style={{ backgroundColor: hex }}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full rounded-full bg-rose-400 px-5 py-3 text-sm font-bold text-white shadow-[0_3px_10px_rgba(217,111,147,0.4)] transition-colors hover:bg-rose-500"
        >
          Done
        </button>
      </div>
    </div>
  )
}