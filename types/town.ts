export interface TownItem {
  id: string
  name: string
  category: string
  type: string
  price: number
  file_path: string | null
  url: string | null
  asset_url: string | null
  grid_size_x: number
  grid_size_z: number
  /** cell = mengisi petak, edge = menempel di satu sisi petak, ground = alas (jalan) */
  placement: 'cell' | 'edge' | 'ground'
}

/** Satu item milik user. grid_x/grid_y null = masih di inventori. */
export interface LandItem {
  id: string | number
  user_id: string
  item_id: string
  grid_x: number | null
  grid_y: number | null
  layer: number
  rotation: number
  purchased_at: string
}
