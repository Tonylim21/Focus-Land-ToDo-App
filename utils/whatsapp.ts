// Pengirim WhatsApp lewat Fonnte (https://docs.fonnte.com). Hanya dipakai di server.
// Token diatur lewat env FONNTE_TOKEN (dikirim langsung di header Authorization, tanpa "Bearer").

export interface SendResult {
  ok: boolean
  reason?: string
}

export async function sendWhatsApp(target: string, message: string): Promise<SendResult> {
  const token = process.env.FONNTE_TOKEN
  if (!token) return { ok: false, reason: 'FONNTE_TOKEN belum diatur di .env.local' }

  try {
    const res = await fetch('https://api.fonnte.com/send', {
      method: 'POST',
      headers: { Authorization: token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ target, message, countryCode: '62' }),
      signal: AbortSignal.timeout(10_000),
    })
    const data = (await res.json().catch(() => ({}))) as { status?: boolean; reason?: string }
    if (!res.ok || data.status === false) {
      return { ok: false, reason: data.reason ?? `HTTP ${res.status}` }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : 'Gagal terhubung ke Fonnte' }
  }
}
