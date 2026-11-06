import { CheckCircle2, Target } from 'lucide-react'

interface StatCardsProps {
  completedTasks: number
  progress: number
}

// Kartu poin sekarang menyatu dengan kartu preview My Town (TownPreviewCard)
export default function StatCards({ completedTasks, progress }: StatCardsProps) {
  const color = `hsl(${Math.round(progress * 1.2)} 80% 45%)`

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-4">
      <div className="glass-card rounded-3xl p-5 flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500">
          <CheckCircle2 className="w-6 h-6" />
        </div>
        <div>
          <p className="text-[11px] uppercase font-bold tracking-wider text-slate-400">Tugas Selesai</p>
          <p className="text-2xl font-bold text-slate-800 leading-tight">{completedTasks}</p>
        </div>
      </div>

      <div className="glass-card rounded-3xl p-5 flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-500">
          <Target className="w-6 h-6" />
        </div>
        <div className="flex-1">
          <p className="text-[11px] uppercase font-bold tracking-wider text-slate-400">Progres Harian</p>
          <p className="text-2xl font-bold leading-tight" style={{ color }}>{progress}%</p>
        </div>
      </div>
    </div>
  )
}
