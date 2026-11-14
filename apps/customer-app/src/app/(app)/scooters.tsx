import { useState } from 'react';
import { RefreshControl, View } from 'react-native';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bike, Check, MapPin } from 'lucide-react-native';
import { formatINR } from '@snireva/shared';
import { Banner, Button, Card, EmptyState, OfflineBanner, Screen, SectionTitle, SelectField, Skeleton, Text } from '@/components/ui';
import { ScooterSummary } from '@/components/ScooterCard';
import { useAuth } from '@/lib/auth';
import { useCurrentRental, usePendingBooking, useSettings } from '@/lib/queries';
import { useOffline } from '@/lib/network';
import { must, supabase } from '@/lib/supabase';
import { colors, space } from '@/lib/theme';
import { t } from '@/i18n';

export default function Scooters() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const offline = useOffline();
  const settings = useSettings();
  const pending = usePendingBooking();
  const rental = useCurrentRental();
  const [pickup, setPickup] = useState<string | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const scooters = useQuery({
    queryKey: ['scooters', 'available'],
    queryFn: async () => must(await supabase.from('scooters').select('*').eq('status', 'available').order('model').order('code')),
  });
  const hubs = useQuery({
    queryKey: ['pickup-locations'],
    staleTime: 60 * 60 * 1000,
    queryFn: async () => must(await supabase.from('pickup_locations').select('id, name, address').eq('is_active', true).order('name')),
  });

  const request = useMutation({
    mutationFn: async () => must(await supabase.rpc('request_scooter', { p_pickup: pickup!, p_preferred_scooter: chosen ?? undefined })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['booking'] });
      router.replace('/');
    },
    onError: (e) => setError((e as Error).message),
  });

  const approved = profile?.kyc_status === 'approved';
  const blocked = !approved ? 'Your documents must be approved before you can request a scooter.'
    : rental.data ? 'You already have a scooter.'
    : pending.data ? 'Your request is with our team. We will notify you when a scooter is allocated.' : null;

  return (
    <Screen title="Get a scooter"
      refreshControl={<RefreshControl refreshing={scooters.isRefetching} onRefresh={() => { scooters.refetch(); }} tintColor={colors.brand} />}
      footer={!blocked ? (
        <View style={{ gap: space.sm }}>
          {error ? <Text variant="small" color={colors.bad}>{error}</Text> : null}
          <Button title="Request scooter" onPress={() => { setError(null); if (!pickup) return setError('Choose a pickup location'); request.mutate(); }}
            loading={request.isPending} disabled={offline || !scooters.data?.length} />
        </View>
      ) : undefined}>
      <OfflineBanner offline={offline} text={t('common.offline')} />
      {blocked ? <Banner tone={approved ? 'amber' : 'grey'} title={blocked}
        action={!approved ? <Button title="Check verification" variant="secondary" compact onPress={() => router.push('/verification')} /> : undefined} /> : (
        <>
          <Card style={{ gap: space.xs }}>
            <Text variant="small">Weekly rent</Text>
            <Text variant="display">{formatINR(settings.data?.weekly_rent ?? 1820)}</Text>
            <Text variant="small">Refundable deposit {formatINR(settings.data?.deposit_amount ?? 0)} at pickup. Pay weekly by UPI.</Text>
          </Card>
          <SelectField label="Pickup location" placeholder="Choose where to collect" value={pickup}
            options={(hubs.data ?? []).map((h) => ({ value: h.id, label: h.name, sub: h.address }))} onChange={setPickup} />
        </>
      )}

      <SectionTitle>{`Available now${scooters.data ? ` · ${scooters.data.length}` : ''}`}</SectionTitle>
      {scooters.isPending ? [0, 1, 2].map((i) => <Skeleton key={i} height={104} />)
        : !scooters.data?.length ? <EmptyState icon={Bike} title="No scooters available" body="All scooters are rented right now. Pull down to refresh, or check back tomorrow." />
        : scooters.data.map((s) => {
          const selected = chosen === s.id;
          return (
            <Card key={s.id} onPress={blocked ? undefined : () => setChosen(selected ? null : s.id)}
              style={selected ? { borderColor: colors.brand, borderWidth: 2, padding: space.lg - 1 } : undefined}>
              <ScooterSummary scooter={s} rent={Number(s.weekly_rent ?? settings.data?.weekly_rent ?? 1820)} />
              {selected ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs, marginTop: space.md }}>
                  <Check size={16} color={colors.brand} strokeWidth={2} />
                  <Text variant="smallMedium" color={colors.brand}>Preferred. Final scooter is confirmed by our team.</Text>
                </View>
              ) : null}
            </Card>
          );
        })}
      {!blocked && hubs.data?.length ? (
        <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
          <MapPin size={16} color={colors.muted} />
          <Text variant="caption">Pickup hubs: {hubs.data.map((h) => h.name).join(', ')}</Text>
        </View>
      ) : null}
    </Screen>
  );
}
