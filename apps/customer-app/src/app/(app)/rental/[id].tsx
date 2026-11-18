import { Linking, RefreshControl, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowRightLeft, FileText, MapPin, Wrench } from 'lucide-react-native';
import { daysUntil, formatDate, formatINR, RENTAL_STATUS, SERVICE_CATEGORY_LABEL, SERVICE_STATUS } from '@snireva/shared';
import { Banner, Button, Card, Chip, ListItem, Row, Screen, SectionTitle, Skeleton, Text } from '@/components/ui';
import { ScooterImage } from '@/components/ScooterCard';
import { Appear } from '@/components/motion';
import { isLive, useAmountDue, useRental } from '@/lib/queries';
import { must, supabase } from '@/lib/supabase';
import { colors, space } from '@/lib/theme';

export default function RentalDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useRental(id);
  const r = q.data;
  const due = useAmountDue(r && isLive(r) ? r.id : null);
  const extra = useQuery({
    queryKey: ['rental', 'extra', id],
    enabled: !!id,
    queryFn: async () => {
      const [svc, swaps] = await Promise.all([
        supabase.from('service_requests').select('id, category, status, created_at, scooter:scooters(code)').eq('rental_id', id).order('created_at', { ascending: false }),
        supabase.from('rental_scooter_changes').select('id, reason, created_at, from:scooters!rental_scooter_changes_from_scooter_id_fkey(code), to:scooters!rental_scooter_changes_to_scooter_id_fkey(code)').eq('rental_id', id).order('created_at', { ascending: false }),
      ]);
      return { svc: must(svc) ?? [], swaps: must(swaps) ?? [] };
    },
  });

  if (!r) return <Screen title="Scooter"><Skeleton height={120} /><Skeleton height={200} /></Screen>;
  const live = isLive(r);
  const d = r.next_due_date ? daysUntil(r.next_due_date) : null;
  const agreement = Array.isArray(r.agreement) ? r.agreement[0] : r.agreement;

  return (
    <Screen title={r.scooter?.code ?? 'Scooter'}
      refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => { q.refetch(); due.refetch(); extra.refetch(); }} tintColor={colors.brand} />}
      footer={live ? (
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <Button title="Report problem" variant="secondary" icon={Wrench} style={{ flex: 1 }}
            onPress={() => router.push({ pathname: '/service/new', params: { rental: r.id } })} />
          <Button title={`Pay ${formatINR(due.data?.total ?? r.weekly_rent)}`} style={{ flex: 1 }} disabled={!!r.renewal_blocked}
            onPress={() => router.push({ pathname: '/pay', params: { rentals: r.id } })} />
        </View>
      ) : undefined}>
      {r.renewal_blocked ? <Banner tone="red" title="Renewal on hold" body={r.renewal_block_reason ?? undefined} /> : null}
      <Appear index={0}><Card style={{ gap: space.lg }}>
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
      </Card></Appear>
      <Appear index={1}><Card style={{ paddingVertical: space.sm }}>
        <Row label="Weekly rent" value={formatINR(r.weekly_rent)} />
        <Row label="Deposit" value={formatINR(r.deposit_amount)} />
        <Row label="Started" value={formatDate(r.start_date, true)} />
        {live ? <Row label="Amount due" value={formatINR(due.data?.total ?? 0)} valueStyle={(due.data?.days_late ?? 0) > 0 ? { color: colors.bad } : undefined} /> : null}
        <Row label="Battery" value={r.scooter?.battery_details ?? '—'} last />
      </Card></Appear>

      <SectionTitle>Problems with this scooter</SectionTitle>
      {extra.data?.svc.length ? (
        <Card style={{ padding: 0 }}>
          {extra.data.svc.map((s, i) => (
            <ListItem key={s.id} icon={Wrench} title={`${SERVICE_CATEGORY_LABEL[s.category]}${s.scooter?.code && s.scooter.code !== r.scooter?.code ? ` · ${s.scooter.code}` : ''}`}
              subtitle={formatDate(s.created_at, true)} right={<Chip meta={SERVICE_STATUS[s.status]} />}
              onPress={() => router.push(`/service/${s.id}`)} last={i === extra.data!.svc.length - 1} />
          ))}
        </Card>
      ) : <Text variant="small">No problems reported. If something is wrong, tap Report problem.</Text>}

      {extra.data?.swaps.length ? (
        <>
          <SectionTitle>Scooter changes</SectionTitle>
          <Card style={{ padding: 0 }}>
            {extra.data.swaps.map((c, i) => (
              <ListItem key={c.id} icon={ArrowRightLeft} title={`${c.from?.code} → ${c.to?.code}`} subtitle={`${formatDate(c.created_at, true)} · ${c.reason}`}
                last={i === extra.data!.swaps.length - 1} />
            ))}
          </Card>
        </>
      ) : null}

      <SectionTitle>More</SectionTitle>
      <Card style={{ padding: 0 }}>
        <ListItem icon={FileText} title="Rental agreement" subtitle={r.status === 'pending_agreement' ? 'Needs your signature' : agreement?.signed_at ? `Signed ${formatDate(agreement.signed_at, true)}` : 'View'}
          onPress={() => router.push({ pathname: '/agreement', params: { rental: r.id } })} last={!r.pickup} />
        {r.pickup ? <ListItem icon={MapPin} title={r.pickup.name} subtitle={r.pickup.address} last
          onPress={() => Linking.openURL(`https://maps.google.com/?q=${encodeURIComponent(r.pickup!.address)}`)} /> : null}
      </Card>
    </Screen>
  );
}
