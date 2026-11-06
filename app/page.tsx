'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import { Plus, PartyPopper, Undo2, Info } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import Sidebar from '@/components/Sidebar'
import Header from '@/components/Header'
import StatCards from '@/components/StatCards'
import TownPreviewCard from '@/components/TownPreviewCard'
import QuickAdd from '@/components/QuickAdd'
import OnboardingModal from '@/components/OnboardingModal'
import Calendar from '@/components/Calendar'
import ProgressBar from '@/components/ProgressBar'
import TaskCard from '@/components/TaskCard'
import AddTaskModal from '@/components/AddTaskModal'
import type { Priority, Profile, Subtask, Task } from '@/types'
import { formatLongDate, fromInputDate, isSameDay, startOfDay, toInputDate } from '@/utils/date'
import { DEFAULT_TZ, TASK_SELECT, isOverdue, todayStrInTz } from '@/utils/tasks'

export default function DashboardPage() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [loading, setLoading] = useState(true)

  // Tanggal diisi di dalam effect (bukan initial state) agar tidak kena error prerender Next.js 16
  const [today, setToday] = useState<Date | null>(null)
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)

  const [tasks, setTasks] = useState<Task[]>([])
  const [overdueTasks, setOverdueTasks] = useState<Task[]>([])
  const [isFree, setIsFree] = useState(false)
  const [completedTasks, setCompletedTasks] = useState(0)
  const [showAdd, setShowAdd] = useState(false)
  const [errMsg, setErrMsg] = useState('')

  const [version, setVersion] = useState(0) // naik setiap data berubah, dipakai lonceng notifikasi
  const dayReq = useRef(0) // penanda permintaan terbaru, supaya respons lama tidak menimpa data baru
  const tz = profile?.timezone || DEFAULT_TZ

  const loadProfile = useCallback(
    async (uid: string) => {
      const { data } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle()
      const p = (data as Profile | null) ?? null
      setProfile(p)
      setShowOnboarding(!p || !p.phone_number)
      return p
    },
    [supabase]
  )

  // Tugas yang rentangnya (mulai..deadline) mencakup tanggal terpilih + status hari libur
  const fetchDay = useCallback(
    async (uid: string, date: Date) => {
      const d = toInputDate(date)
      const reqId = ++dayReq.current
      const [tasksRes, offRes] = await Promise.all([
        supabase
          .from('tasks')
          .select(TASK_SELECT)
          .eq('user_id', uid)
          .lte('start_date', d)
          .gte('deadline', d)
          .order('created_at', { ascending: true }),
        supabase.from('day_offs').select('id').eq('user_id', uid).eq('off_date', d).maybeSingle(),
      ])
      if (reqId !== dayReq.current) return
      if (tasksRes.error) setErrMsg(tasksRes.error.message)
      else setTasks((tasksRes.data as Task[]) ?? [])
      setIsFree(!!offRes.data)
    },
    [supabase]
  )

  // Tugas yang deadline-nya sudah lewat tapi masih punya subtask belum selesai
  const fetchOverdue = useCallback(
    async (uid: string, todayStr: string) => {
      const { data: rows, error } = await supabase
        .from('tasks')
        .select('id, subtasks!inner(id)')
        .eq('user_id', uid)
        .lt('deadline', todayStr)
        .eq('subtasks.is_done', false)
      if (error) return
      const ids = ((rows ?? []) as { id: string }[]).map((r) => r.id)
      if (ids.length === 0) {
        setOverdueTasks([])
        return
      }
      const { data } = await supabase
        .from('tasks')
        .select(TASK_SELECT)
        .in('id', ids)
        .order('deadline', { ascending: true })
      setOverdueTasks((data as Task[]) ?? [])
    },
    [supabase]
  )

  // Tugas selesai = punya subtask dan semuanya sudah dicentang
  const fetchStats = useCallback(
    async (uid: string) => {
      const { data, error } = await supabase.from('tasks').select('id, subtasks(is_done)').eq('user_id', uid)
      if (error) return
      const rows = (data ?? []) as { subtasks: { is_done: boolean }[] }[]
      setCompletedTasks(rows.filter((t) => t.subtasks.length > 0 && t.subtasks.every((s) => s.is_done)).length)
    },
    [supabase]
  )

  // 1) Cek sesi, kenakan penalti yang tertunda, lalu muat data awal
  useEffect(() => {
    const init = async () => {
      const { data: { user: currentUser } } = await supabase.auth.getUser()
      if (!currentUser) {
        router.replace('/login')
        return
      }
      setUser(currentUser)

      const { error: penaltyError } = await supabase.rpc('apply_late_penalties')
      if (penaltyError) setErrMsg(penaltyError.message)

      const p = await loadProfile(currentUser.id)
      const todayStr = todayStrInTz(p?.timezone || DEFAULT_TZ)
      const now = fromInputDate(todayStr)
      setToday(now)
      setSelectedDate(now)
      await Promise.all([fetchStats(currentUser.id), fetchOverdue(currentUser.id, todayStr)])
      setLoading(false)
    }
    init()
  }, [supabase, router, loadProfile, fetchStats, fetchOverdue])

  // 2) Ambil tugas setiap tanggal terpilih berubah
  useEffect(() => {
    if (user && selectedDate) fetchDay(user.id, selectedDate)
  }, [user, selectedDate, fetchDay])

  if (loading || !user || !selectedDate || !today) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex items-center gap-3 px-6 py-4 rounded-2xl glass-card text-slate-600 font-semibold text-sm">
          <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          Memuat Dashboard...
        </div>
      </div>
    )
  }

  // ---- Turunan data ----
  const todayStr = toInputDate(today)
  const isToday = isSameDay(selectedDate, today)
  const isPastDate = selectedDate.getTime() < today.getTime()
  const allSubs = tasks.flatMap((t) => t.subtasks)
  const doneSubs = allSubs.filter((s) => s.is_done).length
  const progress = allSubs.length === 0 ? 0 : Math.round((doneSubs / allSubs.length) * 100)

  const refreshAll = () => {
    setVersion((v) => v + 1)
    fetchDay(user.id, selectedDate)
    fetchOverdue(user.id, todayStr)
    fetchStats(user.id)
    loadProfile(user.id)
  }

  const afterCreate = (start: Date, deadline: Date) => {
    const t = selectedDate.getTime()
    if (t >= start.getTime() && t <= deadline.getTime()) refreshAll()
    else {
      setSelectedDate(start) // effect akan memuat tanggal baru
      fetchStats(user.id)
    }
  }

  // ---- Aksi subtask (poin & penalti dihitung di database lewat RPC) ----
  const toggleSubtask = async (sub: Subtask) => {
    setErrMsg('')
    const { error } = await supabase.rpc('toggle_subtask', { p_subtask_id: sub.id, p_done: !sub.is_done })
    if (error) setErrMsg(error.message)
    refreshAll()
  }

  const addSubtask = async (task: Task, title: string, priority: Priority) => {
    setErrMsg('')
    const { error } = await supabase.from('subtasks').insert({ task_id: task.id, user_id: user.id, title, priority })
    if (error) setErrMsg(error.message)
    refreshAll()
  }

  const deleteSubtask = async (sub: Subtask) => {
    setErrMsg('')
    const { error } = await supabase.from('subtasks').delete().eq('id', sub.id)
    if (error) setErrMsg(error.message)
    refreshAll()
  }

  // ---- Aksi tugas ----
  const deleteTask = async (task: Task) => {
    setErrMsg('')
    const { error } = await supabase.from('tasks').delete().eq('id', task.id)
    if (error) setErrMsg(error.message)
    refreshAll()
  }

  const quickAdd = async (title: string, deadline: string, time: string) => {
    setErrMsg('')
    const { error } = await supabase.from('tasks').insert({
      user_id: user.id,
      title,
      start_date: todayStr,
      deadline,
      deadline_time: time || null,
    })
    if (error) {
      setErrMsg(error.message)
      return false
    }
    afterCreate(today, fromInputDate(deadline))
    return true
  }

  // ---- Hari libur ----
  const setFreeDay = async () => {
    setErrMsg('')
    const { error } = await supabase.from('day_offs').insert({ user_id: user.id, off_date: toInputDate(selectedDate) })
    if (error) setErrMsg(error.message)
    refreshAll()
  }

  const cancelFreeDay = async () => {
    setErrMsg('')
    const { error } = await supabase
      .from('day_offs')
      .delete()
      .eq('user_id', user.id)
      .eq('off_date', toInputDate(selectedDate))
    if (error) setErrMsg(error.message)
    refreshAll()
  }

  const renderCard = (t: Task) => {
    const overdue = isOverdue(t, tz)
    return (
      <TaskCard
        key={t.id}
        task={t}
        overdue={overdue}
        canCheck={todayStr >= t.start_date}
        canEdit={!overdue}
        onToggleSubtask={toggleSubtask}
        onDeleteSubtask={deleteSubtask}
        onAddSubtask={addSubtask}
        onDeleteTask={deleteTask}
      />
    )
  }

  return (
    <div className="min-h-screen bg-slate-50/50 flex">
      {showOnboarding && (
        <OnboardingModal
          userId={user.id}
          initialName={profile?.name || user.user_metadata?.full_name || ''}
          onComplete={() => loadProfile(user.id)}
        />
      )}

      <Sidebar />

      <main className="flex-1 p-4 md:p-6 pb-24 md:pb-6 max-w-7xl mx-auto w-full overflow-y-auto">
        <Header userName={profile?.name || user.user_metadata?.full_name || 'Pengguna'} userId={user.id} timezone={tz} refreshKey={version} />
        <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr] mb-6">
          <TownPreviewCard userId={user.id} points={profile?.points ?? 0} showPoints={completedTasks >= 1} />
          <StatCards completedTasks={completedTasks} progress={progress} />
        </div>
        <QuickAdd today={today} onAdd={quickAdd} />

        {errMsg && (
          <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 text-sm flex justify-between gap-3">
            <span>{errMsg}</span>
            <button onClick={() => setErrMsg('')} className="font-semibold shrink-0">Tutup</button>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[1fr_320px] items-start">
          <div className="space-y-6">
            {overdueTasks.length > 0 && (
              <section className="rounded-3xl p-6 bg-rose-50/70 border border-rose-200 space-y-3">
                <div>
                  <h3 className="font-bold text-rose-700">Terlambat ({overdueTasks.length})</h3>
                  <p className="text-xs text-rose-500 mt-0.5">Selesaikan segera. Subtask yang selesai terlambat tidak mendapat poin.</p>
                </div>
                <ul className="space-y-3">{overdueTasks.map(renderCard)}</ul>
              </section>
            )}

            {/* Kegiatan pada tanggal terpilih */}
            <section className="glass-card rounded-3xl p-6 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase font-bold tracking-wider text-slate-400">
                    {isToday ? 'Kegiatan hari ini' : isPastDate ? 'Riwayat kegiatan' : 'Kegiatan mendatang'}
                  </p>
                  <h3 className="font-bold text-slate-800 text-lg">{formatLongDate(selectedDate)}</h3>
                </div>
                <div className="flex gap-2">
                  {!isPastDate && !isFree && tasks.length === 0 && (
                    <button onClick={setFreeDay} className="px-4 py-2 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 text-sm font-semibold hover:bg-emerald-100 transition">
                      Set Hari Libur
                    </button>
                  )}
                  <button
                    onClick={() => setShowAdd(true)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold shadow-md shadow-indigo-600/25 hover:bg-indigo-700 transition"
                  >
                    <Plus className="w-4 h-4" /> Tambah Kegiatan
                  </button>
                </div>
              </div>

              {isFree && tasks.length === 0 ? (
                <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-8 text-center">
                  <PartyPopper className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                  <p className="font-semibold text-emerald-700">Tanggal ini ditandai libur</p>
                  {!isPastDate && (
                    <button onClick={cancelFreeDay} className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 hover:underline">
                      <Undo2 className="w-3.5 h-3.5" /> Batalkan hari libur
                    </button>
                  )}
                </div>
              ) : (
                <>
                  {isFree && (
                    <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 rounded-xl px-3 py-2">
                      <Info className="w-4 h-4 shrink-0" /> Tanggal ini ditandai libur, tetapi ada tugas yang rentangnya melewatinya.
                    </div>
                  )}

                  <ProgressBar done={doneSubs} total={allSubs.length} label="subtask" />

                  {tasks.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="font-semibold text-slate-700">Belum ada kegiatan di tanggal ini</p>
                      {!isPastDate && <p className="text-sm text-slate-400 mt-1">Tambahkan kegiatan, atau tandai sebagai hari libur.</p>}
                    </div>
                  ) : (
                    <ul className="space-y-3">{tasks.map(renderCard)}</ul>
                  )}
                </>
              )}
            </section>
          </div>

          <Calendar selected={selectedDate} onSelect={(d) => setSelectedDate(startOfDay(d))} />
        </div>
      </main>

      {showAdd && (
        <AddTaskModal
          userId={user.id}
          initialStart={isPastDate ? today : selectedDate}
          minDate={today}
          onClose={() => setShowAdd(false)}
          onSaved={afterCreate}
        />
      )}
    </div>
  )
}
