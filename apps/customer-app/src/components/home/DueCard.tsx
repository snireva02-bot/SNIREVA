import { View } from 'react-native';
import { router } from 'expo-router';
import { daysUntil, formatDate, formatINR } from '@snireva/shared';
import { Button, Card, Chip, Skeleton, Text } from '@/components/ui';
import { useDueSummary, type OpenRental } from '@/lib/queries';
import { colors, space } from '@/lib/theme';
import { ProgressBar } from '@/components/motion';

/** The one thing a rider checks every day: how much, and by when (across all their scooters). */
export function DueCard({ rentals }: { rentals: OpenRental[] }) {
  const s = useDueSummary(rentals);
  const n = s.items.length;
  const d = s.earliest ? daysUntil(s.earliest) : 0;
  const late = s.overdue || d < 0;
  const label = late ? `Overdue since ${formatDate(s.earliest)}` : d === 0 ? 'Rent due today' : `Rent due ${formatDate(s.earliest)}`;
  const payable = s.items.filter((x) => !x.rental.renewal_blocked);
  const payTotal = payable.reduce((a, x) => a + Number(x.due?.total ?? 0), 0);
  return (
    <Card style={{ gap: space.md, borderColor: late ? colors.bad : colors.line }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text variant="smallMedium" color={late ? colors.bad : colors.ink2}>{label}</Text>
        {late ? <Chip tone="red" label={d < 0 ? `${-d} days late` : 'Overdue'} /> : d <= 2 ? <Chip tone="amber" label={d === 0 ? 'Today' : `In ${d} days`} /> : <Chip tone="green" label="On track" />}
      </View>
      {s.loading ? <Skeleton height={40} width={160} /> : <Text variant="display" color={late ? colors.bad : colors.ink}>{formatINR(s.total)}</Text>}
      {!late ? (
        <View style={{ gap: space.xs }}>
          <ProgressBar value={d > 7 ? 0 : (7 - d) / 7} color={d <= 2 ? colors.warn : colors.brand} />
          <Text variant="caption">{d > 7 ? `Paid ${d - 7} day${d - 7 === 1 ? '' : 's'} ahead` : d === 0 ? 'Last day of this week' : `${7 - d} of 7 days used this week`}</Text>
        </View>
      ) : null}
      <Text variant="small">
        {n === 1 ? `${s.items[0].rental.scooter?.code} · ${s.items[0].rental.scooter?.model}` : `For ${n} scooters · ${s.items.map((x) => x.rental.scooter?.code).join(', ')}`}
        {s.lateFee > 0 ? ` · includes ${formatINR(s.lateFee)} late fee` : ''}
      </Text>
      <Button title={!payable.length ? 'Renewal on hold' : s.loading ? 'Pay rent' : `Pay ${formatINR(payTotal)}`} onPress={() => router.push('/pay')} disabled={!payable.length} />
      {s.blocked.length ? <Text variant="small" color={colors.bad}>Renewal on hold for {s.blocked.map((r) => r.scooter?.code).join(', ')}: {s.blocked[0].renewal_block_reason}</Text> : null}
    </Card>
  );
}
