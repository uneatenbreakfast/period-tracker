import type { FlowLevel } from '../types'

export interface SymptomDef {
  key: string
  label: string
  emoji: string
}

export const SYMPTOMS: SymptomDef[] = [
  { key: 'cramps', label: 'Cramps', emoji: '😣' },
  { key: 'headache', label: 'Headache', emoji: '🤕' },
  { key: 'bloating', label: 'Bloating', emoji: '🎈' },
  { key: 'fatigue', label: 'Fatigue', emoji: '🥱' },
  { key: 'mood', label: 'Mood swings', emoji: '🎭' },
  { key: 'tender', label: 'Tender breasts', emoji: '🌸' },
  { key: 'acne', label: 'Breakouts', emoji: '✨' },
  { key: 'backache', label: 'Backache', emoji: '💆' },
  { key: 'nausea', label: 'Nausea', emoji: '🤢' },
  { key: 'cravings', label: 'Cravings', emoji: '🍫' },
]

export const FLOW_LEVELS: { value: FlowLevel; label: string; emoji: string }[] = [
  { value: 'spotting', label: 'Spotting', emoji: '▪️' },
  { value: 'light', label: 'Light', emoji: '💧' },
  { value: 'medium', label: 'Medium', emoji: '💧💧' },
  { value: 'heavy', label: 'Heavy', emoji: '💧💧💧' },
]

export function symptomLabel(key: string): string {
  return SYMPTOMS.find((s) => s.key === key)?.label ?? key
}