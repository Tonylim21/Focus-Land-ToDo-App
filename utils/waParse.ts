// Penguraian perintah WhatsApp. Sengaja tanpa dependensi supaya mudah diuji.

export type Priority = 'low' | 'medium' | 'high'

export interface ParsedDeadline {
  date: string // YYYY-MM-DD
  time: string | null // HH:MM
}

export type Command =
  | { kind: 'help' }
  | { kind: 'list' }
  | { kind: 'undo' }
  | { kind: 'done'; targets: { task: number; sub: number | null }[] }
  | { kind: 'add'; title: string; subtasks: { title: string; priority: Priority }[]; deadline: ParsedDeadline | null }
  | { kind: 'error'; message: string }
  | { kind: 'unknown' }

const HELP_WORDS = new Set(['bantuan', 'help', 'menu', 'panduan', '?'])
const LIST_WORDS = new Set(['list', 'daftar', 'tugas', 'agenda'])
const DONE_WORDS = new Set(['done', 'selesai', 'sudah', 'beres', 'finish'])
const ADD_WORDS = new Set(['tambah', 'add', 'baru', 'task', 'buat'])
const UNDO_WORDS = new Set(['undo', 'batal', 'urungkan'])

const MONTHS: Record<string, number> = {
  jan: 1, januari: 1, feb: 2, februari: 2, mar: 3, maret: 3, apr: 4, april: 4, mei: 5,
  jun: 6, juni: 6, jul: 7, juli: 7, agu: 8, agt: 8, agustus: 8, sep: 9, sept: 9, september: 9,
  okt: 10, oktober: 10, nov: 11, november: 11, des: 12, desember: 12,
}

const WEEKDAYS: Record<string, number> = {
  minggu: 0, ahad: 0, senin: 1, selasa: 2, rabu: 3, kamis: 4, jumat: 5, "jum'at": 5, sabtu: 6,
}

const pad = (n: number) => String(n).padStart(2, '0')

function addDays(date: string, n: number) {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

function weekdayOf(date: string) {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

/** Tanggal yang benar-benar ada di kalender? (menolak 31/02 dan sejenisnya) */
function makeDate(y: number, m: number, d: number) {
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null
  return `${y}-${pad(m)}-${pad(d)}`
}

/**
 * Baca deadline dari teks bebas. Contoh yang dikenali:
 *   "besok", "lusa", "hari ini", "+3", "3 hari lagi", "jumat", "jumat depan",
 *   "12/11", "12-11-2026", "2026-11-12", "12 nov", "12 november 2026"; ditambah jam opsional: "17:00", "17.30", "jam 9"
 * Mengembalikan null jika teks bukan deadline (supaya bisa dianggap daftar subtask).
 */
export function parseDeadline(input: string, today: string): ParsedDeadline | null {
  let text = input.toLowerCase().trim()
  if (!text) return null

  // 1) jam (opsional)
  let time: string | null = null
  const withColon = text.match(/(?:\b(?:jam|pukul)\s*)?\b(\d{1,2})[:.](\d{2})\b/)
  const hourOnly = withColon ? null : text.match(/\b(?:jam|pukul)\s*(\d{1,2})\b/)
  if (withColon) {
    const h = Number(withColon[1])
    const mi = Number(withColon[2])
    if (h > 23 || mi > 59) return null
    time = `${pad(h)}:${pad(mi)}`
    text = text.replace(withColon[0], ' ')
  } else if (hourOnly) {
    const h = Number(hourOnly[1])
    if (h > 23) return null
    time = `${pad(h)}:00`
    text = text.replace(hourOnly[0], ' ')
  }
  text = text.replace(/\s+/g, ' ').trim()

  // 2) tanggal
  if (text === '') return time ? { date: today, time } : null

  let date: string | null = null
  let m: RegExpMatchArray | null

  if (/^(hari ?ini|today)$/.test(text)) date = today
  else if (/^(besok|bsk|esok|tomorrow)$/.test(text)) date = addDays(today, 1)
  else if (text === 'lusa') date = addDays(today, 2)
  else if ((m = text.match(/^\+(\d{1,3})$/)) || (m = text.match(/^(\d{1,3}) ?hari( lagi)?$/))) {
    const n = Number(m[1])
    if (n > 365) return null
    date = addDays(today, n)
  } else if ((m = text.match(/^(?:hari )?(senin|selasa|rabu|kamis|jumat|jum'at|sabtu|minggu|ahad)(?: depan)?$/))) {
    const target = WEEKDAYS[m[1]]
    let diff = (target - weekdayOf(today) + 7) % 7
    if (diff === 0) diff = 7 // nama hari yang sama dengan hari ini = minggu depan
    date = addDays(today, diff)
  } else if ((m = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) {
    date = makeDate(Number(m[1]), Number(m[2]), Number(m[3]))
  } else if ((m = text.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2}|\d{4}))?$/))) {
    date = fromDayMonth(Number(m[1]), Number(m[2]), m[3], today)
  } else if ((m = text.match(/^(\d{1,2}) ?([a-z]+)(?: (\d{4}))?$/)) && MONTHS[m[2]]) {
    date = fromDayMonth(Number(m[1]), MONTHS[m[2]], m[3], today)
  }

  return date ? { date, time } : null
}

function fromDayMonth(d: number, mo: number, yearText: string | undefined, today: string) {
  const currentYear = Number(today.slice(0, 4))
  if (yearText) {
    const y = yearText.length === 2 ? 2000 + Number(yearText) : Number(yearText)
    return makeDate(y, mo, d)
  }
  const thisYear = makeDate(currentYear, mo, d)
  // tanpa tahun dan sudah lewat -> maksudnya tahun depan
  if (thisYear && thisYear < today) return makeDate(currentYear + 1, mo, d)
  return thisYear
}

const PRIORITY_TAGS: Record<string, Priority> = {
  tinggi: 'high', high: 'high', t: 'high',
  sedang: 'medium', medium: 'medium', s: 'medium',
  rendah: 'low', low: 'low', r: 'low',
}

function parseSubtask(raw: string): { title: string; priority: Priority } | null {
  let priority: Priority = 'medium'
  const title = raw
    .replace(/#([a-z]+)\b/gi, (full, tag: string) => {
      const p = PRIORITY_TAGS[tag.toLowerCase()]
      if (!p) return full
      priority = p
      return ''
    })
    .replace(/\s+/g, ' ')
    .trim()
  return title ? { title, priority } : null
}

const MAX_TITLE = 120
const MAX_SUBTASKS = 10

function parseAdd(rest: string, today: string): Command {
  if (!rest.trim()) {
    return { kind: 'error', message: 'Tulis judul tugasnya.\nContoh: *TAMBAH Belajar React | Baca docs; Latihan soal | besok 17:00*' }
  }

  const parts = rest.split('|').map((p) => p.trim())
  const title = parts[0].replace(/\s+/g, ' ')
  let subPart: string | undefined
  let dlPart: string | undefined

  if (parts.length >= 3) {
    subPart = parts[1]
    dlPart = parts.slice(2).join(' ')
  } else if (parts.length === 2) {
    // bagian kedua bisa deadline ("besok 17:00") atau subtask ("Baca docs; Latihan")
    if (parseDeadline(parts[1], today)) dlPart = parts[1]
    else subPart = parts[1]
  }

  if (!title) return { kind: 'error', message: 'Judul tugas tidak boleh kosong.' }
  if (title.length > MAX_TITLE) return { kind: 'error', message: `Judul terlalu panjang (maksimal ${MAX_TITLE} huruf).` }

  const subtasks: { title: string; priority: Priority }[] = []
  if (subPart) {
    for (const piece of subPart.split(/[;\n]/)) {
      const s = parseSubtask(piece)
      if (!s) continue
      if (s.title.length > MAX_TITLE) return { kind: 'error', message: `Salah satu subtask terlalu panjang (maksimal ${MAX_TITLE} huruf).` }
      subtasks.push(s)
    }
    if (subtasks.length > MAX_SUBTASKS) return { kind: 'error', message: `Maksimal ${MAX_SUBTASKS} subtask per tugas.` }
  }

  let deadline: ParsedDeadline | null = null
  if (dlPart && dlPart.trim()) {
    deadline = parseDeadline(dlPart, today)
    if (!deadline) {
      return { kind: 'error', message: `Deadline "${dlPart.trim()}" belum kupahami. Coba: *besok*, *lusa*, *jumat*, *12/11*, *+3*, atau tambah jam seperti *besok 17:00*.` }
    }
    if (deadline.date < today) return { kind: 'error', message: 'Deadline tidak boleh sebelum hari ini.' }
  }

  return { kind: 'add', title, subtasks, deadline }
}

function parseDone(rest: string): Command {
  const tokens = rest.split(/[\s,]+/).map((t) => t.replace(/^#/, '')).filter(Boolean)
  if (tokens.length === 0) {
    return { kind: 'error', message: 'Sebutkan nomor tugasnya.\nContoh: *DONE 2* atau *DONE 2.1* (subtask pertama dari tugas 2).' }
  }
  const targets: { task: number; sub: number | null }[] = []
  for (const token of tokens) {
    const m = token.match(/^(\d{1,3})(?:\.(\d{1,2}))?$/)
    if (!m) return { kind: 'error', message: `"${token}" bukan nomor yang valid. Contoh: *DONE 2* atau *DONE 2.1*.` }
    const task = Number(m[1])
    const sub = m[2] ? Number(m[2]) : null
    if (task < 1 || (sub !== null && sub < 1)) return { kind: 'error', message: 'Nomor dimulai dari 1.' }
    targets.push({ task, sub })
  }
  return { kind: 'done', targets }
}

export function parseCommand(raw: string, today: string): Command {
  let text = raw.trim().replace(/^[/!.]+/, '').trim()
  if (!text) return { kind: 'unknown' }

  if (text.startsWith('+')) return parseAdd(text.slice(1).trim(), today)
  if (/^hari ?ini$/i.test(text)) return { kind: 'list' }

  const m = text.match(/^(\S+)\s*([\s\S]*)$/)
  if (!m) return { kind: 'unknown' }
  const word = m[1].toLowerCase().replace(/[:,.!]+$/, '')
  const rest = m[2].trim()
  text = word

  if (HELP_WORDS.has(word)) return { kind: 'help' }
  if (LIST_WORDS.has(word)) return { kind: 'list' }
  if (UNDO_WORDS.has(word)) return { kind: 'undo' }
  if (DONE_WORDS.has(word)) return parseDone(rest)
  if (ADD_WORDS.has(word)) return parseAdd(rest, today)
  return { kind: 'unknown' }
}
