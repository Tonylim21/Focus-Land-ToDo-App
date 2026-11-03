import { Trophy, CheckCircle2, Target, Lock } from 'lucide-react'

interface StatCardsProps {
  points: number
  showPoints: boolean // poin baru terlihat setelah minimal 1 tugas selesai
  completedTasks: number
  progress: number
}

export default function StatCards({ points, showPoints, completedTasks, progress }: StatCardsProps) {
  const color = `hsl(${Math.round(progress * 1.2)} 80% 45%)`

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
      <div className="glass-card rounded-3xl p-5 flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500">
          <Trophy className="w-6 h-6" />
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
