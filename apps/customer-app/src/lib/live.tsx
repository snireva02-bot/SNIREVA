import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from './auth';
import { supabase } from './supabase';

/** Table -> React Query keys to refresh when a row the rider can see changes (RLS applies to Realtime). */
const MAP: Record<string, string[][]> = {
  rentals: [['rental'], ['amount-due']],
  booking_requests: [['booking']],
  payments: [['payments'], ['amount-due']],
  payment_orders: [['payments']],
  service_requests: [['service']],
  service_updates: [['service']],
  rental_scooter_changes: [['rental']],
  notifications: [['notifications']],
  profiles: [['profile']],
  kyc_documents: [['documents'], ['profile']],
  scooters: [['scooters'], ['rental']],
};

/** Keeps every screen live: one Realtime channel, debounced cache invalidation. */
export function LiveSync() {
  const { session } = useAuth();
  const qc = useQueryClient();
  const uid = session?.user.id;

  useEffect(() => {
    if (!uid) return;
    const pending = new Set<string>();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const flush = () => {
      for (const t of pending) for (const key of MAP[t] ?? []) qc.invalidateQueries({ queryKey: key });
      pending.clear();
      timer = null;
    };
    let ch = supabase.channel(`live-${uid}`);
    for (const table of Object.keys(MAP)) {
      ch = ch.on('postgres_changes', { event: '*', schema: 'public', table }, () => {
        pending.add(table);
        if (!timer) timer = setTimeout(flush, 250);
      });
    }
    ch.subscribe();
    return () => { if (timer) clearTimeout(timer); supabase.removeChannel(ch); };
  }, [uid, qc]);

  return null;
}
