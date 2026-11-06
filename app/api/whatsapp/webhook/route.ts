import { NextResponse } from 'next/server'
import { createHash, timingSafeEqual } from 'crypto'
import { createAdminClient } from '@/utils/supabase/admin'
import { normalizePhone } from '@/utils/phone'
import { sendWhatsApp } from '@/utils/whatsapp'
import { handleMessage } from '@/utils/waCommands'
import type { Recipient } from '@/utils/waReminders'

// Webhook pesan masuk dari Fonnte.
// Atur di Fonnte -> Device -> Edit: URL webhook = https://<domain>/api/whatsapp/webhook?key=<WEBHOOK_SECRET>
// dan nyalakan "Auto read". Fonnte mengirim JSON berisi: device, sender, message, member, name, timestamp, inboxid, ...
//
// Uji lokal tanpa Fonnte:
//   curl -X POST "http://localhost:3000/api/whatsapp/webhook?key=SECRET&noreply=1" \
//     -H "Content-Type: application/json" -d '{"sender":"62812xxxxxxx","message":"LIST"}'
//   (noreply=1: balasan dikembalikan sebagai JSON, tidak dikirim ke WhatsApp. Perintahnya tetap dijalankan sungguhan.)

const RATE_LIMIT_PER_MINUTE = 15

function keyOk(req: Request) {
  const secret = process.env.WEBHOOK_SECRET
  if (!secret) return false
  const given = Buffer.from(new URL(req.url).searchParams.get('key') ?? '')
  const expected = Buffer.from(secret)
  return given.length === expected.length && timingSafeEqual(given, expected)
}

async function readBody(req: Request): Promise<Record<string, unknown>> {
  const type = req.headers.get('content-type') ?? ''
  try {
    if (type.includes('application/json')) return (await req.json()) as Record<string, unknown>
    if (type.includes('form')) return Object.fromEntries((await req.formData()).entries())
    const raw = await req.text()
    try {
      return JSON.parse(raw) as Record<string, unknown>
    } catch {
      return Object.fromEntries(new URLSearchParams(raw))
    }
  } catch {
    return {}
  }
}

const ok = (extra: Record<string, unknown> = {}) => NextResponse.json({ ok: true, ...extra })

export async function POST(req: Request) {
  if (!process.env.WEBHOOK_SECRET) return NextResponse.json({ error: 'WEBHOOK_SECRET belum diatur' }, { status: 500 })
  if (!keyOk(req)) return NextResponse.json({ error: 'Tidak diizinkan' }, { status: 401 })

  const noReply = new URL(req.url).searchParams.get('noreply') === '1'
  const body = await readBody(req)

  const sender = String(body.sender ?? '').split('@')[0]
  const message = String(body.message ?? '').trim()
  const device = String(body.device ?? '')
  if (!sender || !message) return ok({ ignored: 'kosong' })
  if (body.member) return ok({ ignored: 'grup' }) // pesan dari grup diabaikan

  // Bila nomor perangkat diatur, abaikan webhook dari perangkat lain
  const myDevice = process.env.FONNTE_DEVICE ? normalizePhone(process.env.FONNTE_DEVICE) : null
  if (myDevice && device && normalizePhone(device) !== myDevice) return ok({ ignored: 'perangkat lain' })

  // Cegah perulangan: abaikan pesan yang tampak seperti balasan bot sendiri
  if (/^[*✅🎉↩️⚠️⏰🤖☀️🌙]/u.test(message)) return ok({ ignored: 'pesan bot' })

  const phone = normalizePhone(sender)
  if (!phone) return ok({ ignored: 'nomor tidak valid' })

  const admin = createAdminClient()

  // Hanya nomor yang sudah terverifikasi milik akun FocusLand yang dilayani
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id, name, phone_number, timezone')
    .eq('phone_number', phone)
    .eq('wa_verified', true)
    .maybeSingle()
  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 })
  if (!profile) return ok({ ignored: 'nomor tidak terdaftar' })
  const user = profile as Recipient

  if (!noReply) {
    // Satu pesan hanya diproses sekali (Fonnte bisa mengirim ulang webhook)
    const dedupeKey = body.inboxid
      ? `inbox:${String(body.inboxid)}`
      : `${String(body.timestamp ?? Math.floor(Date.now() / 10_000))}:${createHash('sha1').update(message).digest('hex')}`
    const { error: dupError } = await admin.from('wa_inbound').insert({ user_id: user.id, key: dedupeKey })
    if (dupError) {
      if ((dupError as { code?: string }).code === '23505') return ok({ ignored: 'duplikat' })
      return NextResponse.json({ error: dupError.message }, { status: 500 })
    }

    // Batas wajar: maksimal 15 perintah per menit per user
    const since = new Date(Date.now() - 60_000).toISOString()
    const { count } = await admin
      .from('wa_inbound')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('created_at', since)
    if ((count ?? 0) > RATE_LIMIT_PER_MINUTE) return ok({ ignored: 'terlalu sering' })
  }

  let reply: string | null
  try {
    reply = await handleMessage(admin, user, message)
  } catch (e) {
    reply = 'Maaf, ada kendala saat memproses perintahmu. Coba lagi sebentar lagi ya.'
    console.error('[wa-webhook]', e)
  }

  if (!reply) return ok()
  if (noReply) return ok({ reply })

  const sent = await sendWhatsApp(user.phone_number, reply)
  if (!sent.ok) console.error('[wa-webhook] gagal membalas:', sent.reason)
  return ok({ replied: sent.ok })
}

// Pemeriksaan cepat dari browser: /api/whatsapp/webhook?key=... harus menjawab ok
export async function GET(req: Request) {
  if (!process.env.WEBHOOK_SECRET) return NextResponse.json({ error: 'WEBHOOK_SECRET belum diatur' }, { status: 500 })
  if (!keyOk(req)) return NextResponse.json({ error: 'Tidak diizinkan' }, { status: 401 })
  return ok({ service: 'focusland-whatsapp-webhook' })
}
