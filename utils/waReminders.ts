// Logika pengingat WhatsApp (khusus server). Dipanggil oleh /api/cron/whatsapp dan /api/whatsapp/test.
import type { SupabaseClient } from '@supabase/supabase-js'
import { sendWhatsApp } from '@/utils/whatsapp'
import { addDaysStr, deadlineMs, localNow } from '@/utils/waSchedule'
import { buildDeadlineAlert, buildMorning, buildNightly, type ReminderTask } from '@/utils/waMessages'
import { saveSnapshot } from '@/utils/waSnapshot'

export interface Recipient {
  id: string
  name: string | null
  phone_number: string
  timezone: string | null
}

export interface RunOptions {
  force?: 'morning' | 'nightly' | 'deadline' | null // abaikan jendela waktu & catatan terkirim (uji coba)
  dry?: boolean // hanya tampilkan isi pesan, tidak mengirim
  now?: Date
}

export interface Outcome {
  user: string
  kind: string
  status: 'sent' | 'skipped' | 'failed' | 'dry'
  detail?: string
  message?: string
}

// Jendela waktu lokal (menit sejak tengah malam)
const MORNING = [7 * 60, 7 * 60 + 30] // 07:00 - 07:29
const NIGHTLY = [20 * 60, 20 * 60 + 30] // 20:00 - 20:29
const DAYTIME = [7 * 60 + 30, 22 * 60] // 07:30 - 21:59, jam boleh mengirim peringatan deadline
const SOON_MS = 3 * 3_600_000 // peringatan 3 jam sebelum deadline
const LATE_MAX_MS = 24 * 3_600_000 // pemberitahuan terlambat hanya untuk yang lewat < 24 jam

/** Tugas yang sudah dimulai dan masih punya subtask belum selesai (hanya subtask yang belum selesai yang dimuat) */
export async function fetchPendingTasks(admin: SupabaseClient, userId: string, today: string): Promise<ReminderTask[]> {
  const { data, error } = await admin
    .from('tasks')
    .select('id, title, start_date, deadline, deadline_time, created_at, subtasks!inner(id, title, priority, created_at)')
    .eq('user_id', userId)
    .lte('start_date', today)
    .eq('subtasks.is_done', false)
    .order('deadline', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(60)
  if (error) throw new Error(error.message)
  const tasks = (data ?? []) as unknown as ReminderTask[]
  // urutan subtask harus stabil: dipakai untuk penomoran "DONE 2.1"
  tasks.forEach((t) => t.subtasks.sort((a, b) => a.created_at.localeCompare(b.created_at)))
  return tasks
}

export function splitTasks(tasks: ReminderTask[], tz: string, nowMs: number) {
  const overdue = tasks.filter((t) => deadlineMs(t.deadline, t.deadline_time, tz) <= nowMs)
  const active = tasks.filter((t) => deadlineMs(t.deadline, t.deadline_time, tz) > nowMs)
  return { active, overdue }
}

async function hasDayOff(admin: SupabaseClient, userId: string, date: string) {
  const { data } = await admin.from('day_offs').select('id').eq('user_id', userId).eq('off_date', date).maybeSingle()
  return !!data
}

async function countTasksCovering(admin: SupabaseClient, userId: string, date: string) {
  const { count } = await admin
    .from('tasks')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .lte('start_date', date)
    .gte('deadline', date)
  return count ?? 0
}

// "Klaim" dulu sebelum mengirim: constraint unik di database mencegah pesan ganda walau dua proses berjalan bersamaan
async function claim(admin: SupabaseClient, userId: string, kind: string, ref: string) {
  const { error } = await admin.from('wa_notifications').insert({ user_id: userId, kind, ref })
  if (!error) return true
  if ((error as { code?: string }).code === '23505') return false
  throw new Error(error.message)
}

async function release(admin: SupabaseClient, userId: string, kind: string, ref: string) {
  await admin.from('wa_notifications').delete().eq('user_id', userId).eq('kind', kind).eq('ref', ref)
}

const inWindow = (minutes: number, [from, to]: number[]) => minutes >= from && minutes < to

export async function processUser(admin: SupabaseClient, u: Recipient, opts: RunOptions = {}): Promise<Outcome[]> {
  const out: Outcome[] = []
  const tz = u.timezone || 'Asia/Jakarta'
  const nowDate = opts.now ?? new Date()
  const nowMs = nowDate.getTime()
  const now = localNow(tz, nowDate)
  const today = now.date
  const tomorrow = addDaysStr(today, 1)
  const name = (u.name ?? 'kamu').trim().split(/\s+/)[0] || 'kamu'
  const force = opts.force ?? null

  const wantMorning = force === 'morning' || (!force && inWindow(now.minutes, MORNING))
  const wantNightly = force === 'nightly' || (!force && inWindow(now.minutes, NIGHTLY))
  const wantAlert = force === 'deadline' || (!force && inWindow(now.minutes, DAYTIME))
  if (!wantMorning && !wantNightly && !wantAlert) return out // di luar semua jendela: hemat query

  const tasks = await fetchPendingTasks(admin, u.id, today)

  const deliver = async (kind: string, ref: string, message: string): Promise<Outcome> => {
    if (opts.dry) return { user: u.id, kind, status: 'dry', message }
    if (!force && !(await claim(admin, u.id, kind, ref))) {
      return { user: u.id, kind, status: 'skipped', detail: 'sudah pernah dikirim' }
    }
    const res = await sendWhatsApp(u.phone_number, message)
    if (!res.ok) {
      if (!force) await release(admin, u.id, kind, ref) // supaya dicoba lagi di putaran berikutnya
      return { user: u.id, kind, status: 'failed', detail: res.reason }
    }
    return { user: u.id, kind, status: 'sent' }
  }

  // ---- 1. Ringkasan pagi ----
  if (wantMorning) {
    const { active, overdue } = splitTasks(tasks, tz, nowMs)
    if (!force && (await hasDayOff(admin, u.id, today))) {
      out.push({ user: u.id, kind: 'morning', status: 'skipped', detail: 'hari ini libur' })
    } else if (active.length + overdue.length === 0) {
      out.push({ user: u.id, kind: 'morning', status: 'skipped', detail: 'tidak ada tugas' })
    } else {
      const o = await deliver('morning', today, buildMorning({ name, today, active, overdue }))
      out.push(o)
      // Tugas terlambat yang sudah ada di ringkasan tidak perlu diberitahukan lagi nanti
      // Simpan daftar bernomor yang baru dikirim agar "DONE 2" merujuk ke tugas yang benar
      if (o.status === 'sent') await saveSnapshot(admin, u.id, [...active, ...overdue])
      if (o.status === 'sent' && !force && overdue.length > 0) {
        await admin
          .from('wa_notifications')
          .upsert(
            overdue.map((t) => ({ user_id: u.id, kind: 'deadline', ref: `${t.id}:late` })),
            { onConflict: 'user_id,kind,ref', ignoreDuplicates: true }
          )
      }
    }
  }

  // ---- 2. Peringatan deadline (3 jam sebelum) dan pemberitahuan terlambat ----
  if (wantAlert) {
    let soon: { task: ReminderTask; minutes: number }[] = []
    let late: ReminderTask[] = []
    for (const t of tasks) {
      const remaining = deadlineMs(t.deadline, t.deadline_time, tz) - nowMs
      if (remaining > 0 && remaining <= SOON_MS) soon.push({ task: t, minutes: Math.ceil(remaining / 60_000) })
      else if (remaining <= 0 && remaining > -LATE_MAX_MS) late.push(t)
    }

    if (soon.length + late.length > 0) {
      const claimed: string[] = []
      if (!force && !opts.dry) {
        const keepSoon: typeof soon = []
        const keepLate: typeof late = []
        for (const s of soon) if (await claim(admin, u.id, 'deadline', `${s.task.id}:soon`)) { keepSoon.push(s); claimed.push(`${s.task.id}:soon`) }
        for (const t of late) if (await claim(admin, u.id, 'deadline', `${t.id}:late`)) { keepLate.push(t); claimed.push(`${t.id}:late`) }
        soon = keepSoon
        late = keepLate
      }

      if (soon.length + late.length === 0) {
        out.push({ user: u.id, kind: 'deadline', status: 'skipped', detail: 'sudah pernah dikirim' })
      } else {
        const message = buildDeadlineAlert({ name, today, soon, late })
        if (opts.dry) {
          out.push({ user: u.id, kind: 'deadline', status: 'dry', message })
        } else {
          const res = await sendWhatsApp(u.phone_number, message)
          if (!res.ok) {
            for (const ref of claimed) await release(admin, u.id, 'deadline', ref)
            out.push({ user: u.id, kind: 'deadline', status: 'failed', detail: res.reason })
          } else {
            out.push({ user: u.id, kind: 'deadline', status: 'sent' })
          }
        }
      }
    }
  }

  // ---- 3. Pengingat malam: besok belum ada kegiatan ----
  if (wantNightly) {
    const off = await hasDayOff(admin, u.id, tomorrow)
    const covering = await countTasksCovering(admin, u.id, tomorrow)
    if (!force && (off || covering > 0)) {
      out.push({ user: u.id, kind: 'nightly', status: 'skipped', detail: off ? 'besok libur' : 'besok sudah ada kegiatan' })
    } else {
      const pendingToday = tasks
        .filter((t) => t.deadline >= today)
        .reduce((sum, t) => sum + t.subtasks.length, 0)
      out.push(await deliver('nightly', today, buildNightly({ name, tomorrow, pendingToday })))
    }
  }

  return out
}
