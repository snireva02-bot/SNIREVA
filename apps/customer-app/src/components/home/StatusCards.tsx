import { View } from 'react-native';
import { router } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Bike, Clock, MapPin, XCircle } from 'lucide-react-native';
import { BOOKING_STATUS, formatDate, formatINR, RENTAL_STATUS } from '@snireva/shared';
import { Button, Card, Chip, Text } from '@/components/ui';
import { ScooterImage } from '@/components/ScooterCard';
import { must, supabase } from '@/lib/supabase';
import type { useCurrentRental, usePendingBooking, useLastBooking } from '@/lib/queries';
import { colors, space } from '@/lib/theme';

type Rental = NonNullable<ReturnType<typeof useCurrentRental>['data']>;
type Booking = NonNullable<ReturnType<typeof usePendingBooking>['data']>;
type LastBooking = NonNullable<ReturnType<typeof useLastBooking>['data']>;

export function GetScooterCard({ last }: { last?: LastBooking | null }) {
  const declined = last?.status === 'rejected';
  return (
    <Card style={{ gap: space.md }}>
      <Bike size={28} color={colors.brand} strokeWidth={1.75} />
      <Text variant="title">Get your scooter</Text>
      <Text variant="body" color={colors.ink2}>Choose a pickup hub and send a request. Our team allocates a scooter, usually within a day.</Text>
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
      <Text variant="title">Request sent</Text>
      <Text variant="body" color={colors.ink2}>We'll notify you when a scooter is allocated. Sent {formatDate(booking.created_at)}.</Text>
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

/** Rental that is not yet active: agreement / handover stage. */
export function RentalSetupCard({ rental }: { rental: Rental }) {
  const needsSign = rental.status === 'pending_agreement';
  return (
    <Card style={{ gap: space.md }}>
      <View style={{ flexDirection: 'row', gap: space.lg, alignItems: 'center' }}>
        <ScooterImage path={rental.scooter?.photo_paths[0]} size={56} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="bodyMedium">{rental.scooter?.model}</Text>
          <Text variant="caption">{rental.scooter?.code}</Text>
        </View>
        <Chip meta={RENTAL_STATUS[rental.status]} />
      </View>
      <Text variant="title">{needsSign ? 'Sign your agreement' : 'Collect your scooter'}</Text>
      <Text variant="body" color={colors.ink2}>
        {needsSign
          ? `Read and sign the rental agreement. Rent is ${formatINR(rental.weekly_rent)} per week, deposit ${formatINR(rental.deposit_amount)}.`
          : `Go to ${rental.pickup?.name ?? 'the hub'}. Our staff will check the scooter with you and hand it over.`}
      </Text>
      {!needsSign && rental.pickup?.address ? (
        <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' }}>
          <MapPin size={16} color={colors.ink2} style={{ marginTop: 2 }} />
          <Text variant="small" style={{ flex: 1 }}>{rental.pickup.address}</Text>
        </View>
      ) : null}
      {needsSign ? <Button title="Read and sign" onPress={() => router.push('/agreement')} /> : null}
    </Card>
  );
}
