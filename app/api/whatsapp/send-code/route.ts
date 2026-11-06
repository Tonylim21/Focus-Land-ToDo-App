import { NextResponse } from 'next/server'
import { createHash, randomInt } from 'crypto'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { sendWhatsApp } from '@/utils/whatsapp'

const hashCode = (userId: string, code: string) =>
  createHash('sha256').update(`${userId}:${code}:${process.env.WA_CODE_SALT ?? ''}`).digest('hex')

// Minta kode verifikasi: kode dikirim ke WhatsApp nomor yang tersimpan di profil
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 })

  const admin = createAdminClient()

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('phone_number, wa_verified')
    .eq('id', user.id)
    .maybeSingle()
  if (profileError) {
    // Biasanya: script 10_whatsapp.sql belum dijalankan, atau SUPABASE_SERVICE_ROLE_KEY salah
    return NextResponse.json({ error: `Gagal membaca profil: ${profileError.message}` }, { status: 500 })
  }
  const phone = (profile?.phone_number as string | null) ?? null
  if (!phone) return NextResponse.json({ error: 'Isi nomor WhatsApp di profil terlebih dahulu.' }, { status: 400 })
  if (!/^628\d{8,12}$/.test(phone)) {
    return NextResponse.json({ error: 'Format nomor belum sesuai. Simpan ulang nomor di bagian Profil.' }, { status: 400 })
  }
  if (profile?.wa_verified) return NextResponse.json({ error: 'Nomor ini sudah terverifikasi.' }, { status: 400 })

  // Jeda minimal 60 detik antar permintaan (cegah spam ke nomor orang lain)
  const { data: prev, error: prevError } = await admin.from('wa_verifications').select('sent_at').eq('user_id', user.id).maybeSingle()
  if (prevError) return NextResponse.json({ error: `Gagal membaca data verifikasi: ${prevError.message}` }, { status: 500 })
  if (prev && Date.now() - new Date(prev.sent_at as string).getTime() < 60_000) {
    return NextResponse.json({ error: 'Tunggu 1 menit sebelum meminta kode lagi.' }, { status: 429 })
  }

  const { data: taken, error: takenError } = await admin
    .from('profiles')
    .select('id')
    .eq('phone_number', phone)
    .eq('wa_verified', true)
    .neq('id', user.id)
    .maybeSingle()
  if (takenError) return NextResponse.json({ error: takenError.message }, { status: 500 })
  if (taken) return NextResponse.json({ error: 'Nomor ini sudah terhubung ke akun lain.' }, { status: 409 })

  const code = String(randomInt(100000, 1000000))
  const { error: saveError } = await admin.from('wa_verifications').upsert({
    user_id: user.id,
    phone,
    code_hash: hashCode(user.id, code),
    expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
    sent_at: new Date().toISOString(),
    attempts: 0,
  })
  if (saveError) return NextResponse.json({ error: saveError.message }, { status: 500 })

  const sent = await sendWhatsApp(
    phone,
    `*FocusLand*\nKode verifikasi WhatsApp kamu: *${code}*\nBerlaku 10 menit. Jangan berikan kode ini kepada siapa pun.`
  )
  if (!sent.ok) return NextResponse.json({ error: `Gagal mengirim WhatsApp: ${sent.reason}` }, { status: 502 })

  return NextResponse.json({ ok: true })
}
