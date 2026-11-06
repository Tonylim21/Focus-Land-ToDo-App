// Penyusun isi pesan WhatsApp. Format WhatsApp: *tebal*, _miring_.
import type { Priority } from '@/types'
import { fromInputDate } from '@/utils/date'
import { addDaysStr } from '@/utils/waSchedule'

export interface ReminderTask {
  id: string
  title: string
  start_date: string
  deadline: string
  deadline_time: string | null
  subtasks: { id: string; title: string; priority: Priority; created_at: string }[]
}

const PRIO_ICON: Record<Priority, string> = { high: '🔴', medium: '🟡', low: '🟢' }

// Buang karakter yang akan merusak format WhatsApp
export const clean = (s: string) => s.replace(/[*_~`]/g, '').trim()

const longDay = (d: string) =>
  fromInputDate(d).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' })
const shortDay = (d: string) =>
  fromInputDate(d).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' })

export function deadlineLabel(t: Pick<ReminderTask, 'deadline' | 'deadline_time'>, today: string) {
  const time = t.deadline_time ? ` ${t.deadline_time.slice(0, 5)}` : ''
  if (t.deadline === today) return `hari ini${time}`
  if (t.deadline === addDaysStr(today, 1)) return `besok${time}`
  return `${shortDay(t.deadline)}${time}`
}

function footer() {
  const site = process.env.NEXT_PUBLIC_SITE_URL
  return site ? `\n\n${site.replace(/\/$/, '')}` : ''
}

/**
 * Daftar bernomor. Urutan = [...active, ...overdue] — SAMA dengan urutan yang disimpan di wa_snapshots,
 * jadi nomor di pesan ini bisa dipakai untuk perintah "DONE <nomor>".
 */
function numberedBlocks(active: ReminderTask[], overdue: ReminderTask[], today: string, maxTasks: number) {
  const all = [...active.map((t) => ({ t, late: false })), ...overdue.map((t) => ({ t, late: true }))]
  const lines: string[] = []
  let shownActive = false
  let shownLate = false

  all.slice(0, maxTasks).forEach(({ t, late }, i) => {
    const n = i + 1
    if (!late && !shownActive) {
      lines.push('*Kegiatan hari ini*')
      shownActive = true
    }
    if (late && !shownLate) {
      if (lines.length > 0) lines.push('')
      lines.push('*⚠️ Terlambat*')
      shownLate = true
    }
    lines.push(
      late
        ? `${n}. *${clean(t.title)}* (deadline ${shortDay(t.deadline)})`
        : `${n}. *${clean(t.title)}* (deadline ${deadlineLabel(t, today)})`
    )
    t.subtasks.slice(0, 5).forEach((s, j) => lines.push(`   ${n}.${j + 1} ${PRIO_ICON[s.priority]} ${clean(s.title)}`))
    if (t.subtasks.length > 5) lines.push(`   … +${t.subtasks.length - 5} subtask lagi`)
  })

  if (all.length > maxTasks) lines.push('', `… dan ${all.length - maxTasks} tugas lainnya`)
  return lines
}

export function buildMorning(p: { name: string; today: string; active: ReminderTask[]; overdue: ReminderTask[] }) {
  const lines: string[] = [`*Selamat pagi, ${clean(p.name)}!* ☀️`, `Ringkasan ${longDay(p.today)}`, '']
  lines.push(...numberedBlocks(p.active, p.overdue, p.today, 8))
  if (p.overdue.length > 0) {
    lines.push('', '_Subtask yang terlambat mengurangi poinmu. Selesaikan secepatnya._')
  }
  lines.push('', 'Balas *DONE 1* untuk menyelesaikan tugas, atau *BANTUAN* untuk perintah lain. Semangat! 💪')
  return lines.join('\n') + footer()
}

/** Balasan untuk perintah LIST */
export function buildTaskList(p: { today: string; active: ReminderTask[]; overdue: ReminderTask[] }) {
  if (p.active.length + p.overdue.length === 0) {
    return `*Tugas aktif* — ${longDay(p.today)}\n\nTidak ada tugas yang menunggu 🎉\nKetik *TAMBAH judul* untuk membuat tugas baru.`
  }
  const lines = [`*Tugas aktif* — ${longDay(p.today)}`, '', ...numberedBlocks(p.active, p.overdue, p.today, 15)]
  lines.push('', 'Balas *DONE 1* (tugas) atau *DONE 1.2* (subtask).')
  return lines.join('\n')
}

export function buildNightly(p: { name: string; tomorrow: string; pendingToday: number }) {
  const lines = [
    `*Selamat malam, ${clean(p.name)}!* 🌙`,
    `Besok (${longDay(p.tomorrow)}) belum ada kegiatan di FocusLand.`,
    'Luangkan 2 menit untuk merencanakan harimu supaya besok lebih terarah.',
    'Balas *TAMBAH judul tugas | besok* untuk langsung membuatnya di sini.',
  ]
  if (p.pendingToday > 0) lines.push('', `_Catatan: hari ini masih ada ${p.pendingToday} subtask yang belum selesai._`)
  return lines.join('\n') + footer()
}

function remainingLabel(minutes: number) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h > 0 && m > 0) return `${h} jam ${m} menit`
  if (h > 0) return `${h} jam`
  return `${m} menit`
}

export function buildDeadlineAlert(p: {
  name: string
  today: string
  soon: { task: ReminderTask; minutes: number }[]
  late: ReminderTask[]
}) {
  const lines: string[] = [`Halo ${clean(p.name)},`, '']

  if (p.soon.length > 0) {
    lines.push('*⏰ Deadline sebentar lagi*')
    p.soon.slice(0, 5).forEach(({ task, minutes }) =>
      lines.push(
        `• ${clean(task.title)} — ${remainingLabel(minutes)} lagi (${deadlineLabel(task, p.today)}) · ${task.subtasks.length} subtask belum selesai`
      )
    )
    lines.push('')
  }

  if (p.late.length > 0) {
    lines.push('*⚠️ Lewat deadline*')
    p.late.slice(0, 5).forEach((t) => lines.push(`• ${clean(t.title)} — ${t.subtasks.length} subtask belum selesai`))
    lines.push('_Penalti poin berlaku untuk subtask yang terlambat. Subtask yang selesai terlambat tidak mendapat poin._', '')
  }

  return lines.join('\n').trimEnd() + footer()
}

export const HELP_TEXT = [
  '*FocusLand lewat WhatsApp* 🤖',
  '',
  '*LIST* — lihat tugas aktif (bernomor)',
  '*DONE 2* — selesaikan tugas nomor 2',
  '*DONE 2.1* — selesaikan subtask 1 dari tugas 2',
  '*DONE 1 3* — beberapa sekaligus',
  '*UNDO* — batalkan DONE terakhir',
  '*TAMBAH judul* — tugas baru untuk hari ini',
  '*TAMBAH judul | subtask 1; subtask 2 | besok 17:00* — lengkap dengan subtask dan deadline',
  '',
  'Prioritas subtask: tambahkan *#tinggi*, *#sedang*, atau *#rendah* (bawaan: sedang).',
  'Deadline: *besok*, *lusa*, *jumat*, *12/11*, *+3*, boleh dengan jam seperti *17:00*.',
  '',
  'Contoh:',
  'TAMBAH Fix bug | Login #tinggi; Input produk | jumat 17:00',
].join('\n')
