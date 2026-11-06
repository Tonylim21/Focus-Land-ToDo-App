'use client'

import { useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { ArrowRight, Coins, Lock } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import type { LandItem, TownItem } from '@/types/town'
import { fetchPlaced } from '@/utils/town'

// Three.js hanya dimuat di browser dan tidak memperlambat render awal dashboard
const TownScene = dynamic(() => import('@/components/town/TownScene'), { ssr: false })

interface TownPreviewCardProps {
  userId: string
  points: number
  showPoints: boolean // poin baru terlihat setelah minimal 1 tugas selesai
}

export default function TownPreviewCard({ userId, points, showPoints }: TownPreviewCardProps) {
  const supabase = useMemo(() => createClient(), [])
  const [placed, setPlaced] = useState<LandItem[]>([])
  const [catalog, setCatalog] = useState<Record<string, TownItem>>({})
  const [ready, setReady] = useState(false)
  const [landCount, setLandCount] = useState(1)

  useEffect(() => {
    let cancelled = false
    fetchPlaced(supabase, userId).then(({ land, items, landCount: lc }) => {
      if (cancelled) return
      setPlaced(land)
      setLandCount(lc)
      setCatalog(Object.fromEntries(items.map((i) => [String(i.id), i])))
      setReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [supabase, userId])

  return (
    <div className="glass-card rounded-3xl overflow-hidden grid sm:grid-cols-[1.2fr_1fr]">
      <div className="relative h-52 sm:h-auto sm:min-h-[220px] bg-gradient-to-b from-sky-100 to-emerald-50 pointer-events-none">
        <TownScene catalog={catalog} placed={placed} landCount={landCount} />
        {ready && placed.length === 0 && (
          <div className="absolute inset-0 flex items-end justify-center pb-3">
            <span className="text-[11px] font-semibold text-slate-500 bg-white/80 rounded-full px-3 py-1">Lahanmu masih kosong</span>
          </div>
        )}
      </div>

      <div className="p-5 flex flex-col justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 shrink-0">
            <Coins className="w-6 h-6" />
          </div>
          <div>
            <p className="text-[11px] uppercase font-bold tracking-wider text-slate-400">Total Poin</p>
            {showPoints ? (
              <p className="text-2xl font-bold text-slate-800 leading-tight">
                {points} <span className="text-sm text-slate-400">PTS</span>
              </p>
            ) : (
              <>
                <p className="flex items-center gap-1.5 text-2xl font-bold text-slate-300 leading-tight">
                  <Lock className="w-5 h-5" /> ???
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">Selesaikan 1 tugas untuk membuka</p>
              </>
            )}
          </div>
        </div>

        <div>
          <p className="text-sm font-semibold text-slate-700">My Town</p>
          <p className="text-xs text-slate-400 mt-0.5">
            {placed.length > 0 ? `${placed.length} item terpasang di lahanmu.` : 'Tukar poin dengan bangunan untuk kotamu.'}
          </p>
          <Link
            href="/town"
            className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold shadow-md shadow-indigo-600/25 hover:bg-indigo-700 transition"
          >
            Buka My Town <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  )
}
