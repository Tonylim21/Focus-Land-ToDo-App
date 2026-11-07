'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import { Check, ChevronLeft, ChevronRight } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import PageShell from '@/components/PageShell'
import type { Priority, Subtask, Task } from '@/types'
import { addDays, formatLongDate, fromInputDate, toInputDate } from '@/utils/date'
import { PRIORITY_META } from '@/utils/points'
import { DEFAULT_TZ, TASK_SELECT, isOverdue, todayStrInTz } from '@/utils/tasks'
export const dynamic = 'force-dynamic'

const WEEKDAYS = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min']
const RANK: Record<Priority, number> = { low: 1, medium: 2, high: 3 }
const DOT: Record<Priority, string> = { low: 'bg-emerald-500', medium: 'bg-amber-500', high: 'bg-rose-500' }
const TINT: Record<Priority, string> = { low: 'bg-emerald-100/70', medium: 'bg-amber-100/80', high: 'bg-rose-100/80' }

/** Semua tanggal yang tampil di grid bulan (mulai Senin, kelipatan 7 hari) */
function buildGrid(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1)
  const offset = (first.getDay() + 6) % 7
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  const weeks = Math.ceil((offset + days) / 7)
  const start = addDays(first, -offset)
  return Array.from({ length: weeks * 7 }, (_, i) => addDays(start, i))
}

/** Prioritas tertinggi dari subtask yang belum selesai */
function topPriority(subs: Subtask[]) {
  return subs
    .filter((s) => !s.is_done)
    .reduce<Priority | null>((acc, s) => (!acc || RANK[s.priority] > RANK[acc] ? s.priority : acc), null)
}

const shortDate = (s: string) =>
  fromInputDate(s).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' })

export default function CalendarPage() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  const [user, setUser] = useState<User | null>(null)
  const [tz, setTz] = useState(DEFAULT_TZ)
  const [todayStr, setTodayStr] = useState<string | null>(null)
  const [viewMonth, setViewMonth] = useState<Date | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [dayOffs, setDayOffs] = useState<Set<string>>(new Set())
  const [error, setError] = useState('')
  const req = useRef(0)

  const grid = useMemo(() => (viewMonth ? buildGrid(viewMonth) : []), [viewMonth])
  const gridStart = grid.length ? toInputDate(grid[0]) : ''
  const gridEnd = grid.length ? toInputDate(grid[grid.length - 1]) : ''

  // 1) Cek sesi + zona waktu + tanggal hari ini
  useEffect(() => {
    const init = async () => {
      const { data: { user: u } } = await supabase.auth.getUser()
      if (!u) {
        router.replace('/login')
        return
      }
      const { data: prof } = await supabase.from('profiles').select('timezone').eq('id', u.id).maybeSingle()
      const zone = (prof as { timezone: string | null } | null)?.timezone || DEFAULT_TZ
      const t = todayStrInTz(zone)
      const d = fromInputDate(t)
      setTz(zone)
      setTodayStr(t)
      setSelected(t)
      setViewMonth(new Date(d.getFullYear(), d.getMonth(), 1))
      setUser(u)
    }
    init()
  }, [supabase, router])

  // 2) Ambil tugas yang rentangnya beririsan dengan grid bulan
  useEffect(() => {
    if (!user || !gridStart) return
    const id = ++req.current
    const run = async () => {
      const [tRes, oRes] = await Promise.all([
        supabase
          .from('tasks')
          .select(TASK_SELECT)
          .eq('user_id', user.id)
          .lte('start_date', gridEnd)
          .gte('deadline', gridStart)
          .order('start_date', { ascending: true }),
        supabase.from('day_offs').select('off_date').eq('user_id', user.id).gte('off_date', gridStart).lte('off_date', gridEnd),
      ])
      if (id !== req.current) return // respons lama, abaikan
      if (tRes.error) setError(tRes.error.message)
      else {
        setError('')
        setTasks((tRes.data as Task[]) ?? [])
      }
      setDayOffs(new Set(((oRes.data ?? []) as { off_date: string }[]).map((r) => r.off_date)))
    }
    run()
  }, [supabase, user, gridStart, gridEnd])

  if (!user || !todayStr || !viewMonth || !selected) {
    return (
      <PageShell>
        <div className="glass-card rounded-3xl p-10 text-center text-sm text-slate-400">Memuat kalender...</div>
      </PageShell>
    )
  }

  const coverOf = (d: string) => tasks.filter((t) => t.start_date <= d && t.deadline >= d)
  const shiftMonth = (delta: number) => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + delta, 1))
  const goToday = () => {
    const d = fromInputDate(todayStr)
    setViewMonth(new Date(d.getFullYear(), d.getMonth(), 1))
    setSelected(todayStr)
  }

  const selectedInGrid = selected >= gridStart && selected <= gridEnd
  const selectedTasks = selectedInGrid ? coverOf(selected) : []

  return (
    <PageShell>
      <div className="space-y-5">
        {/* Header kalender */}
        <header className="glass-card rounded-3xl p-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-800 capitalize">
              {viewMonth.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}
            </h2>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-[11px] font-medium text-slate-500">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-500" /> Tinggi</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> Sedang</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Rendah</span>
              <span className="flex items-center gap-1"><Check className="w-3 h-3 text-emerald-500" /> Selesai</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-slate-300" /> Sudah lewat</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={goToday} className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-600 hover:bg-slate-50 transition">
              Hari ini
            </button>
            <button onClick={() => shiftMonth(-1)} aria-label="Bulan sebelumnya" className="p-2 rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 transition">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button onClick={() => shiftMonth(1)} aria-label="Bulan berikutnya" className="p-2 rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 transition">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </header>

        {error && <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 text-sm">{error}</div>}

        <div className="grid gap-6 xl:grid-cols-[1fr_340px] items-start">
          {/* Grid bulan */}
          <section className="glass-card rounded-3xl p-3 sm:p-4">
            <div className="grid grid-cols-7 gap-1.5 mb-1.5">
              {WEEKDAYS.map((w) => (
                <div key={w} className="text-center text-[11px] font-semibold text-slate-400 py-1">{w}</div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1.5">
              {grid.map((date) => {
                const d = toInputDate(date)
                const inMonth = date.getMonth() === viewMonth.getMonth()
                const isPast = d < todayStr
                const isToday = d === todayStr
                const isSel = d === selected
                const cover = coverOf(d)
                const top = topPriority(cover.flatMap((t) => t.subtasks))
                const allDone = cover.length > 0 && cover.every((t) => t.subtasks.length > 0 && t.subtasks.every((s) => s.is_done))
                const late = cover.some((t) => isOverdue(t, tz) && t.subtasks.some((s) => !s.is_done))
                const off = dayOffs.has(d)

                let bg = 'bg-white/70'
                if (isPast) bg = 'bg-slate-100/80'
                else if (off) bg = 'bg-emerald-50'
                else if (top) bg = TINT[top]
                else if (allDone) bg = 'bg-white'
                else if (cover.length > 0) bg = 'bg-indigo-50'

                return (
                  <button
                    key={d}
                    onClick={() => setSelected(d)}
                    className={`text-left rounded-xl p-1.5 sm:p-2 min-h-[72px] sm:min-h-[104px] flex flex-col gap-1 transition ${bg} ${
                      isSel ? 'ring-2 ring-indigo-600 shadow-md' : isToday ? 'ring-1 ring-indigo-300' : 'hover:ring-1 hover:ring-slate-300'
                    } ${inMonth ? '' : 'opacity-50'}`}
                  >
                    <span className="flex items-center justify-between">
                      <span
                        className={`text-xs font-bold inline-flex items-center justify-center ${
                          isToday ? 'bg-indigo-600 text-white rounded-full w-6 h-6' : isPast ? 'text-slate-400' : 'text-slate-700'
                        }`}
                      >
                        {date.getDate()}
                      </span>
                      {late && <span className="w-2 h-2 rounded-full bg-rose-500" title="Ada tugas terlambat" />}
                      {off && <span className="text-[10px] font-semibold text-emerald-600">Libur</span>}
                    </span>

                    {/* Desktop: chip judul tugas */}
                    {cover.slice(0, 2).map((t) => {
                      const tTop = topPriority(t.subtasks)
                      const tDone = t.subtasks.length > 0 && !tTop
                      return (
                        <span
                          key={t.id}
                          className={`hidden sm:flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
                            isPast ? 'bg-slate-200/80 text-slate-500' : 'bg-white/85 text-slate-700'
                          }`}
                        >
                          {tDone ? (
                            <Check className="w-3 h-3 text-emerald-500 shrink-0" />
                          ) : (
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${tTop ? DOT[tTop] : 'bg-indigo-400'}`} />
                          )}
                          <span className={`truncate ${tDone ? 'line-through opacity-60' : ''}`}>{t.title}</span>
                        </span>
                      )
                    })}
                    {cover.length > 2 && <span className="hidden sm:block text-[10px] font-semibold text-slate-400">+{cover.length - 2} lagi</span>}

                    {/* Mobile: titik saja */}
                    {cover.length > 0 && (
                      <span className="flex sm:hidden gap-0.5 mt-auto">
                        {cover.slice(0, 4).map((t) => {
                          const tTop = topPriority(t.subtasks)
                          return <span key={t.id} className={`w-1.5 h-1.5 rounded-full ${tTop ? DOT[tTop] : 'bg-slate-300'}`} />
                        })}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </section>

          {/* Detail tanggal terpilih (hanya lihat) */}
          <aside className="glass-card rounded-3xl p-5 space-y-4 xl:sticky xl:top-4">
            <div>
              <p className="text-[11px] uppercase font-bold tracking-wider text-slate-400">
                {selected === todayStr ? 'Hari ini' : selected < todayStr ? 'Riwayat' : 'Mendatang'}
              </p>
              <h3 className="font-bold text-slate-800">{formatLongDate(fromInputDate(selected))}</h3>
              {dayOffs.has(selected) && <p className="text-xs font-semibold text-emerald-600 mt-1">Ditandai libur</p>}
            </div>

            {!selectedInGrid ? (
              <p className="text-sm text-slate-400">Pilih tanggal pada bulan yang sedang tampil.</p>
            ) : selectedTasks.length === 0 ? (
              <p className="text-sm text-slate-400">Tidak ada tugas pada tanggal ini.</p>
            ) : (
              <ul className="space-y-3">
                {selectedTasks.map((t) => {
                  const subs = [...t.subtasks].sort((a, b) => a.created_at.localeCompare(b.created_at))
                  const pending = subs.filter((s) => !s.is_done).length
                  const status =
                    subs.length === 0
                      ? { label: 'Tanpa subtask', cls: 'bg-slate-100 text-slate-600' }
                      : pending === 0
                      ? { label: 'Selesai', cls: 'bg-emerald-100 text-emerald-700' }
                      : isOverdue(t, tz)
                      ? { label: 'Terlambat', cls: 'bg-rose-100 text-rose-700' }
                      : todayStr < t.start_date
                      ? { label: 'Belum mulai', cls: 'bg-slate-100 text-slate-600' }
                      : { label: 'Berjalan', cls: 'bg-indigo-100 text-indigo-700' }

                  return (
                    <li key={t.id} className="rounded-2xl bg-white/70 border border-white/60 p-4 space-y-2.5 list-none">
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="font-bold text-slate-800 text-sm">{t.title}</h4>
                        <span className={`shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full ${status.cls}`}>{status.label}</span>
                      </div>
                      <p className="text-[11px] text-slate-400">
                        {shortDate(t.start_date)} → {shortDate(t.deadline)}
                        {t.deadline_time ? ` · ${t.deadline_time.slice(0, 5)}` : ''}
                      </p>
                      <ul className="space-y-1.5">
                        {subs.map((s) => {
                          const meta = PRIORITY_META[s.priority] ?? PRIORITY_META.medium
                          return (
                            <li key={s.id} className="flex items-center gap-2 text-xs">
                              <span
                                className={`w-4 h-4 shrink-0 rounded flex items-center justify-center ${
                                  s.is_done ? 'bg-emerald-500 text-white' : 'border border-slate-300'
                                }`}
                              >
                                {s.is_done && <Check className="w-3 h-3" />}
                              </span>
                              <span className={`flex-1 ${s.is_done ? 'line-through text-slate-400' : 'text-slate-700'}`}>{s.title}</span>
                              {s.is_done && s.completed_at ? (
                                <span className="text-[10px] text-slate-400">
                                  {new Date(s.completed_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', timeZone: tz })}
                                </span>
                              ) : (
                                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${meta.cls}`}>{meta.label}</span>
                              )}
                            </li>
                          )
                        })}
                      </ul>
                    </li>
                  )
                })}
              </ul>
            )}
          </aside>
        </div>
      </div>
    </PageShell>
  )
}
