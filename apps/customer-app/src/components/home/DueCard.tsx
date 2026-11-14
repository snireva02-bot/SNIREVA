import { View } from 'react-native';
import { router } from 'expo-router';
import { daysUntil, formatDate, formatINR } from '@snireva/shared';
import { Button, Card, Chip, Skeleton, Text } from '@/components/ui';
import { useAmountDue, type useCurrentRental } from '@/lib/queries';
import { colors, space } from '@/lib/theme';

type Rental = NonNullable<ReturnType<typeof useCurrentRental>['data']>;

/** The one thing a rider checks every day: how much, and by when. */
export function DueCard({ rental }: { rental: Rental }) {
  const due = useAmountDue(rental.id);
  const d = rental.next_due_date ? daysUntil(rental.next_due_date) : 0;
  const late = d < 0;
  const label = late ? `Overdue since ${formatDate(rental.next_due_date)}` : d === 0 ? 'Rent due today' : `Rent due ${formatDate(rental.next_due_date)}`;
  return (
    <Card style={{ gap: space.md, borderColor: late ? colors.bad : colors.line }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text variant="smallMedium" color={late ? colors.bad : colors.ink2}>{label}</Text>
        {late ? <Chip tone="red" label={`${-d} days late`} /> : d <= 2 ? <Chip tone="amber" label={d === 0 ? 'Today' : `In ${d} days`} /> : <Chip tone="green" label="On track" />}
      </View>
      {due.isPending ? <Skeleton height={40} width={160} /> : <Text variant="display" color={late ? colors.bad : colors.ink}>{formatINR(due.data?.total ?? rental.weekly_rent)}</Text>}
      {(due.data?.late_fee ?? 0) > 0 ? <Text variant="small">Includes {formatINR(due.data?.late_fee)} late fee</Text>
        : <Text variant="small">{rental.scooter?.code} · {rental.scooter?.model}</Text>}
      <Button title={`Pay ${formatINR(due.data?.total ?? rental.weekly_rent)}`} onPress={() => router.push('/pay')} disabled={!!rental.renewal_blocked} />
      {rental.renewal_blocked ? <Text variant="small" color={colors.bad}>Renewal on hold: {rental.renewal_block_reason}</Text> : null}
    </Card>
  );
}
