'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Bell, CalendarDays } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import { addDays, fromInputDate, toInputDate } from '@/utils/date'
import { isOverdue, todayStrInTz } from '@/utils/tasks'

interface Item {
  id: string
  title: string
  deadline: string
  deadline_time: string | null
  pending: number
}

interface NotificationBellProps {
  userId: string
  timezone: string
  refreshKey?: number // naik setiap data dashboard berubah, supaya daftar ikut diperbarui
}

const shortDate = (s: string) =>
  fromInputDate(s).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' })

export default function NotificationBell({ userId, timezone, refreshKey = 0 }: NotificationBellProps) {
  const supabase = useMemo(() => createClient(), [])
  const [open, setOpen] = useState(false)
  const [late, setLate] = useState<Item[]>([])
  const [today, setToday] = useState<Item[]>([])
  const [tomorrow, setTomorrow] = useState<Item[]>([])
  const box = useRef<HTMLDivElement>(null)

  // Tugas aktif yang deadline-nya sudah lewat / hari ini / besok dan masih punya subtask belum selesai
  useEffect(() => {
    let cancelled = false
    const run = async () => {
      const todayStr = todayStrInTz(timezone)
      const tomorrowStr = toInputDate(addDays(fromInputDate(todayStr), 1))
      const { data, error } = await supabase
        .from('tasks')
        .select('id, title, deadline, deadline_time, subtasks!inner(id)')
        .eq('user_id', userId)
        .lte('start_date', todayStr)
        .lte('deadline', tomorrowStr)
        .eq('subtasks.is_done', false)
        .order('deadline', { ascending: true })
      if (cancelled || error) return
      const rows = (data ?? []) as unknown as {
        id: string
        title: string
        deadline: string
        deadline_time: string | null
        subtasks: { id: string }[]
      }[]
      const l: Item[] = []
      const t: Item[] = []
      const n: Item[] = []
      for (const r of rows) {
        const it: Item = { id: r.id, title: r.title, deadline: r.deadline, deadline_time: r.deadline_time, pending: r.subtasks.length }
        if (isOverdue(it, timezone)) l.push(it)
        else if (it.deadline === todayStr) t.push(it)
        else n.push(it)
      }
      setLate(l)
      setToday(t)
      setTomorrow(n)
    }
    run()
    return () => {
      cancelled = true
    }
  }, [supabase, userId, timezone, refreshKey])

  // Tutup saat klik di luar atau tekan Esc
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const urgent = late.length + today.length
  const empty = late.length + today.length + tomorrow.length === 0

  const section = (title: string, tone: string, items: Item[]) =>
    items.length === 0 ? null : (
      <div className="px-4 py-3">
        <p className={`text-[11px] uppercase font-bold tracking-wider mb-2 ${tone}`}>
          {title} ({items.length})
        </p>
        <ul className="space-y-2">
          {items.map((it) => (
            <li key={it.id} className="rounded-xl bg-slate-50 px-3 py-2">
              <p className="text-sm font-semibold text-slate-800">{it.title}</p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {it.pending} subtask belum selesai · deadline {shortDate(it.deadline)}
                {it.deadline_time ? ` · ${it.deadline_time.slice(0, 5)}` : ''}
              </p>
            </li>
          ))}
        </ul>
      </div>
    )

  return (
    <div ref={box} className="relative shrink-0">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifikasi"
        aria-expanded={open}
        className="relative w-10 h-10 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-600 hover:bg-indigo-500/20 transition"
      >
        <Bell className="w-5 h-5" />
        {urgent > 0 && (
          <span
            className={`absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 rounded-full text-[10px] font-bold text-white flex items-center justify-center ${
              late.length > 0 ? 'bg-rose-500' : 'bg-amber-500'
            }`}
          >
            {urgent > 9 ? '9+' : urgent}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-3 w-[min(92vw,360px)] max-h-[70vh] overflow-y-auto rounded-2xl bg-white shadow-2xl border border-slate-100 z-50 divide-y divide-slate-100">
          <div className="px-4 py-3">
            <p className="font-bold text-slate-800 text-sm">Notifikasi</p>
          </div>

          {empty ? (
            <div className="px-4 py-8 text-center">
              <p className="text-sm font-semibold text-slate-700">Semua aman 🎉</p>
              <p className="text-xs text-slate-400 mt-1">Tidak ada deadline yang mendesak.</p>
            </div>
          ) : (
            <>
              {section('Terlambat', 'text-rose-600', late)}
              {section('Deadline hari ini', 'text-amber-600', today)}
              {section('Deadline besok', 'text-slate-500', tomorrow)}
            </>
          )}

          {late.length > 0 && (
            <p className="px-4 py-2.5 text-[11px] text-rose-500 bg-rose-50">
              Subtask yang terlambat mengurangi poinmu. Selesaikan secepatnya.
            </p>
          )}

          <Link
            href="/calendar"
            onClick={() => setOpen(false)}
            className="flex items-center justify-center gap-2 px-4 py-3 text-xs font-semibold text-indigo-600 hover:bg-indigo-50 transition"
          >
            <CalendarDays className="w-4 h-4" /> Buka Kalender
          </Link>
        </div>
      )}
    </div>
  )
}
