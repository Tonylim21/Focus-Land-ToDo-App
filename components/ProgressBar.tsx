interface ProgressBarProps {
  done: number
  total: number
  label?: string
}

export default function ProgressBar({ done, total, label = 'tugas' }: ProgressBarProps) {
  const percent = total === 0 ? 0 : Math.round((done / total) * 100)
  // hue 0 = merah, 60 = kuning, 120 = hijau
  const hue = Math.round(percent * 1.2)
  const color = `hsl(${hue} 80% 45%)`

  return (
    <div>
      <div className="flex items-center justify-between text-xs font-semibold mb-2">
        <span className="text-slate-600">
          {done} dari {total} {label} selesai
        </span>
        <span style={{ color }}>{percent}%</span>
      </div>
      <div className="h-3 w-full rounded-full bg-slate-200/70 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500 ease-out"
          style={{ width: `${percent}%`, backgroundColor: color }}
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
    </div>
  )
}
