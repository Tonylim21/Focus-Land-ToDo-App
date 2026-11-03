import Sidebar from '@/components/Sidebar'

export default function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50/50 flex">
      <Sidebar />
      <main className="flex-1 p-4 md:p-6 pb-24 md:pb-6 max-w-7xl mx-auto w-full">{children}</main>
    </div>
  )
}
