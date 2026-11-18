import { useQueries, useQuery } from '@tanstack/react-query';
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

/** All of the rider's open rentals (a rider can hold several scooters). */
export function useOpenRentals() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['rental', 'open', session?.user.id],
    enabled: !!session,
    queryFn: async () =>
      must(await supabase.from('rentals').select(RENTAL_SELECT)
        .not('status', 'in', '(returned,terminated)')
        .order('created_at', { ascending: true })) ?? [],
  });
}
export type OpenRental = NonNullable<ReturnType<typeof useOpenRentals>['data']>[number];

export function useRental(id?: string | null) {
  return useQuery({
    queryKey: ['rental', 'one', id],
    enabled: !!id,
    queryFn: async () => must(await supabase.from('rentals').select(RENTAL_SELECT).eq('id', id!).single()),
  });
}

export const isLive = (r: { status: string }) => r.status === 'active' || r.status === 'overdue';

/** Amount due for each live rental + combined totals (one payment can cover all of them). */
export function useDueSummary(rentals: OpenRental[] | undefined) {
  const live = (rentals ?? []).filter(isLive);
  const results = useQueries({
    queries: live.map((r) => ({
      queryKey: ['amount-due', r.id],
      queryFn: async () => (must(await supabase.rpc('rental_amount_due', { p_rental: r.id })) as unknown as AmountDue[])[0],
    })),
  });
  const items = live.map((r, i) => ({ rental: r, due: results[i]?.data }));
  const loading = results.some((q) => q.isPending);
  const total = items.reduce((a, x) => a + Number(x.due?.total ?? 0), 0);
  const lateFee = items.reduce((a, x) => a + Number(x.due?.late_fee ?? 0), 0);
  const earliest = live.map((r) => r.next_due_date).filter(Boolean).sort()[0] ?? null;
  const overdue = live.some((r) => r.status === 'overdue');
  const blocked = live.filter((r) => r.renewal_blocked);
  return { items, loading, total, lateFee, earliest, overdue, blocked, refetch: () => results.forEach((q) => q.refetch()) };
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
      must(await supabase.from('payments').select('*, rental:rentals(scooter:scooters(code))').neq('status', 'created')
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
