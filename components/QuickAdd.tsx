'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { toInputDate } from '@/utils/date'

interface QuickAddProps {
  today: Date
  onAdd: (title: string, deadline: string, time: string) => Promise<boolean>
}

export default function QuickAdd({ today, onAdd }: QuickAddProps) {
  const todayStr = toInputDate(today)
  const [title, setTitle] = useState('')
  const [deadline, setDeadline] = useState(todayStr)
  const [time, setTime] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !deadline) return
    setBusy(true)
    const ok = await onAdd(title.trim(), deadline, time)
    if (ok) {
      setTitle('')
      setDeadline(todayStr)
      setTime('')
    }
    setBusy(false)
  }

  const field =
    'px-3 py-2.5 rounded-xl bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm text-slate-700'

  return (
    <form onSubmit={submit} className="glass-card rounded-3xl p-4 mb-6 flex flex-wrap items-end gap-3">
      <div className="flex-1 min-w-[200px]">
        <label className="block text-[11px] font-semibold text-slate-400 mb-1">Tambah cepat</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Judul tugas, lalu tekan Enter"
          className={`${field} w-full`}
        />
      </div>
      <div>
        <label className="block text-[11px] font-semibold text-slate-400 mb-1">Deadline</label>
        <input type="date" value={deadline} min={todayStr} onChange={(e) => setDeadline(e.target.value)} required className={field} />
      </div>
      <div>
        <label className="block text-[11px] font-semibold text-slate-400 mb-1">Jam (opsional)</label>
        <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={field} />
      </div>
      <button
        type="submit"
        disabled={busy}
        className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold shadow-md shadow-indigo-600/25 hover:bg-indigo-700 transition disabled:opacity-50"
      >
        <Plus className="w-4 h-4" /> Tambah
      </button>
    </form>
  )
}
