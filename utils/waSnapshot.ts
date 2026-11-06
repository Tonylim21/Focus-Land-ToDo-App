// Daftar bernomor terakhir yang dikirim ke user, supaya "DONE 2" merujuk ke tugas yang user lihat di chat.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ReminderTask } from '@/utils/waMessages'

export interface SnapshotItem {
  t: string // id tugas
  s: string[] // id subtask, urut sama dengan yang tampil di pesan
}

export interface Snapshot {
  items: SnapshotItem[]
  last_done: string[]
  updated_at: string
}

export async function saveSnapshot(admin: SupabaseClient, userId: string, ordered: ReminderTask[]) {
  const items: SnapshotItem[] = ordered.map((t) => ({ t: t.id, s: t.subtasks.map((s) => s.id) }))
  // last_done sengaja tidak ikut ditimpa supaya UNDO tetap bisa dipakai setelah LIST
  await admin.from('wa_snapshots').upsert({ user_id: userId, items, updated_at: new Date().toISOString() })
}

export async function loadSnapshot(admin: SupabaseClient, userId: string): Promise<Snapshot | null> {
  const { data, error } = await admin.from('wa_snapshots').select('items, last_done, updated_at').eq('user_id', userId).maybeSingle()
  if (error || !data) return null
  return data as unknown as Snapshot
}

export async function setLastDone(admin: SupabaseClient, userId: string, ids: string[]) {
  await admin.from('wa_snapshots').upsert({ user_id: userId, last_done: ids, updated_at: new Date().toISOString() })
}
