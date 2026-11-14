import { useQuery } from '@tanstack/react-query';
import { supabase, must } from './supabase';
import { useAuth } from './auth';

/** Shared settings: support numbers, current rent. */
export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    staleTime: 10 * 60 * 1000,
    queryFn: async () => must(await supabase.from('settings').select('*').single()),
  });
}

export function useDocuments() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['documents', session?.user.id],
    enabled: !!session,
    queryFn: async () =>
      must(await supabase.from('kyc_documents').select('*').order('created_at', { ascending: false })),
  });
}

const RENTAL_SELECT = '*, scooter:scooters(*), pickup:pickup_locations(name, address), agreement:agreements(id, signed_at, pdf_path)';

/** Current open rental (not returned/terminated), if any. */
export function useCurrentRental() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['rental', 'current', session?.user.id],
    enabled: !!session,
    queryFn: async () =>
      must(await supabase.from('rentals').select(RENTAL_SELECT)
        .not('status', 'in', '(returned,terminated)')
        .order('created_at', { ascending: false }).limit(1).maybeSingle()),
  });
}

export function usePendingBooking() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['booking', 'pending', session?.user.id],
    enabled: !!session,
    queryFn: async () =>
      must(await supabase.from('booking_requests').select('*, pickup:pickup_locations(name, address)')
        .eq('status', 'pending').maybeSingle()),
  });
}

export function useLastBooking() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['booking', 'last', session?.user.id],
    enabled: !!session,
    queryFn: async () =>
      must(await supabase.from('booking_requests').select('id, status, admin_note, created_at')
        .order('created_at', { ascending: false }).limit(1).maybeSingle()),
  });
}

export function usePayments() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['payments', session?.user.id],
    enabled: !!session,
    queryFn: async () =>
      must(await supabase.from('payments').select('*').neq('status', 'created')
        .or('failure_reason.is.null,failure_reason.neq.Superseded by a newer attempt')
        .order('created_at', { ascending: false }).limit(100)),
  });
}

export function useUnreadCount() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['notifications', 'unread', session?.user.id],
    enabled: !!session,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { count } = await supabase.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null);
      return count ?? 0;
    },
  });
}

export interface AmountDue {
  rent: number; late_fee: number; total: number; period_start: string | null; period_end: string | null;
  days_late: number; weeks_due: number; outstanding: number; renewal_blocked: boolean;
}
export function useAmountDue(rentalId?: string | null) {
  return useQuery({
    queryKey: ['amount-due', rentalId],
    enabled: !!rentalId,
    queryFn: async () => {
      const rows = must(await supabase.rpc('rental_amount_due', { p_rental: rentalId! })) as unknown as AmountDue[];
      return rows[0];
    },
  });
}
