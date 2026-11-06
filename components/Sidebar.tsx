'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { LayoutDashboard, CalendarDays, Trophy, Settings, LogOut, ChevronLeft, ChevronRight, Menu, X } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'

const navItems = [
  { name: 'Dashboard', short: 'Home', href: '/', icon: LayoutDashboard },
  { name: 'Kalender', short: 'Kalender', href: '/calendar', icon: CalendarDays },
  { name: 'My Town', short: 'Town', href: '/town', icon: Trophy },
  { name: 'Settings', short: 'Setelan', href: '/settings', icon: Settings },
]

const STORAGE_KEY = 'focusland:sidebar-collapsed'

interface SidebarProps {
  defaultCollapsed?: boolean // dipakai jika user belum pernah memilih sendiri (mode docked)
  // docked  = sidebar biasa di sisi kiri halaman
  // overlay = melayang di atas konten layar penuh (dipakai My Town); tersembunyi di balik tombol menu
  variant?: 'docked' | 'overlay'
}

export default function Sidebar({ defaultCollapsed = false, variant = 'docked' }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const [collapsed, setCollapsed] = useState(defaultCollapsed)
  const [open, setOpen] = useState(false) // khusus overlay

  // Pilihan user (lipat/buka) diingat di browser
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved === '1') setCollapsed(true)
      else if (saved === '0') setCollapsed(false)
    } catch {
      // localStorage tidak tersedia: abaikan
    }
  }, [])

  const toggle = () => {
    const next = !collapsed
    setCollapsed(next)
    try {
      localStorage.setItem(STORAGE_KEY, next ? '1' : '0')
    } catch {
      // abaikan
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const brand = (compact: boolean) => (
    <div className={`flex items-center gap-3 py-2 mb-8 ${compact ? 'justify-center' : 'px-3'}`}>
      <div className="w-10 h-10 shrink-0 rounded-2xl bg-gradient-to-tr from-indigo-600 to-purple-500 flex items-center justify-center text-white font-bold shadow-md shadow-indigo-500/20">
        F
      </div>
      {!compact && (
        <div>
          <h1 className="text-base font-bold text-slate-800 leading-tight">FocusLand</h1>
          <p className="text-xs text-slate-400 font-medium">Gamified To-Do</p>
        </div>
      )}
    </div>
  )

  const nav = (compact: boolean) => (
    <nav className="flex-1 space-y-1.5">
      {navItems.map((item) => {
        const Icon = item.icon
        const isActive = pathname === item.href
        return (
          <Link
            key={item.href}
            href={item.href}
            title={compact ? item.name : undefined}
            className={`flex items-center gap-3 py-3 rounded-2xl text-sm font-semibold transition-all duration-200 ${
              compact ? 'justify-center px-0' : 'px-4'
            } ${isActive ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/25' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/60'}`}
          >
            <Icon className="w-5 h-5 shrink-0" />
            {!compact && <span>{item.name}</span>}
          </Link>
        )
      })}
    </nav>
  )

  const logoutBtn = (compact: boolean) => (
    <button
      onClick={handleLogout}
      title={compact ? 'Keluar' : undefined}
      className={`w-full flex items-center gap-3 py-3 rounded-2xl text-sm font-semibold text-rose-600 hover:bg-rose-50/80 transition-all duration-200 ${
        compact ? 'justify-center px-0' : 'px-4'
      }`}
    >
      <LogOut className="w-5 h-5 shrink-0" />
      {!compact && <span>Keluar</span>}
    </button>
  )

  const mobileNav = (
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
  )

  // ---- Mode overlay: tidak memakan ruang, tidak ada strip di belakangnya ----
  if (variant === 'overlay') {
    return (
      <>
        <div className="hidden md:block">
          <button
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? 'Tutup menu' : 'Buka menu'}
            title={open ? 'Tutup menu' : 'Buka menu'}
            className="fixed top-4 left-4 z-40 w-12 h-12 rounded-2xl bg-white/25 backdrop-blur-xl border border-white/40 shadow-2xl shadow-black/10 flex items-center justify-center text-slate-900 hover:bg-white/40 transition"
          >
            {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          {open && (
            <aside className="fixed top-20 left-4 bottom-4 w-64 z-40 rounded-3xl glass-card p-5 flex flex-col">
              {brand(false)}
              {nav(false)}
              <div className="pt-4 border-t border-slate-200/60">{logoutBtn(false)}</div>
            </aside>
          )}
        </div>
        {mobileNav}
      </>
    )
  }

  // ---- Mode docked: sidebar biasa, bisa dilipat jadi rel ikon ----
  return (
    <>
      <aside
        className={`hidden md:flex flex-col shrink-0 h-[calc(100vh-2rem)] sticky top-4 ml-4 my-4 rounded-3xl glass-card z-30 transition-[width,padding] duration-200 ${
          collapsed ? 'w-[76px] p-3' : 'w-64 p-5'
        }`}
      >
        {brand(collapsed)}
        {nav(collapsed)}
        <div className="pt-4 border-t border-slate-200/60 space-y-1">
          <button
            onClick={toggle}
            title={collapsed ? 'Buka sidebar' : 'Ciutkan sidebar'}
            className={`w-full flex items-center gap-3 py-3 rounded-2xl text-sm font-semibold text-slate-500 hover:bg-slate-100/60 transition-all duration-200 ${
              collapsed ? 'justify-center px-0' : 'px-4'
            }`}
          >
            {collapsed ? <ChevronRight className="w-5 h-5 shrink-0" /> : <ChevronLeft className="w-5 h-5 shrink-0" />}
            {!collapsed && <span>Ciutkan</span>}
          </button>
          {logoutBtn(collapsed)}
        </div>
      </aside>
      {mobileNav}
    </>
  )
}
