import { Linking, RefreshControl, View } from 'react-native';
import { router } from 'expo-router';
import { FileText, KeyRound, MapPin, Wrench } from 'lucide-react-native';
import { daysUntil, formatDate, formatINR, RENTAL_STATUS } from '@snireva/shared';
import { Banner, Button, Card, Chip, EmptyState, ListItem, OfflineBanner, Row, Screen, SectionTitle, Skeleton, Text } from '@/components/ui';
import { ScooterImage } from '@/components/ScooterCard';
import { useAmountDue, useCurrentRental } from '@/lib/queries';
import { useOffline } from '@/lib/network';
import { colors, space } from '@/lib/theme';
import { t } from '@/i18n';

export default function RentalTab() {
  const q = useCurrentRental();
  const offline = useOffline();
  const r = q.data;
  const due = useAmountDue(r && ['active', 'overdue'].includes(r.status) ? r.id : null);

  if (q.isPending) return <Screen title="Rental" back={false} tabScreen><Skeleton height={120} /><Skeleton height={200} /></Screen>;
  if (!r) {
    return (
      <Screen title="Rental" back={false} tabScreen>
        <OfflineBanner offline={offline} text={t('common.offline')} />
        <EmptyState icon={KeyRound} title="No active rental" body="Once a scooter is allocated to you, its details and due dates show here."
          action={<Button title="Browse scooters" onPress={() => router.push('/scooters')} />} />
      </Screen>
    );
  }
  const live = r.status === 'active' || r.status === 'overdue';
  const d = r.next_due_date ? daysUntil(r.next_due_date) : null;

  return (
    <Screen title="Rental" back={false} tabScreen
      refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => { q.refetch(); due.refetch(); }} tintColor={colors.brand} />}
      footer={live ? <Button title={`Pay ${formatINR(due.data?.total ?? r.weekly_rent)}`} onPress={() => router.push('/pay')} /> : undefined}>
      <OfflineBanner offline={offline} text={t('common.offline')} />
      {r.renewal_blocked ? <Banner tone="red" title="Renewal on hold" body={r.renewal_block_reason ?? undefined} /> : null}
      <Card style={{ gap: space.lg }}>
        <View style={{ flexDirection: 'row', gap: space.lg, alignItems: 'center' }}>
          <ScooterImage path={r.scooter?.photo_paths[0]} size={64} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="bodyMedium">{r.scooter?.model}</Text>
            <Text variant="caption">{r.scooter?.code}</Text>
          </View>
          <Chip meta={RENTAL_STATUS[r.status]} />
        </View>
        {live ? (
          <View style={{ gap: 2 }}>
            <Text variant="small">Next rent due</Text>
            <Text variant="title" color={d !== null && d < 0 ? colors.bad : colors.ink}>
              {formatDate(r.next_due_date)} <Text variant="small">{d === null ? '' : d < 0 ? `· ${-d} days late` : d === 0 ? '· today' : `· in ${d} days`}</Text>
            </Text>
          </View>
        ) : null}
      </Card>
      <Card style={{ paddingVertical: space.sm }}>
        <Row label="Weekly rent" value={formatINR(r.weekly_rent)} />
        <Row label="Deposit" value={formatINR(r.deposit_amount)} />
        <Row label="Started" value={formatDate(r.start_date, true)} />
        {live ? <Row label="Amount due" value={formatINR(due.data?.total ?? 0)} valueStyle={(due.data?.days_late ?? 0) > 0 ? { color: colors.bad } : undefined} /> : null}
        <Row label="Battery" value={r.scooter?.battery_details ?? '—'} last />
      </Card>
      <SectionTitle>Manage</SectionTitle>
      <Card style={{ padding: 0 }}>
        <ListItem icon={FileText} title="Rental agreement" subtitle={r.status === 'pending_agreement' ? 'Needs your signature' : 'View or download'} onPress={() => router.push('/agreement')} />
        <ListItem icon={Wrench} title="Report a problem" subtitle="Battery, brakes, tyres and more" onPress={() => router.push('/service/new')} />
        {r.pickup ? <ListItem icon={MapPin} title={r.pickup.name} subtitle={r.pickup.address} last
          onPress={() => Linking.openURL(`https://maps.google.com/?q=${encodeURIComponent(r.pickup!.address)}`)} /> : null}
      </Card>
    </Screen>
  );
}
