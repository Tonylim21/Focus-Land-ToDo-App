'use client'

import { useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { normalizePhone } from '@/utils/phone'

interface OnboardingModalProps {
  userId: string
  initialName?: string
  onComplete: () => void | Promise<void>
}

export default function OnboardingModal({ userId, initialName = '', onComplete }: OnboardingModalProps) {
  const [name, setName] = useState(initialName)
  const [phone, setPhone] = useState('')
  const [timezone, setTimezone] = useState('Asia/Jakarta')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const supabase = createClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setErrorMsg('')

    const normalized = normalizePhone(phone)
    if (!normalized) {
      setErrorMsg('Nomor WhatsApp tidak valid. Contoh: 081234567890')
      setLoading(false)
      return
    }

    // upsert: tetap berhasil walau trigger belum sempat membuat baris profil
    const { error } = await supabase.from('profiles').upsert({
      id: userId,
      name,
      phone_number: normalized,
      timezone,
    })

    if (error) {
      setErrorMsg(error.message)
      setLoading(false)
      return
    }
    await onComplete()
    setLoading(false)
  }

  const input =
    'w-full px-4 py-3 rounded-xl bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800 transition text-sm'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-md p-8 rounded-3xl bg-white/90 backdrop-blur-md border border-white/60 shadow-2xl shadow-indigo-500/20">
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent">
            Lengkapi Profilmu
          </h2>
          <p className="text-slate-500 text-sm mt-1">
            Isi data berikut untuk mengaktifkan fitur notifikasi WhatsApp & kalender.
          </p>
        </div>

        {errorMsg && (
          <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 text-sm text-center">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Nama Lengkap</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} required className={input} placeholder="Contoh: Budi Santoso" />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Nomor WhatsApp</label>
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required className={input} placeholder="081234567890" />
            <p className="text-[11px] text-slate-400 mt-1">*Digunakan untuk pengiriman notifikasi pengingat tugas.</p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Zona Waktu / Domisili</label>
            <select value={timezone} onChange={(e) => setTimezone(e.target.value)} className={input}>
              <option value="Asia/Jakarta">WIB (Jakarta / Jawa / Sumatra)</option>
              <option value="Asia/Makassar">WITA (Makassar / Bali / Kalimantan)</option>
              <option value="Asia/Jayapura">WIT (Jayapura / Maluku / Papua)</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 mt-2 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white font-semibold shadow-lg shadow-indigo-500/20 hover:opacity-95 transition disabled:opacity-50"
          >
            {loading ? 'Menyimpan...' : 'Simpan & Lanjutkan'}
          </button>
        </form>
      </div>
    </div>
  )
}
