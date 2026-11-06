'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Coins, Crosshair, Eye, Lock, Package, Plus, RotateCcw, RotateCw, Search, ShoppingBag, X } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import PageShell from '@/components/PageShell'
import Sidebar from '@/components/Sidebar'
import ConfirmDialog from '@/components/ConfirmDialog'
import type { CameraApi, Cursor } from '@/components/town/TownScene'
import type { LandItem, TownItem } from '@/types/town'
import { CATEGORY_LABEL, MAX_LANDS, MAX_LAYER, fetchCompletedTaskCount, footprint, landPrice, modelPath, sellPrice } from '@/utils/town'

const TownScene = dynamic(() => import('@/components/town/TownScene'), {
  ssr: false,
  loading: () => <div className="w-full h-full flex items-center justify-center text-sm text-white/80">Memuat dunia 3D...</div>,
})
const ItemPreview = dynamic(() => import('@/components/town/ItemPreview'), { ssr: false, loading: () => null })

// Kaca transparan: latar hampir bening dengan blur
const glass = 'bg-white/25 backdrop-blur-xl border border-white/40 shadow-2xl shadow-black/10'

const isMobile = () => typeof window !== 'undefined' && window.innerWidth < 1024

const mmss = (total: number) => `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`

function IconBtn({ onClick, label, disabled, children }: { onClick: () => void; label: string; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="p-2 rounded-lg bg-white/60 border border-white/60 text-slate-700 hover:bg-white/90 transition disabled:opacity-40"
    >
      {children}
    </button>
  )
}

// Tombol panah kamera: tahan untuk terus menggeser
function PadButton({ onStep, label, children }: { onStep: () => void; label: string; children: React.ReactNode }) {
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  const stop = () => {
    if (timer.current) {
      clearInterval(timer.current)
      timer.current = null
    }
  }
  useEffect(() => stop, [])
  return (
    <button
      aria-label={label}
      title={label}
      onPointerDown={(e) => {
        e.preventDefault()
        onStep()
        stop()
        timer.current = setInterval(onStep, 70)
      }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      className="w-9 h-9 flex items-center justify-center rounded-lg bg-white/60 border border-white/60 text-slate-700 hover:bg-white/90 active:bg-white transition touch-none select-none"
    >
      {children}
    </button>
  )
}

export default function TownPage() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [catalog, setCatalog] = useState<TownItem[]>([])
  const [land, setLand] = useState<LandItem[]>([])
  const [points, setPoints] = useState(0)
  const [landCount, setLandCount] = useState(1)
  const [unlocked, setUnlocked] = useState(false) // poin baru terlihat setelah 1 tugas selesai

  const [stockIds, setStockIds] = useState<Set<string> | null>(null)
  const [restockAt, setRestockAt] = useState(0)
  const [now, setNow] = useState(0)

  const [panelOpen, setPanelOpen] = useState(false)
  const [tab, setTab] = useState<'shop' | 'inventory'>('shop')
  const [category, setCategory] = useState('all')
  const [query, setQuery] = useState('')
  const [preview, setPreview] = useState<TownItem | null>(null)
  const [cursor, setCursor] = useState<Cursor | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [errMsg, setErrMsg] = useState('')
  const [sellTarget, setSellTarget] = useState<LandItem | null>(null)
  const [previewModal, setPreviewModal] = useState<TownItem | null>(null) // pratinjau layar sentuh
  const camApi = useRef<CameraApi | null>(null)
  const markerRef = useRef<HTMLButtonElement | null>(null)

  const catalogMap = useMemo(() => Object.fromEntries(catalog.map((i) => [String(i.id), i])) as Record<string, TownItem>, [catalog])
  const placed = useMemo(() => land.filter((l) => l.grid_x !== null && l.grid_y !== null), [land])
  const inventory = useMemo(() => land.filter((l) => l.grid_x === null || l.grid_y === null), [land])
  const categories = useMemo(() => Array.from(new Set(catalog.map((i) => i.category))).sort(), [catalog])

  const reloadLand = useCallback(
    async (uid: string) => {
      const { data } = await supabase.from('user_land').select('*').eq('user_id', uid).order('purchased_at', { ascending: true })
      setLand((data ?? []) as LandItem[])
    },
    [supabase]
  )

  const reloadProfile = useCallback(
    async (uid: string) => {
      const { data } = await supabase.from('profiles').select('points, land_count').eq('id', uid).maybeSingle()
      const p = data as { points: number; land_count: number } | null
      setPoints(p?.points ?? 0)
      setLandCount(p?.land_count ?? 1)
    },
    [supabase]
  )

  // Stok toko berganti tiap jam (ditentukan database)
  const loadStock = useCallback(async () => {
    const { data, error } = await supabase.rpc('get_shop_stock')
    if (error) {
      setErrMsg(error.message)
      return
    }
    const d = data as { ids: string[]; seconds: number }
    setStockIds(new Set(d.ids))
    setRestockAt(Date.now() + d.seconds * 1000)
  }, [supabase])

  useEffect(() => {
    const init = async () => {
      const { data: { user: u } } = await supabase.auth.getUser()
      if (!u) {
        router.replace('/login')
        return
      }
      const { data: items, error } = await supabase.from('town_items').select('*').order('price', { ascending: true })
      if (error) setErrMsg(error.message)
      setCatalog((items ?? []) as TownItem[])
      const [count] = await Promise.all([fetchCompletedTaskCount(supabase, u.id), reloadLand(u.id), reloadProfile(u.id), loadStock()])
      setUnlocked(count >= 1)
      setUser(u)
      setLoading(false)
      if (!isMobile()) setPanelOpen(true) // di desktop toko langsung terbuka
    }
    init()
  }, [supabase, router, reloadLand, reloadProfile, loadStock])

  // Detak 1 detik untuk hitung mundur restock
  useEffect(() => {
    setNow(Date.now())
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  // Saat waktu restock tiba, ambil stok baru
  useEffect(() => {
    if (restockAt && now >= restockAt) {
      setRestockAt(0)
      loadStock()
    }
  }, [now, restockAt, loadStock])

  // Di layar kecil, tutup toko saat sedang memasang/memilih item supaya lahan terlihat
  useEffect(() => {
    if ((cursor || selectedId) && isMobile()) setPanelOpen(false)
  }, [cursor, selectedId])

  useEffect(() => {
    if (!panelOpen) setPreview(null)
  }, [panelOpen])

  // Pintasan keyboard: R = putar item yang dipegang, Esc = batal
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (document.querySelector('[role="dialog"]')) return // jangan bereaksi saat dialog terbuka
      const k = e.key.toLowerCase()
      if (k === 'arrowup' || k === 'w') {
        e.preventDefault()
        camApi.current?.pan(0.8, 0)
      } else if (k === 'arrowdown' || k === 's') {
        e.preventDefault()
        camApi.current?.pan(-0.8, 0)
      } else if (k === 'arrowleft' || k === 'a') {
        e.preventDefault()
        camApi.current?.pan(0, -0.8)
      } else if (k === 'arrowright' || k === 'd') {
        e.preventDefault()
        camApi.current?.pan(0, 0.8)
      }
      if (e.key === 'Escape') {
        setCursor(null)
        setSelectedId(null)
      }
      if ((e.key === 'r' || e.key === 'R') && cursor) setCursor({ ...cursor, rotation: (cursor.rotation + 1) % 4 })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cursor])

  const secondsLeft = restockAt && now ? Math.max(0, Math.ceil((restockAt - now) / 1000)) : 0

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return catalog.filter(
      (i) =>
        (!stockIds || stockIds.has(String(i.id))) &&
        (category === 'all' || i.category === category) &&
        (!q || i.name.toLowerCase().includes(q))
    )
  }, [catalog, stockIds, category, query])

  const ownedCount = (itemId: string) => land.filter((l) => l.item_id === itemId).length

  if (loading || !user) {
    return (
      <PageShell>
        <div className="glass-card rounded-3xl p-10 text-center text-sm text-slate-400">Memuat My Town...</div>
      </PageShell>
    )
  }

  const selectedLand = land.find((l) => String(l.id) === selectedId) ?? null
  const selectedItem = selectedLand ? catalogMap[String(selectedLand.item_id)] : null
  const sellItem = sellTarget ? catalogMap[String(sellTarget.item_id)] : null
  const nextLandPrice = landPrice(landCount)
  const canAffordLand = !unlocked || points >= nextLandPrice

  // Desktop: pratinjau melayang di samping panel. Layar kecil: modal di tengah layar.
  const togglePreview = (item: TownItem) => {
    if (isMobile()) setPreviewModal(item)
    else setPreview((p) => (p?.id === item.id ? null : item))
  }
  const hoverPreview = (e: React.PointerEvent, item: TownItem | null) => {
    if (e.pointerType === 'mouse') setPreview(item)
  }

  // ---- Aksi (semua perubahan data lewat fungsi database) ----
  const rpcPlace = async (landId: string, x: number | null, y: number | null, layer: number, rotation: number) => {
    setBusy(true)
    setErrMsg('')
    const { error } = await supabase.rpc('place_town_item', { p_land_id: landId, p_x: x, p_y: y, p_layer: layer, p_rotation: rotation })
    if (error) setErrMsg(error.message)
    else await reloadLand(user.id)
    setBusy(false)
    return !error
  }

  const buy = async (item: TownItem) => {
    setBusy(true)
    setErrMsg('')
    const { data, error } = await supabase.rpc('buy_town_item', { p_item_id: item.id })
    if (error) {
      setErrMsg(error.message)
      setBusy(false)
      return
    }
    await Promise.all([reloadLand(user.id), reloadProfile(user.id)])
    setBusy(false)
    setSelectedId(null)
    setPreview(null)
    setCursor({ landId: String(data), item, rotation: 0, layer: 0 }) // langsung siap dipasang
  }

  const buyLand = async () => {
    setBusy(true)
    setErrMsg('')
    const { error } = await supabase.rpc('buy_land')
    if (error) setErrMsg(error.message)
    else await reloadProfile(user.id)
    setBusy(false)
  }

  const confirmSell = async () => {
    const l = sellTarget
    if (!l) return
    setBusy(true)
    setErrMsg('')
    const { error } = await supabase.rpc('sell_town_item', { p_land_id: String(l.id) })
    if (error) setErrMsg(error.message)
    else {
      await Promise.all([reloadLand(user.id), reloadProfile(user.id)])
      if (selectedId === String(l.id)) setSelectedId(null)
      if (cursor?.landId === String(l.id)) setCursor(null)
    }
    setBusy(false)
    setSellTarget(null)
  }

  const handlePlace = async (x: number, y: number) => {
    if (!cursor || busy) return
    const ok = await rpcPlace(cursor.landId, x, y, cursor.layer, cursor.rotation)
    if (ok) {
      setSelectedId(cursor.landId)
      setCursor(null)
    }
  }

  const armFromInventory = (l: LandItem) => {
    const item = catalogMap[String(l.item_id)]
    if (!item) return
    setSelectedId(null)
    setPreview(null)
    setCursor({ landId: String(l.id), item, rotation: 0, layer: 0 })
  }

  const startMove = () => {
    if (!selectedLand || !selectedItem) return
    setCursor({ landId: String(selectedLand.id), item: selectedItem, rotation: selectedLand.rotation, layer: selectedLand.layer })
  }

  const rotateSelected = (dir: 1 | -1) => {
    if (!selectedLand || selectedLand.grid_x === null || selectedLand.grid_y === null) return
    rpcPlace(String(selectedLand.id), selectedLand.grid_x, selectedLand.grid_y, selectedLand.layer, (selectedLand.rotation + dir + 4) % 4)
  }

  const layerSelected = (dir: 1 | -1) => {
    if (!selectedLand || selectedLand.grid_x === null || selectedLand.grid_y === null) return
    const next = Math.min(MAX_LAYER, Math.max(0, selectedLand.layer + dir))
    if (next !== selectedLand.layer) rpcPlace(String(selectedLand.id), selectedLand.grid_x, selectedLand.grid_y, next, selectedLand.rotation)
  }

  const storeSelected = async () => {
    if (!selectedLand) return
    if (await rpcPlace(String(selectedLand.id), null, null, 0, 0)) setSelectedId(null)
  }

  const showToolbar = !!cursor || (!!selectedLand && !!selectedItem)

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-slate-900">
      <Sidebar variant="overlay" />

      <main className="absolute inset-0 overflow-hidden">
        {/* Dunia 3D memenuhi layar */}
        <div className="absolute inset-0">
          <TownScene
            interactive
            catalog={catalogMap}
            placed={placed}
            landCount={landCount}
            selectedId={selectedId}
            cursor={cursor}
            apiRef={camApi}
            markerRef={markerRef}
            onSelect={setSelectedId}
            onPlace={handlePlace}
          />

          {/* Tombol (+) lahan berikutnya: posisinya mengikuti petak di dunia 3D */}
          {landCount < MAX_LANDS && (
            <button
              ref={markerRef}
              onClick={buyLand}
              disabled={busy}
              style={{ display: 'none' }}
              className="absolute z-10 -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 px-3 py-2 rounded-full bg-amber-400/90 hover:bg-amber-400 text-amber-950 text-xs font-bold shadow-lg border border-white/70 backdrop-blur whitespace-nowrap disabled:opacity-60"
            >
              <Plus className="w-3.5 h-3.5" /> Lahan <Coins className="w-3.5 h-3.5" /> {nextLandPrice}
            </button>
          )}
        </div>

        {/* Bar atas */}
        <div className="absolute z-20 top-4 left-4 right-4 md:left-[4.75rem] flex items-start justify-between gap-3 pointer-events-none">
          <div className={`${glass} pointer-events-auto rounded-2xl px-4 py-2.5 flex flex-wrap items-center gap-3`}>
            <div>
              <h2 className="text-base font-bold text-slate-900 leading-tight">My Town</h2>
              <p className="text-[11px] text-slate-700">Lahan {landCount}/{MAX_LANDS}</p>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-400/40 border border-amber-300/60 text-amber-900">
              <Coins className="w-4 h-4" />
              {unlocked ? (
                <span className="text-sm font-bold">{points}</span>
              ) : (
                <span className="flex items-center gap-1 text-sm font-bold text-slate-600">
                  <Lock className="w-3.5 h-3.5" /> ???
                </span>
              )}
            </div>
            {landCount < MAX_LANDS && (
              <button
                onClick={buyLand}
                disabled={busy || !canAffordLand}
                title="Beli lahan berikutnya"
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white/60 border border-white/60 text-xs font-bold text-slate-800 hover:bg-white/90 transition disabled:opacity-40"
              >
                <Plus className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Lahan</span> <Coins className="w-3.5 h-3.5 text-amber-600" /> {nextLandPrice}
              </button>
            )}
          </div>

          <button
            onClick={() => setPanelOpen((o) => !o)}
            className={`${glass} pointer-events-auto rounded-2xl px-4 py-2.5 flex items-center gap-2 text-sm font-semibold text-slate-900 hover:bg-white/40 transition`}
          >
            {panelOpen ? <X className="w-4 h-4" /> : <ShoppingBag className="w-4 h-4" />}
            {panelOpen ? 'Tutup' : 'Toko'}
          </button>
        </div>

        {errMsg && (
          <div className="absolute z-40 top-20 left-1/2 -translate-x-1/2 w-[min(92%,520px)] rounded-2xl bg-red-50/90 backdrop-blur border border-red-200 text-red-700 text-sm px-4 py-3 flex justify-between gap-3 shadow-lg">
            <span>{errMsg}</span>
            <button onClick={() => setErrMsg('')} className="font-semibold shrink-0">Tutup</button>
          </div>
        )}

        {/* Toolbar: item yang dipegang atau dipilih */}
        {showToolbar && (
          <div className={`${glass} absolute z-20 left-3 right-3 bottom-24 lg:left-4 lg:right-auto lg:bottom-4 lg:max-w-[580px] rounded-2xl px-4 py-3 space-y-2.5`}>
            {cursor ? (
              <>
                <div>
                  <p className="text-sm font-bold text-slate-900">Memasang: {cursor.item.name}</p>
                  <p className="text-[11px] text-slate-700">{cursor.item.placement === 'edge' ? 'Dinding menempel di satu sisi petak. Tekan R untuk memilih sisinya, lalu klik untuk menaruh.' : 'Gerakkan kursor di lahan, klik untuk menaruh. R = putar, Esc = batal.'}</p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <IconBtn label="Putar kiri" onClick={() => setCursor({ ...cursor, rotation: (cursor.rotation + 3) % 4 })}><RotateCcw className="w-4 h-4" /></IconBtn>
                  <IconBtn label="Putar kanan" onClick={() => setCursor({ ...cursor, rotation: (cursor.rotation + 1) % 4 })}><RotateCw className="w-4 h-4" /></IconBtn>
                  <IconBtn label="Lantai turun" disabled={cursor.layer <= 0} onClick={() => setCursor({ ...cursor, layer: cursor.layer - 1 })}><ChevronDown className="w-4 h-4" /></IconBtn>
                  <span className="text-xs font-semibold text-slate-800 px-1">Lt {cursor.layer + 1}</span>
                  <IconBtn label="Lantai naik" disabled={cursor.layer >= MAX_LAYER} onClick={() => setCursor({ ...cursor, layer: cursor.layer + 1 })}><ChevronUp className="w-4 h-4" /></IconBtn>
                  <button onClick={() => setCursor(null)} className="ml-auto px-3 py-2 rounded-lg bg-white/60 border border-white/60 text-xs font-semibold text-slate-700 hover:bg-white/90 transition">Batal</button>
                </div>
              </>
            ) : (
              selectedLand &&
              selectedItem && (
                <>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-bold text-slate-900">{selectedItem.name}</p>
                      <p className="text-[11px] text-slate-700">
                        Petak ({(selectedLand.grid_x ?? 0) + 1}, {(selectedLand.grid_y ?? 0) + 1}) · Lantai {selectedLand.layer + 1}
                      </p>
                    </div>
                    <button onClick={() => setSelectedId(null)} aria-label="Tutup" className="p-1 text-slate-700 hover:text-slate-900"><X className="w-4 h-4" /></button>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <IconBtn label="Putar kiri" disabled={busy} onClick={() => rotateSelected(-1)}><RotateCcw className="w-4 h-4" /></IconBtn>
                    <IconBtn label="Putar kanan" disabled={busy} onClick={() => rotateSelected(1)}><RotateCw className="w-4 h-4" /></IconBtn>
                    <IconBtn label="Naik satu lantai" disabled={busy || selectedLand.layer >= MAX_LAYER} onClick={() => layerSelected(1)}><ChevronUp className="w-4 h-4" /></IconBtn>
                    <IconBtn label="Turun satu lantai" disabled={busy || selectedLand.layer <= 0} onClick={() => layerSelected(-1)}><ChevronDown className="w-4 h-4" /></IconBtn>
                    <button onClick={startMove} disabled={busy} className="ml-auto px-3 py-2 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition disabled:opacity-50">Pindahkan</button>
                    <button onClick={storeSelected} disabled={busy} className="px-3 py-2 rounded-lg bg-white/60 border border-white/60 text-xs font-semibold text-slate-700 hover:bg-white/90 transition disabled:opacity-50">Simpan</button>
                    <button onClick={() => setSellTarget(selectedLand)} disabled={busy} className="flex items-center gap-1 px-3 py-2 rounded-lg bg-rose-500/90 text-white text-xs font-semibold hover:bg-rose-600 transition disabled:opacity-50">
                      Jual <Coins className="w-3.5 h-3.5" /> {sellPrice(selectedItem)}
                    </button>
                  </div>
                </>
              )
            )}
          </div>
        )}

        {!showToolbar && (
          <p className="hidden lg:block absolute z-10 bottom-4 left-4 text-[11px] text-white/90 drop-shadow">
            Seret: putar · klik kanan / dua jari / tombol panah / WASD: geser · scroll: zoom · klik bangunan untuk memilih
          </p>
        )}

        {/* Tombol geser kamera */}
        <div
          className={`${glass} absolute z-20 rounded-2xl p-1.5 grid grid-cols-3 gap-1 right-3 lg:bottom-4 ${
            panelOpen ? 'lg:right-[392px]' : 'lg:right-4'
          } ${showToolbar ? 'max-lg:bottom-48' : 'max-lg:bottom-24'}`}
        >
          <span />
          <PadButton label="Geser maju" onStep={() => camApi.current?.pan(0.35, 0)}><ChevronUp className="w-4 h-4" /></PadButton>
          <span />
          <PadButton label="Geser kiri" onStep={() => camApi.current?.pan(0, -0.35)}><ChevronLeft className="w-4 h-4" /></PadButton>
          <button onClick={() => camApi.current?.reset()} aria-label="Pusatkan kamera" title="Pusatkan kamera" className="w-9 h-9 flex items-center justify-center rounded-lg bg-white/60 border border-white/60 text-slate-700 hover:bg-white/90 transition">
            <Crosshair className="w-4 h-4" />
          </button>
          <PadButton label="Geser kanan" onStep={() => camApi.current?.pan(0, 0.35)}><ChevronRight className="w-4 h-4" /></PadButton>
          <span />
          <PadButton label="Geser mundur" onStep={() => camApi.current?.pan(-0.35, 0)}><ChevronDown className="w-4 h-4" /></PadButton>
          <span />
        </div>

        {/* Pratinjau 3D berputar saat item toko di-hover (atau tombol mata ditekan di layar sentuh) */}
        {preview && panelOpen && (
          <div className={`${glass} hidden lg:block absolute z-30 rounded-3xl p-3 w-56 pointer-events-none lg:top-24 lg:right-[392px]`}>
            <div className="h-44 rounded-2xl bg-gradient-to-b from-white/50 to-white/10 overflow-hidden">
              <ItemPreview path={modelPath(preview)} />
            </div>
            <p className="mt-2 text-sm font-bold text-slate-900 truncate">{preview.name}</p>
            <p className="text-[11px] text-slate-700">
              {CATEGORY_LABEL[preview.category] ?? preview.category} · {footprint(preview, 0).w}×{footprint(preview, 0).d}
            </p>
          </div>
        )}

        {/* Toko & inventori: panel kaca melayang */}
        <aside
          aria-hidden={!panelOpen}
          className={`${glass} absolute z-30 rounded-3xl p-4 flex flex-col gap-3 transition-transform duration-300
            lg:top-20 lg:right-4 lg:bottom-4 lg:w-[360px]
            max-lg:left-3 max-lg:right-3 max-lg:bottom-24 max-lg:max-h-[58vh]
            ${panelOpen ? 'translate-x-0 translate-y-0' : 'lg:translate-x-[115%] max-lg:translate-y-[140%]'}`}
        >
          <div className="flex gap-1 p-1 rounded-xl bg-white/30">
            <button onClick={() => setTab('shop')} className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition ${tab === 'shop' ? 'bg-white/80 text-indigo-700 shadow-sm' : 'text-slate-800'}`}>
              <ShoppingBag className="w-4 h-4" /> Toko
            </button>
            <button onClick={() => setTab('inventory')} className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition ${tab === 'inventory' ? 'bg-white/80 text-indigo-700 shadow-sm' : 'text-slate-800'}`}>
              <Package className="w-4 h-4" /> Inventori ({inventory.length})
            </button>
          </div>

          {tab === 'shop' ? (
            <>
              <div className="flex items-center justify-between text-[11px] font-semibold text-slate-800 px-1">
                <span>{filtered.length} item tersedia</span>
                {secondsLeft > 0 && <span>Restock dalam {mmss(secondsLeft)}</span>}
              </div>
              <div className="relative">
                <Search className="w-4 h-4 text-slate-600 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Cari item..."
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-white/60 border border-white/60 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm text-slate-900"
                />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {['all', ...categories].map((c) => (
                  <button
                    key={c}
                    onClick={() => setCategory(c)}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition ${
                      category === c ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white/50 text-slate-800 border-white/60 hover:bg-white/80'
                    }`}
                  >
                    {c === 'all' ? 'Semua' : CATEGORY_LABEL[c] ?? c}
                  </button>
                ))}
              </div>

              <ul className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1">
                {filtered.map((i) => {
                  const { w, d } = footprint(i, 0)
                  const tooPricey = unlocked && points < i.price
                  const owned = ownedCount(i.id)
                  return (
                    <li
                      key={i.id}
                      onPointerEnter={(e) => hoverPreview(e, i)}
                      onPointerLeave={(e) => hoverPreview(e, null)}
                      className="flex items-center gap-2 rounded-xl bg-white/50 border border-white/60 px-3 py-2.5 list-none"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-900 truncate">{i.name}</p>
                        <p className="text-[11px] text-slate-700">
                          {CATEGORY_LABEL[i.category] ?? i.category} · {w}×{d}
                          {owned > 0 ? ` · dimiliki ${owned}` : ''}
                        </p>
                      </div>
                      <button onClick={() => togglePreview(i)} aria-label="Lihat 3D" title="Lihat 3D" className="shrink-0 p-1.5 rounded-lg text-slate-700 hover:bg-white/70 transition">
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => buy(i)}
                        disabled={busy || tooPricey}
                        title={tooPricey ? 'Poin belum cukup' : 'Beli'}
                        className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-500 text-white text-xs font-bold hover:bg-amber-600 transition disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Coins className="w-3.5 h-3.5" /> {i.price}
                      </button>
                    </li>
                  )
                })}
                {filtered.length === 0 && <li className="text-sm text-slate-700 text-center py-6 list-none">Tidak ada item yang cocok. Coba lagi setelah restock.</li>}
              </ul>
            </>
          ) : (
            <ul className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1">
              {inventory.map((l) => {
                const item = catalogMap[String(l.item_id)]
                if (!item) return null
                return (
                  <li
                    key={String(l.id)}
                    onPointerEnter={(e) => hoverPreview(e, item)}
                    onPointerLeave={(e) => hoverPreview(e, null)}
                    className="flex items-center gap-2 rounded-xl bg-white/50 border border-white/60 px-3 py-2.5 list-none"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">{item.name}</p>
                      <p className="text-[11px] text-slate-700">{CATEGORY_LABEL[item.category] ?? item.category}</p>
                    </div>
                    <button onClick={() => togglePreview(item)} aria-label="Lihat 3D" title="Lihat 3D" className="shrink-0 p-1.5 rounded-lg text-slate-700 hover:bg-white/70 transition">
                      <Eye className="w-4 h-4" />
                    </button>
                    <button onClick={() => setSellTarget(l)} disabled={busy} title="Jual" className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/70 border border-white/60 text-slate-800 text-xs font-bold hover:bg-white transition disabled:opacity-50">
                      <Coins className="w-3.5 h-3.5 text-amber-600" /> {sellPrice(item)}
                    </button>
                    <button onClick={() => armFromInventory(l)} className="shrink-0 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition">
                      Pasang
                    </button>
                  </li>
                )
              })}
              {inventory.length === 0 && <li className="text-sm text-slate-700 text-center py-8 list-none">Inventori kosong. Beli item di tab Toko.</li>}
            </ul>
          )}
        </aside>
      </main>

      {/* Pratinjau 3D untuk layar sentuh */}
      {previewModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Pratinjau item"
          onClick={() => setPreviewModal(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm"
        >
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-3xl bg-white/95 border border-white/60 shadow-2xl p-4 space-y-3">
            <div className="h-64 rounded-2xl bg-gradient-to-b from-sky-100 to-amber-50 overflow-hidden">
              <ItemPreview path={modelPath(previewModal)} />
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-bold text-slate-800 truncate">{previewModal.name}</p>
                <p className="text-xs text-slate-500">
                  {CATEGORY_LABEL[previewModal.category] ?? previewModal.category} · {footprint(previewModal, 0).w}×{footprint(previewModal, 0).d}
                </p>
              </div>
              <button onClick={() => setPreviewModal(null)} aria-label="Tutup" className="p-2 rounded-lg text-slate-500 hover:bg-slate-100">
                <X className="w-5 h-5" />
              </button>
            </div>
            {tab === 'shop' && (!stockIds || stockIds.has(String(previewModal.id))) && (
              <button
                onClick={() => {
                  const item = previewModal
                  setPreviewModal(null)
                  buy(item)
                }}
                disabled={busy || (unlocked && points < previewModal.price)}
                className="w-full flex items-center justify-center gap-1.5 py-3 rounded-xl bg-amber-500 text-white text-sm font-bold hover:bg-amber-600 transition disabled:opacity-40"
              >
                Beli <Coins className="w-4 h-4" /> {previewModal.price}
              </button>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!sellTarget && !!sellItem}
        title="Jual item ini?"
        confirmLabel={sellItem ? `Jual +${sellPrice(sellItem)} coin` : 'Jual'}
        danger
        busy={busy}
        onConfirm={confirmSell}
        onCancel={() => setSellTarget(null)}
      >
        {sellItem && (
          <>
            <strong className="text-slate-800">{sellItem.name}</strong> akan dijual dan kamu menerima{' '}
            <span className="inline-flex items-center gap-1 font-bold text-amber-600">
              <Coins className="w-4 h-4" /> {sellPrice(sellItem)} coin
            </span>
            . Item akan hilang dari lahan atau inventorimu.
          </>
        )}
      </ConfirmDialog>
    </div>
  )
}
