import { View } from 'react-native';
import { router } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Bike, Clock, MapPin, XCircle } from 'lucide-react-native';
import { BOOKING_STATUS, formatDate, formatINR, RENTAL_STATUS } from '@snireva/shared';
import { Button, Card, Chip, Text } from '@/components/ui';
import { ScooterImage } from '@/components/ScooterCard';
import { must, supabase } from '@/lib/supabase';
import type { OpenRental, usePendingBooking, useLastBooking } from '@/lib/queries';
import { colors, space } from '@/lib/theme';

type Booking = NonNullable<ReturnType<typeof usePendingBooking>['data']>;
type LastBooking = NonNullable<ReturnType<typeof useLastBooking>['data']>;

export function GetScooterCard({ last }: { last?: LastBooking | null }) {
  const declined = last?.status === 'rejected';
  return (
    <Card style={{ gap: space.md }}>
      <Bike size={28} color={colors.brand} strokeWidth={1.75} />
      <Text variant="title">Get your scooters</Text>
      <Text variant="body" color={colors.ink2}>Choose how many scooters you need and a pickup hub. Our team allocates them, usually within a day.</Text>
      {declined && last?.admin_note ? (
        <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' }}>
          <XCircle size={16} color={colors.bad} style={{ marginTop: 2 }} />
          <Text variant="small" style={{ flex: 1 }}>Last request declined: {last.admin_note}</Text>
        </View>
      ) : null}
      <Button title="Browse scooters" onPress={() => router.push('/scooters')} />
    </Card>
  );
}

export function PendingBookingCard({ booking }: { booking: Booking }) {
  const qc = useQueryClient();
  const cancel = useMutation({
    mutationFn: async () => must(await supabase.rpc('cancel_booking', { p_booking: booking.id })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['booking'] }),
  });
  return (
    <Card style={{ gap: space.md }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Clock size={28} color={colors.warn} strokeWidth={1.75} />
        <Chip meta={BOOKING_STATUS.pending} />
      </View>
      <Text variant="title">{booking.quantity > 1 ? `Request for ${booking.quantity} scooters sent` : 'Request sent'}</Text>
      <Text variant="body" color={colors.ink2}>We'll notify you when {booking.quantity > 1 ? 'they are' : 'it is'} allocated. Sent {formatDate(booking.created_at)}.</Text>
      {booking.pickup ? (
        <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
          <MapPin size={16} color={colors.ink2} />
          <Text variant="small">{booking.pickup.name}</Text>
        </View>
      ) : null}
      <Button title="Cancel request" variant="secondary" loading={cancel.isPending} onPress={() => cancel.mutate()} />
    </Card>
  );
}

/** Rentals not yet active: agreement to sign / scooters to collect (bulk orders show all). */
export function RentalSetupCard({ rentals }: { rentals: OpenRental[] }) {
  const toSign = rentals.filter((r) => r.status === 'pending_agreement');
  const toCollect = rentals.filter((r) => r.status === 'pending_handover');
  const group = toSign.length ? toSign : toCollect;
  const needsSign = toSign.length > 0;
  const hub = group[0]?.pickup;
  const weekly = group.reduce((a, r) => a + Number(r.weekly_rent), 0);
  const deposit = group.reduce((a, r) => a + Number(r.deposit_amount), 0);
  return (
    <Card style={{ gap: space.md }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View style={{ flexDirection: 'row' }}>
          {group.slice(0, 4).map((r, i) => (
            <View key={r.id} style={{ marginLeft: i ? -12 : 0, borderRadius: 10, borderWidth: 2, borderColor: colors.surface }}>
              <ScooterImage path={r.scooter?.photo_paths[0]} size={44} />
            </View>
          ))}
        </View>
        <Chip meta={RENTAL_STATUS[group[0].status]} />
      </View>
      <Text variant="title">
        {needsSign ? (group.length > 1 ? `Sign ${group.length} agreements` : 'Sign your agreement')
          : (group.length > 1 ? `Collect ${group.length} scooters` : 'Collect your scooter')}
      </Text>
      <Text variant="small">{group.map((r) => r.scooter?.code).join(', ')}</Text>
      <Text variant="body" color={colors.ink2}>
        {needsSign
          ? `One signature covers ${group.length > 1 ? 'all of them' : 'it'}. Rent ${formatINR(weekly)} per week, deposit ${formatINR(deposit)}.`
          : `Go to ${hub?.name ?? 'the hub'}. Our staff will check each scooter with you and hand it over.`}
      </Text>
      {!needsSign && hub?.address ? (
        <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' }}>
          <MapPin size={16} color={colors.ink2} style={{ marginTop: 2 }} />
          <Text variant="small" style={{ flex: 1 }}>{hub.address}</Text>
        </View>
      ) : null}
      {needsSign ? <Button title="Read and sign" onPress={() => router.push('/agreement')} /> : null}
    </Card>
  );
}
