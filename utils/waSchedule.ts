// Perhitungan waktu per zona waktu user untuk pengingat WhatsApp (khusus server).
// Indonesia tidak memakai DST, jadi offset tiap zona tetap.

const OFFSET_HOURS: Record<string, number> = {
  'Asia/Jakarta': 7, // WIB
  'Asia/Makassar': 8, // WITA
  'Asia/Jayapura': 9, // WIT
}

export const tzOffsetHours = (tz: string) => OFFSET_HOURS[tz] ?? 7

/** Tanggal ("YYYY-MM-DD") dan menit sejak tengah malam menurut zona waktu user */
export function localNow(tz: string, at: Date = new Date()) {
  const zone = tz in OFFSET_HOURS ? tz : 'Asia/Jakarta'
  const date = at.toLocaleDateString('en-CA', { timeZone: zone })
  const hm = new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(at)
  const [h, m] = hm.split(':').map(Number)
  return { date, minutes: h * 60 + m }
}

/** Tambah n hari pada tanggal "YYYY-MM-DD" */
export function addDaysStr(date: string, n: number) {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

/** Waktu deadline dalam epoch ms. Tanpa jam = akhir hari (23:59:59) di zona waktu user. */
export function deadlineMs(deadline: string, time: string | null, tz: string) {
  const [y, mo, d] = deadline.split('-').map(Number)
  const [h, mi, s] = (time ?? '23:59:59').split(':').map(Number)
  return Date.UTC(y, mo - 1, d, h, mi, s || 0) - tzOffsetHours(tz) * 3_600_000
}
