// Menjalankan perintah WhatsApp dari user (khusus server). Mengembalikan teks balasan.
import type { SupabaseClient } from '@supabase/supabase-js'
import { parseCommand } from '@/utils/waParse'
import { deadlineMs, localNow } from '@/utils/waSchedule'
import { HELP_TEXT, buildTaskList, clean, deadlineLabel } from '@/utils/waMessages'
import { fetchPendingTasks, splitTasks, type Recipient } from '@/utils/waReminders'
import { loadSnapshot, saveSnapshot, setLastDone } from '@/utils/waSnapshot'

const SNAPSHOT_MAX_AGE_MS = 24 * 3_600_000

async function currentList(admin: SupabaseClient, user: Recipient, now: Date) {
  const tz = user.timezone || 'Asia/Jakarta'
  const today = localNow(tz, now).date
  const tasks = await fetchPendingTasks(admin, user.id, today)
  const { active, overdue } = splitTasks(tasks, tz, now.getTime())
  return { today, tz, active, overdue, ordered: [...active, ...overdue] }
}

async function doList(admin: SupabaseClient, user: Recipient, now: Date) {
  const { today, active, overdue, ordered } = await currentList(admin, user, now)
  await saveSnapshot(admin, user.id, ordered)
  return buildTaskList({ today, active, overdue })
}

interface SubRow {
  id: string
  title: string
  is_done: boolean
  task_id: string
  tasks: { title: string; deadline: string; deadline_time: string | null } | null
}

async function doDone(
  admin: SupabaseClient,
  user: Recipient,
  targets: { task: number; sub: number | null }[],
  now: Date
) {
  const tz = user.timezone || 'Asia/Jakarta'
  const snap = await loadSnapshot(admin, user.id)
  if (!snap || snap.items.length === 0 || now.getTime() - new Date(snap.updated_at).getTime() > SNAPSHOT_MAX_AGE_MS) {
    return 'Ketik *LIST* dulu supaya aku tahu nomor tugasmu.'
  }

  const ids = new Set<string>()
  const errors: string[] = []
  for (const tg of targets) {
    const entry = snap.items[tg.task - 1]
    if (!entry) {
      errors.push(`Nomor ${tg.task} tidak ada.`)
      continue
    }
    if (tg.sub === null) entry.s.forEach((id) => ids.add(id))
    else {
      const id = entry.s[tg.sub - 1]
      if (!id) errors.push(`Subtask ${tg.task}.${tg.sub} tidak ada.`)
      else ids.add(id)
    }
  }
  if (ids.size === 0) return errors.join('\n') || 'Tidak ada yang bisa diselesaikan.'

  const { data, error } = await admin
    .from('subtasks')
    .select('id, title, is_done, task_id, tasks(title, deadline, deadline_time)')
    .in('id', [...ids])
    .eq('user_id', user.id)
  if (error) return `Maaf, terjadi kesalahan: ${error.message}`
  const rows = (data ?? []) as unknown as SubRow[]

  const alreadyDone = rows.filter((r) => r.is_done).length
  const byTask = new Map<string, { title: string; count: number; late: boolean; finished: boolean }>()
  const completed: string[] = []

  for (const r of rows.filter((x) => !x.is_done)) {
    const { error: rpcError } = await admin.rpc('wa_toggle_subtask', { p_uid: user.id, p_subtask: r.id, p_done: true })
    if (rpcError) {
      errors.push(`${clean(r.title)}: ${rpcError.message}`)
      continue
    }
    completed.push(r.id)
    const late = r.tasks ? deadlineMs(r.tasks.deadline, r.tasks.deadline_time, tz) <= now.getTime() : false
    const cur = byTask.get(r.task_id) ?? { title: r.tasks?.title ?? 'Tugas', count: 0, late: false, finished: false }
    cur.count += 1
    cur.late = cur.late || late
    byTask.set(r.task_id, cur)
  }

  if (completed.length > 0) await setLastDone(admin, user.id, completed)

  for (const [taskId, info] of byTask) {
    const { count } = await admin
      .from('subtasks')
      .select('id', { count: 'exact', head: true })
      .eq('task_id', taskId)
      .eq('is_done', false)
    info.finished = (count ?? 0) === 0
  }

  const lines: string[] = []
  for (const info of byTask.values()) {
    lines.push(
      `✅ *${clean(info.title)}* — ${info.count} subtask selesai${info.finished ? ' 🎉 tugas tuntas!' : ''}${
        info.late ? ' _(terlambat, tanpa poin)_' : ''
      }`
    )
  }
  if (alreadyDone > 0 && completed.length === 0) lines.push('Itu sudah selesai sebelumnya 👍')
  if (errors.length > 0) lines.push('', ...errors)
  if (completed.length > 0) lines.push('', '_Salah centang? Balas *UNDO*._')
  return lines.join('\n').trim() || 'Tidak ada perubahan.'
}

async function doUndo(admin: SupabaseClient, user: Recipient) {
  const snap = await loadSnapshot(admin, user.id)
  const ids = snap?.last_done ?? []
  if (ids.length === 0) return 'Tidak ada yang bisa dibatalkan.'

  let ok = 0
  const errors: string[] = []
  for (const id of ids) {
    const { error } = await admin.rpc('wa_toggle_subtask', { p_uid: user.id, p_subtask: id, p_done: false })
    if (error) errors.push(error.message)
    else ok += 1
  }
  await setLastDone(admin, user.id, [])

  const lines = [ok > 0 ? `↩️ ${ok} subtask dikembalikan menjadi belum selesai.` : 'Tidak ada yang berhasil dibatalkan.']
  if (errors.length > 0) lines.push(...Array.from(new Set(errors)))
  return lines.join('\n')
}

async function doAdd(
  admin: SupabaseClient,
  user: Recipient,
  cmd: { title: string; subtasks: { title: string; priority: 'low' | 'medium' | 'high' }[]; deadline: { date: string; time: string | null } | null },
  now: Date
) {
  const tz = user.timezone || 'Asia/Jakarta'
  const today = localNow(tz, now).date
  const deadline = cmd.deadline?.date ?? today
  const time = cmd.deadline?.time ?? null

  const { data: task, error } = await admin
    .from('tasks')
    .insert({ user_id: user.id, title: cmd.title, start_date: today, deadline, deadline_time: time })
    .select('id')
    .single()
  if (error || !task) return `Maaf, tugas gagal dibuat: ${error?.message ?? 'tidak diketahui'}`

  // Tanpa subtask yang ditulis user: buat satu subtask bernama sama agar tugas bisa diselesaikan lewat DONE
  const subs = cmd.subtasks.length > 0 ? cmd.subtasks : [{ title: cmd.title, priority: 'medium' as const }]
  const { error: subError } = await admin
    .from('subtasks')
    .insert(subs.map((s) => ({ task_id: task.id, user_id: user.id, title: s.title, priority: s.priority })))
  if (subError) {
    await admin.from('tasks').delete().eq('id', task.id)
    return `Maaf, subtask gagal dibuat: ${subError.message}`
  }

  const { ordered } = await currentList(admin, user, now)
  await saveSnapshot(admin, user.id, ordered)
  const index = ordered.findIndex((t) => t.id === task.id) + 1

  const lines = [`✅ Tugas ditambahkan: *${clean(cmd.title)}*`, `Deadline: ${deadlineLabel({ deadline, deadline_time: time }, today)}`]
  if (cmd.subtasks.length > 0) cmd.subtasks.forEach((s, i) => lines.push(`   ${index > 0 ? `${index}.` : ''}${i + 1} ${clean(s.title)}`))
  lines.push('')
  lines.push(index > 0 ? `Nomor tugas: *${index}*. Selesaikan dengan *DONE ${index}*.` : 'Ketik *LIST* untuk melihat nomornya.')
  if (deadline > today) lines.push('_Tugas ini muncul di daftar mulai hari ini sampai deadline._')
  return lines.join('\n')
}

export async function handleMessage(admin: SupabaseClient, user: Recipient, text: string, now: Date = new Date()): Promise<string | null> {
  const tz = user.timezone || 'Asia/Jakarta'
  const today = localNow(tz, now).date
  const cmd = parseCommand(text, today)

  switch (cmd.kind) {
    case 'help':
      return HELP_TEXT
    case 'list':
      return doList(admin, user, now)
    case 'done':
      return doDone(admin, user, cmd.targets, now)
    case 'undo':
      return doUndo(admin, user)
    case 'add':
      return doAdd(admin, user, cmd, now)
    case 'error':
      return cmd.message
    default:
      return 'Perintah tidak dikenali. Ketik *BANTUAN* untuk melihat daftar perintah.'
  }
}
