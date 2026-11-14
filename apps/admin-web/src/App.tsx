import { Navigate, Route, Routes } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { isManager, isStaffRole, useAuth } from '@/lib/auth'
import { Layout } from '@/components/Layout'
import { Login } from '@/pages/Login'
import { Overview } from '@/pages/Overview'
import { Customers } from '@/pages/Customers'
import { CustomerDetail } from '@/pages/CustomerDetail'
import { Bookings } from '@/pages/Bookings'
import { Scooters } from '@/pages/Scooters'
import { Rentals } from '@/pages/Rentals'
import { RentalDetail } from '@/pages/RentalDetail'
import { Payments } from '@/pages/Payments'
import { ServiceRequests } from '@/pages/ServiceRequests'
import { Reports } from '@/pages/Reports'
import { SettingsPage } from '@/pages/Settings'
import { AuditLog } from '@/pages/AuditLog'

function RequireStaff({ children }: { children: ReactNode }) {
  const { session, profile, loading } = useAuth()
  if (loading) return <div className="flex min-h-dvh items-center justify-center text-muted"><Loader2 className="animate-spin" aria-label="Loading" /></div>
  if (!session || !profile || !isStaffRole(profile.role) || !profile.is_active) return <Navigate to="/login" replace />
  return <>{children}</>
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
