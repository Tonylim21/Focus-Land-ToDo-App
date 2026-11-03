import type { Task } from '@/types'

export const DEFAULT_TZ = 'Asia/Jakarta'

/** Tanggal hari ini ("YYYY-MM-DD") menurut zona waktu user, sama dengan yang dipakai database */
export function todayStrInTz(tz: string) {
  try {
    return new Date().toLocaleDateString('en-CA', { timeZone: tz })
  } catch {
    return new Date().toLocaleDateString('en-CA', { timeZone: DEFAULT_TZ })
  }
}

function nowTimeInTz(tz: string) {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).format(new Date()) // "HH:MM:SS"
  } catch {
    return nowTimeInTz(DEFAULT_TZ)
  }
}

/** Apakah deadline sudah lewat? (hanya untuk tampilan, keputusan akhir ada di database) */
export function isOverdue(task: Pick<Task, 'deadline' | 'deadline_time'>, tz: string) {
  const today = todayStrInTz(tz)
  if (task.deadline < today) return true
  if (task.deadline > today) return false
  return nowTimeInTz(tz) > (task.deadline_time ?? '23:59:59')
}

// Kolom subtask yang boleh dibaca browser. Sengaja TANPA points & penalty
// supaya nilai poin per subtask tidak terlihat oleh user (juga di tab Network).
export const SUBTASK_COLS = 'id, task_id, user_id, title, priority, is_done, completed_at, penalized_at, created_at'
export const TASK_SELECT = `*, subtasks(${SUBTASK_COLS})`
