export function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

/** Rentang [awal hari, awal hari berikutnya) dalam ISO string */
export function dayRange(d: Date): [string, string] {
  const start = startOfDay(d)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  return [start.toISOString(), end.toISOString()]
}

/** Gabungkan tanggal + "HH:mm". Jika time kosong -> jam 00:00 (artinya tanpa jam) */
export function withTime(d: Date, time: string) {
  const out = startOfDay(d)
  if (time) {
    const [h, m] = time.split(':').map(Number)
    out.setHours(h, m, 0, 0)
  }
  return out
}

export function formatTime(iso: string) {
  const d = new Date(iso)
  if (d.getHours() === 0 && d.getMinutes() === 0) return null
  return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false })
}

export function formatLongDate(d: Date) {
  return d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

export function isSameDay(a: Date, b: Date) {
  return a.toDateString() === b.toDateString()
}

/** Date -> "YYYY-MM-DD" (waktu lokal) untuk <input type="date"> */
export function toInputDate(d: Date) {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/** "YYYY-MM-DD" -> Date jam 00:00 lokal */
export function fromInputDate(s: string) {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
}
