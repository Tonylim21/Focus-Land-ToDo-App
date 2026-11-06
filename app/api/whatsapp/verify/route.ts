import { NextResponse } from 'next/server'
import { createHash, timingSafeEqual } from 'crypto'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'

const hashCode = (userId: string, code: string) =>
  createHash('sha256').update(`${userId}:${code}:${process.env.WA_CODE_SALT ?? ''}`).digest('hex')

// Cocokkan kode yang diketik user. Jika benar, nomor ditandai terverifikasi.
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as { code?: string }
  const code = String(body.code ?? '').trim()
  if (!/^\d{6}$/.test(code)) return NextResponse.json({ error: 'Kode harus 6 digit.' }, { status: 400 })

  const admin = createAdminClient()

  const { data: v, error: vError } = await admin.from('wa_verifications').select('*').eq('user_id', user.id).maybeSingle()
  if (vError) return NextResponse.json({ error: `Gagal membaca data verifikasi: ${vError.message}` }, { status: 500 })
  if (!v) return NextResponse.json({ error: 'Belum ada kode. Minta kode terlebih dahulu.' }, { status: 400 })

  const { data: profile, error: profileError } = await admin.from('profiles').select('phone_number').eq('id', user.id).maybeSingle()
  if (profileError) return NextResponse.json({ error: `Gagal membaca profil: ${profileError.message}` }, { status: 500 })
  if ((profile?.phone_number as string | null) !== v.phone) {
    return NextResponse.json({ error: 'Nomor berubah setelah kode dikirim. Minta kode baru.' }, { status: 400 })
  }
  if (new Date(v.expires_at as string).getTime() < Date.now()) {
    return NextResponse.json({ error: 'Kode sudah kedaluwarsa. Minta kode baru.' }, { status: 400 })
  }
  if ((v.attempts as number) >= 5) {
    return NextResponse.json({ error: 'Terlalu banyak percobaan. Minta kode baru.' }, { status: 429 })
  }

  const match = timingSafeEqual(Buffer.from(hashCode(user.id, code)), Buffer.from(v.code_hash as string))
  if (!match) {
    await admin.from('wa_verifications').update({ attempts: (v.attempts as number) + 1 }).eq('user_id', user.id)
    return NextResponse.json({ error: 'Kode salah.' }, { status: 400 })
  }

  const { error } = await admin.from('profiles').update({ wa_verified: true }).eq('id', user.id)
  if (error) {
    const taken = (error as { code?: string }).code === '23505'
    return NextResponse.json(
      { error: taken ? 'Nomor ini sudah terhubung ke akun lain.' : error.message },
      { status: taken ? 409 : 500 }
    )
  }

  await admin.from('wa_verifications').delete().eq('user_id', user.id)
  return NextResponse.json({ ok: true })
}
