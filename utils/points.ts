import type { Priority } from '@/types'

// Nilai poin sengaja tidak ditampilkan ke user. Poin & penalti dihitung di database.
export const PRIORITY_META: Record<Priority, { label: string; cls: string }> = {
  high: { label: 'Tinggi', cls: 'bg-rose-50 text-rose-600 border-rose-200' },
  medium: { label: 'Sedang', cls: 'bg-amber-50 text-amber-600 border-amber-200' },
  low: { label: 'Rendah', cls: 'bg-emerald-50 text-emerald-600 border-emerald-200' },
}
