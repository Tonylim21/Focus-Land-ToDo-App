import type { SupabaseClient } from '@supabase/supabase-js'
import type { LandItem, TownItem } from '@/types/town'

// Dunia = 3 x 3 petak lahan. Nilai ini harus sama dengan fungsi place_town_item di SQL (script 07).
export const PLOT_SIZE = 8
export const WORLD_COLS = 3
export const MAX_LANDS = 9
export const WORLD_SIZE = PLOT_SIZE * WORLD_COLS // 24
export const MAX_LAYER = 3
export const LAYER_HEIGHT = 1 // tinggi satu lantai di scene 3D

export const LAND_BASE_PRICE = 10
export const LAND_GROWTH = 1.25
export const SELL_PERCENT = 70

/** Harga lahan berikutnya jika kamu sudah punya `owned` lahan (sama dengan buy_land di SQL) */
export const landPrice = (owned: number) => Math.ceil(LAND_BASE_PRICE * Math.pow(LAND_GROWTH, owned - 1))

/** Uang yang kamu terima saat menjual item (sama dengan sell_town_item di SQL) */
export const sellPrice = (item: Pick<TownItem, 'price'>) => Math.floor((item.price * SELL_PERCENT) / 100)

/** Pojok kiri-atas petak lahan ke-i (urutan: kiri ke kanan, atas ke bawah) */
export function plotOrigin(index: number) {
  return { x: (index % WORLD_COLS) * PLOT_SIZE, z: Math.floor(index / WORLD_COLS) * PLOT_SIZE }
}

/** Ukuran area gabungan dari `count` lahan yang sudah dibeli */
export function landBounds(count: number) {
  return {
    w: Math.min(count, WORLD_COLS) * PLOT_SIZE,
    d: Math.ceil(count / WORLD_COLS) * PLOT_SIZE,
  }
}

export const CATEGORY_LABEL: Record<string, string> = {
  wall: 'Dinding',
  roof: 'Atap',
  road: 'Jalan',
  stairs: 'Tangga',
  fence: 'Pagar',
  fountain: 'Air Mancur',
  building: 'Bangunan',
  nature: 'Alam',
  props: 'Properti',
  decoration: 'Dekorasi',
}

export const modelPath = (item: TownItem) => item.asset_url || item.file_path || item.url || ''

/** Ukuran jejak item setelah diputar (rotasi ganjil menukar lebar dan kedalaman) */
export function footprint(item: Pick<TownItem, 'grid_size_x' | 'grid_size_z'>, rotation: number) {
  const odd = rotation % 2 !== 0
  return { w: odd ? item.grid_size_z : item.grid_size_x, d: odd ? item.grid_size_x : item.grid_size_z }
}

interface PlacementCheck {
  x: number
  y: number
  layer: number
  rotation: number
  item: TownItem
  placed: LandItem[]
  catalog: Record<string, TownItem>
  landCount: number
  ignoreId?: string
}

/** Validasi di browser (untuk umpan balik instan). Keputusan akhir tetap di database. */
export function isValidPlacement(p: PlacementCheck) {
  const { w, d } = footprint(p.item, p.rotation)
  if (p.x < 0 || p.y < 0 || p.x + w > WORLD_SIZE || p.y + d > WORLD_SIZE) return false

  // setiap sel harus berada di lahan yang sudah dibeli
  for (let cx = p.x; cx < p.x + w; cx++) {
    for (let cy = p.y; cy < p.y + d; cy++) {
      if (Math.floor(cy / PLOT_SIZE) * WORLD_COLS + Math.floor(cx / PLOT_SIZE) >= p.landCount) return false
    }
  }

  return !p.placed.some((o) => {
    if (o.grid_x === null || o.grid_y === null) return false
    if (String(o.id) === p.ignoreId || o.layer !== p.layer) return false
    const oi = p.catalog[String(o.item_id)]
    if (!oi) return false
    // bentrok hanya dengan item sejenis; untuk 'edge' sisinya (rotasi) juga harus sama
    if (oi.placement !== p.item.placement) return false
    if (p.item.placement === 'edge' && o.rotation !== p.rotation) return false
    const f = footprint(oi, o.rotation)
    return p.x < o.grid_x + f.w && o.grid_x < p.x + w && p.y < o.grid_y + f.d && o.grid_y < p.y + d
  })
}

/** Item yang sudah terpasang + data katalog + jumlah lahan (untuk preview di dashboard) */
export async function fetchPlaced(supabase: SupabaseClient, uid: string) {
  const { data: land } = await supabase.from('user_land').select('*').eq('user_id', uid).not('grid_x', 'is', null)
  const { data: prof } = await supabase.from('profiles').select('land_count').eq('id', uid).maybeSingle()
  const landCount = (prof as { land_count: number } | null)?.land_count ?? 1
  const rows = (land ?? []) as LandItem[]
  const ids = Array.from(new Set(rows.map((l) => l.item_id)))
  if (ids.length === 0) return { land: rows, items: [] as TownItem[], landCount }
  const { data: items } = await supabase.from('town_items').select('*').in('id', ids)
  return { land: rows, items: (items ?? []) as TownItem[], landCount }
}

/** Jumlah tugas selesai (punya subtask dan semuanya dicentang). Dipakai untuk membuka tampilan poin. */
export async function fetchCompletedTaskCount(supabase: SupabaseClient, uid: string) {
  const { data, error } = await supabase.from('tasks').select('id, subtasks(is_done)').eq('user_id', uid)
  if (error) return 0
  const rows = (data ?? []) as { subtasks: { is_done: boolean }[] }[]
  return rows.filter((t) => t.subtasks.length > 0 && t.subtasks.every((s) => s.is_done)).length
}

/** Peta sel yang boleh dilewati penduduk: lahan yang dibeli, bukan sel yang terisi bangunan/dinding */
export interface Walkable {
  grid: Uint8Array // 1 = boleh dilewati
  roads: Uint8Array // 1 = ada jalan (lebih disukai)
  cells: number[] // daftar indeks sel yang boleh dilewati
}

export function buildWalkable(placed: LandItem[], catalog: Record<string, TownItem>, landCount: number): Walkable {
  const grid = new Uint8Array(WORLD_SIZE * WORLD_SIZE)
  const roads = new Uint8Array(WORLD_SIZE * WORLD_SIZE)

  for (let y = 0; y < WORLD_SIZE; y++) {
    for (let x = 0; x < WORLD_SIZE; x++) {
      if (Math.floor(y / PLOT_SIZE) * WORLD_COLS + Math.floor(x / PLOT_SIZE) < landCount) grid[y * WORLD_SIZE + x] = 1
    }
  }

  for (const l of placed) {
    const it = catalog[String(l.item_id)]
    if (!it || l.grid_x === null || l.grid_y === null) continue
    const { w, d } = footprint(it, l.rotation)
    const gx: number = l.grid_x
    const gy: number = l.grid_y
    for (let cx = gx; cx < gx + w; cx++) {
      for (let cy = gy; cy < gy + d; cy++) {
        const i = cy * WORLD_SIZE + cx
        if (i < 0 || i >= grid.length) continue
        if (it.placement === 'ground') roads[i] = 1
        else if (l.layer === 0) grid[i] = 0 // bangunan, pohon, dinding di lantai dasar menghalangi
      }
    }
  }

  const cells: number[] = []
  for (let i = 0; i < grid.length; i++) if (grid[i]) cells.push(i)
  return { grid, roads, cells }
}
