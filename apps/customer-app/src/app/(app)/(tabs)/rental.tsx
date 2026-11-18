import { RefreshControl, View } from 'react-native';
import { router } from 'expo-router';
import { KeyRound, Plus } from 'lucide-react-native';
import { daysUntil, formatDate, formatINR, RENTAL_STATUS } from '@snireva/shared';
import { Button, Card, Chip, EmptyState, OfflineBanner, Screen, SectionTitle, Skeleton, Text } from '@/components/ui';
import { ScooterImage } from '@/components/ScooterCard';
import { Appear } from '@/components/motion';
import { isLive, useDueSummary, useOpenRentals } from '@/lib/queries';
import { useOffline } from '@/lib/network';
import { colors, space } from '@/lib/theme';
import { t } from '@/i18n';

export default function RentalTab() {
  const q = useOpenRentals();
  const offline = useOffline();
  const list = q.data ?? [];
  const s = useDueSummary(list);
  const live = list.filter(isLive);

  if (q.isPending) return <Screen title="My scooters" back={false} tabScreen><Skeleton height={96} /><Skeleton height={96} /></Screen>;
  if (!list.length) {
    return (
      <Screen title="My scooters" back={false} tabScreen>
        <OfflineBanner offline={offline} text={t('common.offline')} />
        <EmptyState icon={KeyRound} title="No scooters yet" body="Once scooters are allocated to you, each one shows here with its due date."
          action={<Button title="Get scooters" onPress={() => router.push('/scooters')} />} />
      </Screen>
    );
  }

  return (
    <Screen title="My scooters" back={false} tabScreen
      refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => { q.refetch(); s.refetch(); }} tintColor={colors.brand} />}
      footer={live.length ? <Button title={s.loading ? (live.length > 1 ? 'Pay all' : 'Pay rent') : live.length > 1 ? `Pay all · ${formatINR(s.total)}` : `Pay ${formatINR(s.total)}`} onPress={() => router.push('/pay')} /> : undefined}>
      <OfflineBanner offline={offline} text={t('common.offline')} />
      <SectionTitle action={<Text variant="caption">{list.length} scooter{list.length === 1 ? '' : 's'}</Text>}>Your fleet</SectionTitle>
      {list.map((r, i) => {
        const d = r.next_due_date ? daysUntil(r.next_due_date) : null;
        const due = s.items.find((x) => x.rental.id === r.id)?.due;
        return (
          <Appear key={r.id} index={i}>
            <Card onPress={() => router.push(`/rental/${r.id}`)} style={{ gap: space.md }}>
              <View style={{ flexDirection: 'row', gap: space.lg, alignItems: 'center' }}>
                <ScooterImage path={r.scooter?.photo_paths[0]} size={56} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="bodyMedium">{r.scooter?.code}</Text>
                  <Text variant="caption">{r.scooter?.model}</Text>
                </View>
                <Chip meta={RENTAL_STATUS[r.status]} />
              </View>
              {isLive(r) ? (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text variant="small" color={d !== null && d < 0 ? colors.bad : colors.ink2}>
                    {d === null ? '' : d < 0 ? `Due ${formatDate(r.next_due_date)} · ${-d} days late` : `Due ${formatDate(r.next_due_date)}`}
                  </Text>
                  <Text variant="smallMedium" style={{ fontVariant: ['tabular-nums'] }}>{formatINR(due?.total ?? r.weekly_rent)}</Text>
                </View>
              ) : null}
            </Card>
          </Appear>
        );
      })}
      <Card onPress={() => router.push('/scooters')} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <Plus size={20} color={colors.brand} strokeWidth={2} />
        <Text variant="bodyMedium" color={colors.brand}>Add more scooters</Text>
      </Card>
    </Screen>
  );
}
