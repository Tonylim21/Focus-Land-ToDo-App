'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { isSameDay } from '@/utils/date'

const DAY_LABELS = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min']

interface CalendarProps {
  selected: Date
  onSelect: (date: Date) => void
}

export default function Calendar({ selected, onSelect }: CalendarProps) {
  const [view, setView] = useState(new Date(selected.getFullYear(), selected.getMonth(), 1))
  const today = new Date()

  const year = view.getFullYear()
  const month = view.getMonth()
  const offset = (new Date(year, month, 1).getDay() + 6) % 7 // Senin = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (number | null)[] = [
    ...Array(offset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]

  const shiftMonth = (delta: number) => setView(new Date(year, month + delta, 1))

  return (
    <div className="glass-card rounded-3xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-slate-800 capitalize">
          {view.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}
        </h3>
        <div className="flex gap-1">
          <button onClick={() => shiftMonth(-1)} aria-label="Bulan sebelumnya" className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button onClick={() => shiftMonth(1)} aria-label="Bulan berikutnya" className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {DAY_LABELS.map((d) => (
          <span key={d} className="text-[11px] font-semibold text-slate-400 pb-1">{d}</span>
        ))}
        {cells.map((day, i) => {
          if (day === null) return <span key={`e${i}`} />
          const date = new Date(year, month, day)
          const isSelected = isSameDay(date, selected)
          const isToday = isSameDay(date, today)
          return (
            <button
              key={day}
              onClick={() => onSelect(date)}
              className={`aspect-square rounded-xl text-sm font-semibold transition ${
                isSelected
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/25'
                  : isToday
                  ? 'bg-indigo-50 text-indigo-600 ring-1 ring-indigo-200'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {day}
            </button>
          )
        })}
      </div>

      <button
        onClick={() => { setView(new Date(today.getFullYear(), today.getMonth(), 1)); onSelect(today) }}
        className="mt-4 w-full text-xs font-semibold text-indigo-600 hover:underline"
      >
        Kembali ke hari ini
      </button>
    </div>
  )
}
