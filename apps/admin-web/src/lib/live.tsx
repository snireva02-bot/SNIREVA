import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { formatINR } from '@snireva/shared'
import { supabase } from './supabase'
import { useToast } from '@/components/ui'

/** Table -> query keys to refresh when anything changes there. */
const MAP: Record<string, string[]> = {
  booking_requests: ['bookings', 'sidebar-badges', 'overview', 'customer'],
  rentals: ['rentals', 'rental', 'overview', 'outstanding', 'customer', 'scooters', 'scooter-history'],
  payments: ['payments', 'rental', 'overview', 'collections-14d', 'outstanding', 'customer'],
  payment_orders: ['payments', 'overview'],
  service_requests: ['service-requests', 'service-detail', 'sidebar-badges', 'overview', 'rental', 'scooter-history'],
  service_updates: ['service-detail'],
  profiles: ['customers', 'customer', 'sidebar-badges', 'overview'],
  kyc_documents: ['customer', 'customers', 'sidebar-badges'],
  scooters: ['scooters', 'overview', 'scooters-available'],
  rental_scooter_changes: ['rental', 'scooter-history'],
}

/** One Realtime channel for the whole dashboard: keeps every page live and announces new work. */
export function LiveSync() {
  const qc = useQueryClient()
  const toast = useToast()
  useEffect(() => {
    const dirty = new Set<string>()
    let timer: number | null = null
    const flush = () => { for (const t of dirty) for (const k of MAP[t] ?? []) qc.invalidateQueries({ queryKey: [k] }); dirty.clear(); timer = null }
    let ch = supabase.channel('admin-live')
    for (const table of Object.keys(MAP)) {
      ch = ch.on('postgres_changes', { event: '*', schema: 'public', table }, (e) => {
        dirty.add(table)
        if (timer === null) timer = window.setTimeout(flush, 300)
        const row = e.new as Record<string, unknown>
        if (e.eventType === 'INSERT' && table === 'booking_requests') toast('ok', `New request: ${row.quantity} scooter${Number(row.quantity) === 1 ? '' : 's'}`)
        if (e.eventType === 'INSERT' && table === 'service_requests') toast('ok', row.category === 'complaint' ? 'New complaint received' : 'New problem reported by a rider')
        if (e.eventType === 'INSERT' && table === 'service_updates' && row.author_kind === 'customer') toast('ok', 'A rider replied on a service request')
        if (e.eventType === 'UPDATE' && table === 'payment_orders' && row.status === 'paid' && (e.old as Record<string, unknown>)?.status !== 'paid') toast('ok', `UPI payment received: ${formatINR(row.amount as number)}`)
      })
    }
    ch.subscribe()
    return () => { if (timer !== null) window.clearTimeout(timer); supabase.removeChannel(ch) }
  }, [qc, toast])
  return null
}
