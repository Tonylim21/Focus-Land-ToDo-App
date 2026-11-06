/**
 * Ubah nomor bebas ("0812-9541-0338", "+62 812 9541 0338", "8129541...") menjadi format 62xxxxxxxxxx
 * yang dipakai WhatsApp gateway. Mengembalikan null jika bukan nomor seluler Indonesia yang valid.
 */
export function normalizePhone(input: string): string | null {
  let d = input.replace(/\D/g, '')
  if (d.startsWith('0')) d = '62' + d.slice(1)
  else if (d.startsWith('8')) d = '62' + d
  return /^628\d{8,12}$/.test(d) ? d : null
}

/** 6281295410338 -> +62 812-9541-0338 (hanya untuk tampilan) */
export function formatPhone(p: string | null | undefined) {
  if (!p) return ''
  const m = p.match(/^62(\d{3})(\d{4})(\d+)$/)
  return m ? `+62 ${m[1]}-${m[2]}-${m[3]}` : p
}

/** Samarkan nomor untuk tampilan: +62 812-****-0338 */
export function maskPhone(p: string | null | undefined) {
  if (!p) return ''
  const m = p.match(/^62(\d{3})(\d+)(\d{4})$/)
  return m ? `+62 ${m[1]}-****-${m[3]}` : p
}
