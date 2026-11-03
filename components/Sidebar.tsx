'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { LayoutDashboard, CalendarDays, Trophy, Settings, LogOut } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'

const navItems = [
  { name: 'Dashboard', short: 'Home', href: '/', icon: LayoutDashboard },
  { name: 'Kalender', short: 'Kalender', href: '/calendar', icon: CalendarDays },
  { name: 'My Town', short: 'Town', href: '/town', icon: Trophy },
  { name: 'Settings', short: 'Setelan', href: '/settings', icon: Settings },
]

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 h-[calc(100vh-2rem)] sticky top-4 ml-4 my-4 rounded-3xl glass-card p-5 z-30">
        <div className="flex items-center gap-3 px-3 py-2 mb-8">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-600 to-purple-500 flex items-center justify-center text-white font-bold shadow-md shadow-indigo-500/20">
            F
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-800 leading-tight">FocusLand</h1>
            <p className="text-xs text-slate-400 font-medium">Gamified To-Do</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1.5">
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-semibold transition-all duration-200 ${
                  isActive ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/25' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/60'
                }`}
              >
                <Icon className="w-5 h-5 shrink-0" />
                <span>{item.name}</span>
              </Link>
            )
          })}
        </nav>

        <div className="pt-4 border-t border-slate-200/60">
          <button onClick={handleLogout} className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-semibold text-rose-600 hover:bg-rose-50/80 transition-all duration-200">
            <LogOut className="w-5 h-5 shrink-0" />
            <span>Keluar</span>
          </button>
        </div>
      </aside>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-3 left-3 right-3 h-16 rounded-2xl glass-card px-4 flex items-center justify-around z-40 border border-white/60 shadow-lg">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center gap-1 p-2 rounded-xl transition-all ${
                isActive ? 'text-indigo-600 font-bold scale-105' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px]">{item.short}</span>
            </Link>
          )
        })}
      </nav>
    </>
  )
}
