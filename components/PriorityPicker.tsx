'use client'

import type { Priority } from '@/types'

const OPTIONS: { value: Priority; label: string; active: string; dot: string }[] = [
  { value: 'low', label: 'Rendah', active: 'bg-white text-emerald-700 border-emerald-300 shadow-sm', dot: 'bg-emerald-500' },
  { value: 'medium', label: 'Sedang', active: 'bg-white text-amber-700 border-amber-300 shadow-sm', dot: 'bg-amber-500' },
  { value: 'high', label: 'Tinggi', active: 'bg-white text-rose-700 border-rose-300 shadow-sm', dot: 'bg-rose-500' },
]

interface PriorityPickerProps {
  value: Priority
  onChange: (value: Priority) => void
}

export default function PriorityPicker({ value, onChange }: PriorityPickerProps) {
  return (
    <div role="radiogroup" aria-label="Prioritas" className="inline-flex gap-1 p-1 rounded-xl bg-slate-100 shrink-0">
      {OPTIONS.map((o) => {
        const active = value === o.value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition ${
              active ? o.active : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${o.dot} ${active ? '' : 'opacity-40'}`} />
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
