import { Navigate, Route, Routes } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { lazy, Suspense, type ReactNode } from 'react'
import { isManager, isStaffRole, useAuth } from '@/lib/auth'
import { Layout } from '@/components/Layout'
import { Login } from '@/pages/Login'
import { Overview } from '@/pages/Overview'
const Customers = lazy(() => import('@/pages/Customers').then((m) => ({ default: m.Customers })))
const CustomerDetail = lazy(() => import('@/pages/CustomerDetail').then((m) => ({ default: m.CustomerDetail })))
const Bookings = lazy(() => import('@/pages/Bookings').then((m) => ({ default: m.Bookings })))
const Scooters = lazy(() => import('@/pages/Scooters').then((m) => ({ default: m.Scooters })))
const Rentals = lazy(() => import('@/pages/Rentals').then((m) => ({ default: m.Rentals })))
const RentalDetail = lazy(() => import('@/pages/RentalDetail').then((m) => ({ default: m.RentalDetail })))
const Payments = lazy(() => import('@/pages/Payments').then((m) => ({ default: m.Payments })))
const ServiceRequests = lazy(() => import('@/pages/ServiceRequests').then((m) => ({ default: m.ServiceRequests })))
const Reports = lazy(() => import('@/pages/Reports').then((m) => ({ default: m.Reports })))
const SettingsPage = lazy(() => import('@/pages/Settings').then((m) => ({ default: m.SettingsPage })))
const AuditLog = lazy(() => import('@/pages/AuditLog').then((m) => ({ default: m.AuditLog })))

function RequireStaff({ children }: { children: ReactNode }) {
  const { session, profile, loading } = useAuth()
  if (loading) return <div className="flex min-h-dvh items-center justify-center text-muted"><Loader2 className="animate-spin" aria-label="Loading" /></div>
  if (!session || !profile || !isStaffRole(profile.role) || !profile.is_active) return <Navigate to="/login" replace />
  return <Suspense fallback={<div className="flex min-h-dvh items-center justify-center text-muted"><Loader2 className="animate-spin" aria-label="Loading" /></div>}>{children}</Suspense>
}

function RequireManager({ children }: { children: ReactNode }) {
  const { profile } = useAuth()
  return isManager(profile?.role) ? <>{children}</> : <Navigate to="/" replace />
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<RequireStaff><Layout /></RequireStaff>}>
        <Route index element={<Overview />} />
        <Route path="customers" element={<Customers />} />
        <Route path="customers/:id" element={<CustomerDetail />} />
        <Route path="bookings" element={<Bookings />} />
        <Route path="scooters" element={<Scooters />} />
        <Route path="rentals" element={<Rentals />} />
        <Route path="rentals/:id" element={<RentalDetail />} />
        <Route path="payments" element={<Payments />} />
        <Route path="service" element={<ServiceRequests />} />
        <Route path="reports" element={<RequireManager><Reports /></RequireManager>} />
        <Route path="settings" element={<RequireManager><SettingsPage /></RequireManager>} />
        <Route path="audit" element={<RequireManager><AuditLog /></RequireManager>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
