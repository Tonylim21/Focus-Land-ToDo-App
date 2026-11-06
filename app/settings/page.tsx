'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import { CheckCircle2, Lock, Mail, MessageCircle, User as UserIcon } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import PageShell from '@/components/PageShell'
import { maskPhone, normalizePhone } from '@/utils/phone'

type Msg = { kind: 'ok' | 'err'; text: string } | null

const field =
  'w-full px-4 py-3 rounded-xl bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800 text-sm disabled:bg-slate-50 disabled:text-slate-400'
const btn =
  'px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold shadow-md shadow-indigo-600/25 hover:bg-indigo-700 transition disabled:opacity-50'
const btnGhost =
  'px-5 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-semibold hover:bg-slate-50 transition disabled:opacity-50'

function Banner({ msg }: { msg: Msg }) {
  if (!msg) return null
  return (
    <div
      className={`p-3 rounded-xl text-sm border ${
        msg.kind === 'ok' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-600'
      }`}
    >
      {msg.text}
    </div>
  )
}

function Section({ icon, title, desc, children }: { icon: React.ReactNode; title: string; desc?: string; children: React.ReactNode }) {
  return (
    <section className="glass-card rounded-3xl p-6 space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 shrink-0 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-600">
          {icon}
        </div>
        <div>
          <h3 className="font-bold text-slate-800">{title}</h3>
          {desc && <p className="text-xs text-slate-400 mt-0.5">{desc}</p>}
        </div>
      </div>
      {children}
    </section>
  )
}

interface ProfileRow {
  name: string | null
  phone_number: string | null
  timezone: string | null
  wa_verified?: boolean
  wa_notify?: boolean
}

export default function SettingsPage() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [savedPhone, setSavedPhone] = useState('')
  const [tz, setTz] = useState('Asia/Jakarta')
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [pass2, setPass2] = useState('')
  const [code, setCode] = useState('')
  const [codeSent, setCodeSent] = useState(false)
  const [waVerified, setWaVerified] = useState(false)
  const [waNotify, setWaNotify] = useState(true)

  const [profileMsg, setProfileMsg] = useState<Msg>(null)
  const [emailMsg, setEmailMsg] = useState<Msg>(null)
  const [passMsg, setPassMsg] = useState<Msg>(null)
  const [waMsg, setWaMsg] = useState<Msg>(null)

  useEffect(() => {
    const init = async () => {
      const { data: { user: u } } = await supabase.auth.getUser()
      if (!u) {
        router.replace('/login')
        return
      }
      const { data } = await supabase.from('profiles').select('*').eq('id', u.id).maybeSingle()
      const p = data as ProfileRow | null
      setUser(u)
      setName(p?.name ?? (u.user_metadata?.full_name as string | undefined) ?? '')
      setPhone(p?.phone_number ?? '')
      setSavedPhone(p?.phone_number ?? '')
      setTz(p?.timezone ?? 'Asia/Jakarta')
      setWaVerified(!!p?.wa_verified)
      setWaNotify(p?.wa_notify ?? true)
      setLoading(false)
    }
    init()
  }, [supabase, router])

  if (loading || !user) {
    return (
      <PageShell>
        <div className="glass-card rounded-3xl p-10 text-center text-sm text-slate-400">Memuat pengaturan...</div>
      </PageShell>
    )
  }

  // Akun yang masuk lewat Google: email dikelola Google
  const hasEmailLogin = (user.identities ?? []).some((i) => i.provider === 'email')
  const normalizedPhone = normalizePhone(phone)
  const phoneDirty = normalizedPhone !== savedPhone

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setProfileMsg(null)
    if (!name.trim()) return setProfileMsg({ kind: 'err', text: 'Nama tidak boleh kosong.' })
    if (!normalizedPhone) return setProfileMsg({ kind: 'err', text: 'Nomor WhatsApp tidak valid. Contoh: 081234567890' })

    setBusy('profile')
    const { error } = await supabase
      .from('profiles')
      .update({ name: name.trim(), phone_number: normalizedPhone, timezone: tz })
      .eq('id', user.id)
    setBusy(null)
    if (error) return setProfileMsg({ kind: 'err', text: error.message })

    const changed = normalizedPhone !== savedPhone
    setPhone(normalizedPhone)
    setSavedPhone(normalizedPhone)
    if (changed) {
      setWaVerified(false) // ganti nomor mencabut verifikasi
      setCodeSent(false)
    }
    setProfileMsg({ kind: 'ok', text: changed ? 'Profil disimpan. Nomor berubah, verifikasi ulang WhatsApp di bawah.' : 'Profil disimpan.' })
  }

  const changeEmail = async (e: React.FormEvent) => {
    e.preventDefault()
    setEmailMsg(null)
    if (!email.trim()) return
    setBusy('email')
    const { error } = await supabase.auth.updateUser(
      { email: email.trim() },
      { emailRedirectTo: `${window.location.origin}/auth/callback?next=/settings` }
    )
    setBusy(null)
    if (error) return setEmailMsg({ kind: 'err', text: error.message })
    setEmail('')
    setEmailMsg({ kind: 'ok', text: 'Permintaan dikirim. Buka email untuk konfirmasi (cek juga email lama jika diminta).' })
  }

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setPassMsg(null)
    if (pass.length < 8) return setPassMsg({ kind: 'err', text: 'Password minimal 8 karakter.' })
    if (pass !== pass2) return setPassMsg({ kind: 'err', text: 'Konfirmasi password tidak sama.' })
    setBusy('pass')
    const { error } = await supabase.auth.updateUser({ password: pass })
    setBusy(null)
    if (error) return setPassMsg({ kind: 'err', text: error.message })
    setPass('')
    setPass2('')
    setPassMsg({ kind: 'ok', text: 'Password berhasil diperbarui.' })
  }

  const callApi = async (path: string, body?: object) => {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    })
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    if (!res.ok) throw new Error(data.error ?? 'Terjadi kesalahan')
  }

  const sendCode = async () => {
    setWaMsg(null)
    setBusy('send')
    try {
      await callApi('/api/whatsapp/send-code')
      setCodeSent(true)
      setWaMsg({ kind: 'ok', text: `Kode dikirim ke WhatsApp ${maskPhone(savedPhone)}. Berlaku 10 menit.` })
    } catch (err) {
      setWaMsg({ kind: 'err', text: err instanceof Error ? err.message : 'Gagal mengirim kode' })
    }
    setBusy(null)
  }

  const verifyCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setWaMsg(null)
    setBusy('verify')
    try {
      await callApi('/api/whatsapp/verify', { code })
      setWaVerified(true)
      setCodeSent(false)
      setCode('')
      setWaMsg({ kind: 'ok', text: 'Nomor WhatsApp berhasil diverifikasi.' })
    } catch (err) {
      setWaMsg({ kind: 'err', text: err instanceof Error ? err.message : 'Verifikasi gagal' })
    }
    setBusy(null)
  }

  const sendTest = async () => {
    setWaMsg(null)
    setBusy('test')
    try {
      await callApi('/api/whatsapp/test')
      setWaMsg({ kind: 'ok', text: 'Pesan tes dikirim. Cek WhatsApp-mu.' })
    } catch (err) {
      setWaMsg({ kind: 'err', text: err instanceof Error ? err.message : 'Gagal mengirim pesan tes' })
    }
    setBusy(null)
  }

  const toggleNotify = async () => {
    setWaMsg(null)
    const next = !waNotify
    setWaNotify(next)
    const { error } = await supabase.from('profiles').update({ wa_notify: next }).eq('id', user.id)
    if (error) {
      setWaNotify(!next)
      setWaMsg({ kind: 'err', text: error.message })
    }
  }

  return (
    <PageShell>
      <div className="max-w-3xl mx-auto space-y-5">
        <header className="glass-card rounded-3xl p-6">
          <h2 className="text-xl font-bold text-slate-800">Pengaturan</h2>
          <p className="text-xs text-slate-400 mt-0.5">Kelola profil, akun, dan notifikasi WhatsApp.</p>
        </header>

        <Section icon={<UserIcon className="w-5 h-5" />} title="Profil" desc="Nama, nomor WhatsApp, dan zona waktu dipakai untuk pengingat tugas.">
          <form onSubmit={saveProfile} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Nama lengkap</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className={field} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Nomor WhatsApp</label>
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={field} placeholder="081234567890" />
              <p className="text-[11px] text-slate-400 mt-1">Disimpan dalam format 62xxxxxxxxxx. Mengganti nomor mencabut verifikasi WhatsApp.</p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Zona waktu</label>
              <select value={tz} onChange={(e) => setTz(e.target.value)} className={field}>
                <option value="Asia/Jakarta">WIB (Jakarta / Jawa / Sumatra)</option>
                <option value="Asia/Makassar">WITA (Makassar / Bali / Kalimantan)</option>
                <option value="Asia/Jayapura">WIT (Jayapura / Maluku / Papua)</option>
              </select>
              <p className="text-[11px] text-slate-400 mt-1">Menentukan pergantian hari, deadline, dan jam pengingat.</p>
            </div>
            <Banner msg={profileMsg} />
            <button type="submit" disabled={busy === 'profile'} className={btn}>
              {busy === 'profile' ? 'Menyimpan...' : 'Simpan profil'}
            </button>
          </form>
        </Section>

        <Section icon={<Mail className="w-5 h-5" />} title="Email" desc="Alamat email untuk masuk dan menerima konfirmasi.">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Email saat ini</label>
            <input value={user.email ?? ''} disabled className={field} />
          </div>
          {hasEmailLogin ? (
            <form onSubmit={changeEmail} className="space-y-3">
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email baru" className={field} />
              <Banner msg={emailMsg} />
              <button type="submit" disabled={busy === 'email' || !email.trim()} className={btn}>
                {busy === 'email' ? 'Mengirim...' : 'Ubah email'}
              </button>
            </form>
          ) : (
            <p className="text-xs text-slate-500 bg-slate-50 rounded-xl px-3 py-2.5">
              Akun ini masuk lewat Google, jadi alamat emailnya dikelola oleh akun Google-mu.
            </p>
          )}
        </Section>

        <Section icon={<Lock className="w-5 h-5" />} title="Password" desc="Minimal 8 karakter.">
          <form onSubmit={changePassword} className="space-y-3">
            <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="Password baru" autoComplete="new-password" className={field} />
            <input type="password" value={pass2} onChange={(e) => setPass2(e.target.value)} placeholder="Ulangi password baru" autoComplete="new-password" className={field} />
            <Banner msg={passMsg} />
            <button type="submit" disabled={busy === 'pass' || !pass} className={btn}>
              {busy === 'pass' ? 'Menyimpan...' : 'Ubah password'}
            </button>
          </form>
        </Section>

        <Section icon={<MessageCircle className="w-5 h-5" />} title="Notifikasi WhatsApp" desc="Verifikasi nomor agar FocusLand boleh mengirim pengingat dan menerima perintah lewat WhatsApp.">
          {!savedPhone || !normalizePhone(savedPhone) ? (
            <p className="text-xs text-slate-500 bg-slate-50 rounded-xl px-3 py-2.5">Simpan nomor WhatsApp yang valid di bagian Profil terlebih dahulu.</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm font-semibold text-slate-700">{maskPhone(savedPhone)}</span>
                {waVerified ? (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Terverifikasi
                  </span>
                ) : (
                  <span className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-1">Belum terverifikasi</span>
                )}
              </div>

              {phoneDirty && <p className="text-xs text-amber-600">Ada perubahan nomor yang belum disimpan. Simpan profil dulu.</p>}

              {!waVerified && (
                <div className="space-y-3">
                  <button onClick={sendCode} disabled={busy === 'send' || phoneDirty} className={btnGhost}>
                    {busy === 'send' ? 'Mengirim...' : codeSent ? 'Kirim ulang kode' : 'Kirim kode verifikasi'}
                  </button>
                  {codeSent && (
                    <form onSubmit={verifyCode} className="flex gap-2">
                      <input
                        value={code}
                        onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        inputMode="numeric"
                        placeholder="Kode 6 digit"
                        className={`${field} max-w-[11rem] tracking-widest`}
                      />
                      <button type="submit" disabled={busy === 'verify' || code.length !== 6} className={btn}>
                        {busy === 'verify' ? 'Memeriksa...' : 'Verifikasi'}
                      </button>
                    </form>
                  )}
                </div>
              )}

              {waVerified && (
                <button onClick={sendTest} disabled={busy === 'test'} className={btnGhost}>
                  {busy === 'test' ? 'Mengirim...' : 'Kirim pesan tes'}
                </button>
              )}

              {waVerified && (
                <label className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-4 py-3 cursor-pointer">
                  <span>
                    <span className="block text-sm font-semibold text-slate-700">Kirim pengingat ke WhatsApp</span>
                    <span className="block text-[11px] text-slate-400">Ringkasan pagi, peringatan deadline, dan pengingat malam.</span>
                  </span>
                  <input type="checkbox" checked={waNotify} onChange={toggleNotify} className="w-5 h-5 accent-indigo-600" />
                </label>
              )}

              <Banner msg={waMsg} />
            </>
          )}
        </Section>
      </div>
    </PageShell>
  )
}
