import { createClient } from '@supabase/supabase-js'

/**
 * Client dengan hak penuh (service role) — HANYA untuk server (route handler, cron, webhook).
 * Jangan pernah diimpor dari komponen client dan jangan memakai awalan NEXT_PUBLIC_ pada kuncinya.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY belum diatur di .env.local')
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}
