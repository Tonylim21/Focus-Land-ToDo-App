import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { createAdminClient } from '@/utils/supabase/admin'
import { processUser, type Outcome, type Recipient } from '@/utils/waReminders'

// Dipanggil tiap 15 menit oleh Supabase pg_cron (lihat 11_whatsapp_reminders.sql, bagian B).
// Perlu header: Authorization: Bearer <CRON_SECRET>
//
// Uji coba manual (parameter opsional):
//   ?dry=1                      tampilkan isi pesan saja, tidak mengirim
//   ?force=morning|nightly|deadline   abaikan jendela waktu dan catatan terkirim
//   ?user=<id user>             hanya satu user

function authorized(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const given = Buffer.from(req.headers.get('authorization') ?? '')
  const expected = Buffer.from(`Bearer ${secret}`)
  return given.length === expected.length && timingSafeEqual(given, expected)
}

async function run(req: Request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'CRON_SECRET belum diatur' }, { status: 500 })
  }
  if (!authorized(req)) return NextResponse.json({ error: 'Tidak diizinkan' }, { status: 401 })

  const url = new URL(req.url)
  const f = url.searchParams.get('force')
  const force = f === 'morning' || f === 'nightly' || f === 'deadline' ? f : null
  const dry = url.searchParams.get('dry') === '1'
  const onlyUser = url.searchParams.get('user')

  const admin = createAdminClient()
  let query = admin.from('profiles').select('id, name, phone_number, timezone').eq('wa_verified', true).eq('wa_notify', true)
  if (onlyUser) query = query.eq('id', onlyUser)
  const { data, error } = await query
  if (error) return NextResponse.json({ error: `Gagal membaca user: ${error.message}` }, { status: 500 })

  const recipients = ((data ?? []) as Recipient[]).filter((r) => !!r.phone_number)
  const results: Outcome[] = []
  for (const u of recipients) {
    try {
      results.push(...(await processUser(admin, u, { force, dry })))
    } catch (e) {
      results.push({ user: u.id, kind: 'error', status: 'failed', detail: e instanceof Error ? e.message : 'error tidak dikenal' })
    }
  }

  const count = (s: Outcome['status']) => results.filter((r) => r.status === s).length
  return NextResponse.json({
    checked: recipients.length,
    sent: count('sent'),
    failed: count('failed'),
    skipped: count('skipped'),
    dry: count('dry'),
    // pada jalan normal, hasil "skipped" tidak ditampilkan agar log ringkas
    results: dry || force ? results : results.filter((r) => r.status !== 'skipped'),
  })
}

export async function POST(req: Request) {
  return run(req)
}

// GET disediakan agar penjadwal eksternal yang hanya bisa GET juga bisa dipakai
export async function GET(req: Request) {
  return run(req)
}
