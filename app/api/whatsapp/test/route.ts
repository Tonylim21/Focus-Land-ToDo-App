import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { sendWhatsApp } from '@/utils/whatsapp'
import { localNow } from '@/utils/waSchedule'
import { buildMorning } from '@/utils/waMessages'
import { fetchPendingTasks, splitTasks } from '@/utils/waReminders'

// Kirim contoh ringkasan hari ini ke WhatsApp user yang sedang login (tombol "Kirim pesan tes" di Pengaturan)
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 })

  const admin = createAdminClient()
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('name, phone_number, timezone, wa_verified')
    .eq('id', user.id)
    .maybeSingle()
  if (profileError) return NextResponse.json({ error: `Gagal membaca profil: ${profileError.message}` }, { status: 500 })
  if (!profile?.wa_verified || !profile.phone_number) {
    return NextResponse.json({ error: 'Verifikasi nomor WhatsApp terlebih dahulu.' }, { status: 400 })
  }

  // Jeda minimal 60 detik antar pesan tes
  const { data: last } = await admin
    .from('wa_notifications')
    .select('sent_at')
    .eq('user_id', user.id)
    .eq('kind', 'test')
    .order('sent_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (last && Date.now() - new Date(last.sent_at as string).getTime() < 60_000) {
    return NextResponse.json({ error: 'Tunggu 1 menit sebelum mengirim pesan tes lagi.' }, { status: 429 })
  }

  const tz = (profile.timezone as string | null) || 'Asia/Jakarta'
  const nowDate = new Date()
  const today = localNow(tz, nowDate).date
  const name = ((profile.name as string | null) ?? 'kamu').trim().split(/\s+/)[0] || 'kamu'

  let tasks
  try {
    tasks = await fetchPendingTasks(admin, user.id, today)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Gagal membaca tugas' }, { status: 500 })
  }
  const { active, overdue } = splitTasks(tasks, tz, nowDate.getTime())

  const message =
    active.length + overdue.length === 0
      ? `*Pesan tes FocusLand* ✅\nWhatsApp-mu sudah terhubung. Saat ini belum ada tugas aktif, jadi belum ada yang diringkas.`
      : buildMorning({ name, today, active, overdue })

  const ref = nowDate.toISOString()
  await admin.from('wa_notifications').insert({ user_id: user.id, kind: 'test', ref })
  const sent = await sendWhatsApp(profile.phone_number as string, message)
  if (!sent.ok) {
    await admin.from('wa_notifications').delete().eq('user_id', user.id).eq('kind', 'test').eq('ref', ref)
    return NextResponse.json({ error: `Gagal mengirim WhatsApp: ${sent.reason}` }, { status: 502 })
  }
  return NextResponse.json({ ok: true })
}
