'use client'

import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import PriorityPicker from '@/components/PriorityPicker'
import { fromInputDate, toInputDate } from '@/utils/date'
import type { Priority } from '@/types'

interface AddTaskModalProps {
  userId: string
  initialStart: Date
  minDate: Date
  onClose: () => void
  onSaved: (start: Date, deadline: Date) => void
}

interface DraftSub {
  title: string
  priority: Priority
}

export default function AddTaskModal({ userId, initialStart, minDate, onClose, onSaved }: AddTaskModalProps) {
  const [title, setTitle] = useState('')
  const [startStr, setStartStr] = useState(toInputDate(initialStart))
  const [deadlineStr, setDeadlineStr] = useState(toInputDate(initialStart))
  const [time, setTime] = useState('')
  const [subs, setSubs] = useState<DraftSub[]>([{ title: '', priority: 'medium' }])
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const supabase = createClient()

  const updateSub = (i: number, patch: Partial<DraftSub>) =>
    setSubs((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)))

  const handleStartChange = (value: string) => {
    setStartStr(value)
    if (deadlineStr < value) setDeadlineStr(value) // deadline tidak boleh sebelum tanggal mulai
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!startStr || !deadlineStr || deadlineStr < startStr) {
      setErrorMsg('Deadline tidak boleh sebelum tanggal mulai.')
      return
    }
    setLoading(true)
    setErrorMsg('')

    const { data: task, error } = await supabase
      .from('tasks')
      .insert({
        user_id: userId,
        title: title.trim(),
        start_date: startStr,
        deadline: deadlineStr,
        deadline_time: time || null,
      })
      .select('id')
      .single()

    if (error || !task) {
      setErrorMsg(error?.message ?? 'Gagal menyimpan tugas.')
      setLoading(false)
      return
    }

    // Poin & penalti diisi otomatis oleh database berdasarkan prioritas
    const rows = subs
      .filter((s) => s.title.trim())
      .map((s) => ({ task_id: task.id, user_id: userId, title: s.title.trim(), priority: s.priority }))

    if (rows.length > 0) {
      const { error: subError } = await supabase.from('subtasks').insert(rows)
      if (subError) {
        await supabase.from('tasks').delete().eq('id', task.id) // batalkan agar tidak ada tugas setengah jadi
        setErrorMsg(`Subtask gagal disimpan: ${subError.message}`)
        setLoading(false)
        return
      }
    }

    onSaved(fromInputDate(startStr), fromInputDate(deadlineStr))
    onClose()
  }

  const input =
    'w-full px-4 py-3 rounded-xl bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800 text-sm'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 rounded-3xl bg-white/95 border border-white/60 shadow-2xl shadow-indigo-500/20">
        <div className="flex items-start justify-between mb-5">
          <h2 className="text-lg font-bold text-slate-800">Tambah Kegiatan</h2>
          <button onClick={onClose} aria-label="Tutup" className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        {errorMsg && (
          <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 text-sm">{errorMsg}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Judul tugas</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus className={input} placeholder="Contoh: Fix Bug Proyek XYZ" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Mulai</label>
              <input type="date" value={startStr} min={toInputDate(minDate)} onChange={(e) => handleStartChange(e.target.value)} required className={input} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Deadline</label>
              <input type="date" value={deadlineStr} min={startStr} onChange={(e) => setDeadlineStr(e.target.value)} required className={input} />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Jam deadline (opsional)</label>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={input} />
            <p className="text-[11px] text-slate-400 mt-1">Kosongkan jika deadline sampai akhir hari.</p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Subtask & prioritas</label>
            <div className="space-y-2">
              {subs.map((s, i) => (
                <div key={i} className="rounded-xl border border-slate-200 bg-slate-50/60 p-2.5 space-y-2">
                  <div className="flex gap-2">
                    <input
                      value={s.title}
                      onChange={(e) => updateSub(i, { title: e.target.value })}
                      className={input}
                      placeholder={`Subtask ${i + 1}`}
                    />
                    {subs.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setSubs((prev) => prev.filter((_, idx) => idx !== i))}
                        aria-label="Hapus baris"
                        className="px-2 text-slate-300 hover:text-rose-500"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <PriorityPicker value={s.priority} onChange={(priority) => updateSub(i, { priority })} />
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setSubs((prev) => [...prev, { title: '', priority: 'medium' }])}
              className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:underline"
            >
              <Plus className="w-3.5 h-3.5" /> Tambah subtask
            </button>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white font-semibold shadow-lg shadow-indigo-500/20 hover:opacity-95 transition disabled:opacity-50"
          >
            {loading ? 'Menyimpan...' : 'Simpan kegiatan'}
          </button>
        </form>
      </div>
    </div>
  )
}
