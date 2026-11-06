'use client'

import { useEffect, useState } from 'react'
import { Sparkles, Bell } from 'lucide-react'
import NotificationBell from '@/components/NotificationBell'

interface HeaderProps {
  userName: string
  userId?: string
  timezone?: string
  refreshKey?: number
}

export default function Header({ userName, userId, timezone = 'Asia/Jakarta', refreshKey = 0 }: HeaderProps) {
  const [quote, setQuote] = useState({
    text: 'Konsistensi adalah kunci keberhasilan kecil setiap hari.',
    author: 'FocusLand',
  })

  useEffect(() => {
    fetch('https://dummyjson.com/quotes/random')
      .then((res) => res.json())
      .then((data) => {
        if (data?.quote) setQuote({ text: data.quote, author: data.author })
      })
      .catch(() => {}) // tetap pakai quote default jika offline
  }, [])

  return (
    <header className="relative z-30 w-full glass-card rounded-3xl p-6 mb-5 flex items-center justify-between gap-4">
      <div className="space-y-1 min-w-0">
        <h2 className="text-xl md:text-2xl font-bold text-slate-800 tracking-tight">
          Selamat datang,{' '}
          <span className="bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">{userName}</span>! Siap produktif hari ini? 🔥
        </h2>
        <div className="flex items-center gap-2 text-xs md:text-sm text-slate-500 font-medium">
          <Sparkles className="w-4 h-4 text-amber-500 shrink-0" />
          <p className="line-clamp-1">
            &ldquo;{quote.text}&rdquo; — <span className="text-slate-400 font-normal">{quote.author}</span>
          </p>
        </div>
      </div>

      {userId ? (
        <NotificationBell userId={userId} timezone={timezone} refreshKey={refreshKey} />
      ) : (
        <div className="w-10 h-10 shrink-0 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-600">
          <Bell className="w-5 h-5" />
        </div>
      )}
    </header>
  )
}
