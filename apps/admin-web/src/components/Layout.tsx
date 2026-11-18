import { Suspense } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  LayoutDashboard, Users, ClipboardList, Bike, KeyRound, IndianRupee, Wrench, BarChart3,
  Settings, ScrollText, LogOut, type LucideIcon,
} from 'lucide-react'
import { ROLE_LABEL } from '@snireva/shared'
import { supabase } from '@/lib/supabase'
import { isManager, useAuth } from '@/lib/auth'
import { cx } from './ui'
import { LiveSync } from '@/lib/live'

type Item = { to: string; label: string; icon: LucideIcon; badge?: number; managerOnly?: boolean }

function useBadges() {
  return useQuery({
    queryKey: ['sidebar-badges'],
    refetchInterval: 60_000,
    queryFn: async () => {
      const [kyc, bookings, service] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'customer').in('kyc_status', ['submitted', 'under_review']),
        supabase.from('booking_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('service_requests').select('id', { count: 'exact', head: true }).in('status', ['open', 'assigned', 'in_progress']),
      ])
      return { kyc: kyc.count ?? 0, bookings: bookings.count ?? 0, service: service.count ?? 0 }
    },
  })
}

export function Layout() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const { data: b } = useBadges()
  const items: Item[] = [
    { to: '/', label: 'Overview', icon: LayoutDashboard },
    { to: '/customers', label: 'Customers', icon: Users, badge: b?.kyc },
    { to: '/bookings', label: 'Booking requests', icon: ClipboardList, badge: b?.bookings },
    { to: '/scooters', label: 'Scooters', icon: Bike },
    { to: '/rentals', label: 'Rentals', icon: KeyRound },
    { to: '/payments', label: 'Payments', icon: IndianRupee },
    { to: '/service', label: 'Service requests', icon: Wrench, badge: b?.service },
    { to: '/reports', label: 'Reports', icon: BarChart3, managerOnly: true },
    { to: '/settings', label: 'Settings', icon: Settings, managerOnly: true },
    { to: '/audit', label: 'Audit log', icon: ScrollText, managerOnly: true },
  ]

  return (
    <div className="flex min-h-dvh">
      <LiveSync />
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2">Skip to content</a>
      <aside className="sticky top-0 flex h-dvh w-60 shrink-0 flex-col border-r border-line bg-surface">
        <div className="flex h-16 items-center gap-3 border-b border-line px-4">
          <img src="/logo-wide.png" alt="SNIREVA" className="h-9 w-auto rounded-sm bg-[#050505] px-1.5 py-1" />
          <span className="text-xs font-medium uppercase tracking-wide text-muted">Admin</span>
        </div>
        <nav className="flex-1 overflow-y-auto px-2 py-3" aria-label="Main">
          <ul className="flex flex-col gap-0.5">
            {items.filter((i) => !i.managerOnly || isManager(profile?.role)).map((i) => (
              <li key={i.to}>
                <NavLink to={i.to} end={i.to === '/'}
                  className={({ isActive }) => cx(
                    'flex h-9 items-center gap-3 rounded-md px-3 text-base transition-colors duration-150',
                    isActive ? 'bg-tint font-medium text-brand-press' : 'text-ink-2 hover:bg-canvas hover:text-ink',
                  )}>
                  <i.icon size={16} strokeWidth={1.75} aria-hidden />
                  <span className="flex-1">{i.label}</span>
                  {!!i.badge && <span className="num rounded-full bg-warn-bg px-1.5 text-xs font-medium text-warn" aria-label={`${i.badge} pending`}>{i.badge}</span>}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="border-t border-line p-3">
          <div className="mb-2 px-1">
            <p className="truncate text-base font-medium">{profile?.full_name ?? profile?.email}</p>
            <p className="text-xs text-muted">{profile ? ROLE_LABEL[profile.role] : ''}</p>
          </div>
          <button type="button" onClick={async () => { await signOut(); navigate('/login') }}
            className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-sm text-ink-2 hover:bg-canvas hover:text-ink">
            <LogOut size={16} strokeWidth={1.75} aria-hidden /> Sign out
          </button>
        </div>
      </aside>
      <main id="main" className="min-w-0 flex-1 px-8 py-6">
        <div className="mx-auto max-w-[1280px]"><Suspense fallback={<div className="flex flex-col gap-4"><div className="skeleton h-8 w-64" /><div className="skeleton h-64 w-full" /></div>}><Outlet /></Suspense></div>
      </main>
    </div>
  )
}
