'use client'

import { useState } from 'react'
import { Check, Clock, Plus, Trash2 } from 'lucide-react'
import ProgressBar from '@/components/ProgressBar'
import PriorityPicker from '@/components/PriorityPicker'
import ConfirmDialog from '@/components/ConfirmDialog'
import type { Priority, Subtask, Task } from '@/types'
import { PRIORITY_META } from '@/utils/points'
import { fromInputDate } from '@/utils/date'

interface TaskCardProps {
  task: Task
  overdue: boolean // deadline sudah lewat
  canCheck: boolean // sudah lewat tanggal mulai
  canEdit: boolean // boleh tambah/hapus subtask & hapus tugas
  onToggleSubtask: (sub: Subtask) => void
  onDeleteSubtask: (sub: Subtask) => void
  onAddSubtask: (task: Task, title: string, priority: Priority) => Promise<void>
  onDeleteTask: (task: Task) => void
}

const shortDate = (s: string) =>
  fromInputDate(s).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' })

export default function TaskCard({
  task,
  overdue,
  canCheck,
  canEdit,
  onToggleSubtask,
  onDeleteSubtask,
  onAddSubtask,
  onDeleteTask,
}: TaskCardProps) {
  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState<Priority>('medium')
  const [adding, setAdding] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const subs = [...task.subtasks].sort((a, b) => a.created_at.localeCompare(b.created_at))
  const done = subs.filter((s) => s.is_done).length
  const late = overdue && subs.some((s) => !s.is_done)
  const deadlineLabel = `${shortDate(task.deadline)}${task.deadline_time ? ` · ${task.deadline_time.slice(0, 5)}` : ''}`

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    setAdding(true)
    await onAddSubtask(task, title.trim(), priority)
    setTitle('')
    setAdding(false)
  }

  const handleDeleteTask = () => setConfirmOpen(true)

  return (
    <li className={`rounded-2xl border p-5 space-y-4 list-none ${late ? 'bg-rose-50/60 border-rose-200' : 'bg-white/70 border-white/60'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          <h4 className="font-bold text-slate-800 text-base">{task.title}</h4>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className={`inline-flex items-center gap-1 font-medium ${late ? 'text-rose-600' : 'text-slate-500'}`}>
              <Clock className="w-3.5 h-3.5" /> Deadline {deadlineLabel}
            </span>
            {late && <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-600 font-semibold">Terlambat</span>}
            {!canCheck && (
              <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-semibold">
                Mulai {shortDate(task.start_date)}
              </span>
            )}
          </div>
        </div>
        {canEdit && (
          <button onClick={handleDeleteTask} aria-label="Hapus tugas" className="p-2 rounded-lg text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition">
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {subs.length > 0 && <ProgressBar done={done} total={subs.length} label="subtask" />}

      <ul className="space-y-1.5">
        {subs.map((s) => {
          const meta = PRIORITY_META[s.priority] ?? PRIORITY_META.medium
          const locked = s.is_done ? overdue : !canCheck // selesai & deadline lewat = terkunci
          return (
            <li key={s.id} className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-slate-50/80 transition">
              <button
                onClick={() => onToggleSubtask(s)}
                disabled={locked}
                aria-label={s.is_done ? 'Batalkan centang' : 'Centang selesai'}
                className={`w-5 h-5 shrink-0 rounded-md border-2 flex items-center justify-center transition ${
                  s.is_done ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300'
                } ${locked ? 'opacity-50 cursor-not-allowed' : 'hover:border-indigo-500'}`}
              >
                {s.is_done && <Check className="w-3.5 h-3.5" />}
              </button>
              <span className={`flex-1 text-sm ${s.is_done ? 'line-through text-slate-400' : 'text-slate-700'}`}>{s.title}</span>
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${meta.cls}`}>{meta.label}</span>
              {canEdit && (
                <button onClick={() => onDeleteSubtask(s)} aria-label="Hapus subtask" className="p-1 rounded-md text-slate-300 hover:text-rose-500 transition">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </li>
          )
        })}
        {subs.length === 0 && <li className="text-xs text-slate-400 px-3">Belum ada subtask.</li>}
      </ul>

      {canEdit && (
        <form onSubmit={handleAdd} className="flex flex-wrap items-center gap-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Tambah subtask..."
            className="flex-1 min-w-[160px] px-3 py-2 rounded-xl bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
          />
          <PriorityPicker value={priority} onChange={setPriority} />
          <button type="submit" disabled={adding} aria-label="Tambah subtask" className="px-3 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 transition disabled:opacity-50">
            <Plus className="w-4 h-4" />
          </button>
        </form>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title="Hapus tugas ini?"
        confirmLabel="Hapus"
        danger
        onConfirm={() => {
          setConfirmOpen(false)
          onDeleteTask(task)
        }}
        onCancel={() => setConfirmOpen(false)}
      >
        <strong className="text-slate-800">{task.title}</strong> beserta semua subtask-nya akan dihapus.
      </ConfirmDialog>
    </li>
  )
}

