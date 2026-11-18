import { useState } from 'react';
import { Pressable, RefreshControl, View } from 'react-native';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bike, Check, MapPin, Minus, Plus } from 'lucide-react-native';
import { formatINR } from '@snireva/shared';
import { Banner, Button, Card, EmptyState, OfflineBanner, Screen, SectionTitle, SelectField, Skeleton, Text } from '@/components/ui';
import { ScooterSummary } from '@/components/ScooterCard';
import { useAuth } from '@/lib/auth';
import { useOpenRentals, usePendingBooking, useSettings } from '@/lib/queries';
import { useOffline } from '@/lib/network';
import { must, supabase } from '@/lib/supabase';
import { colors, radius, space, touch } from '@/lib/theme';
import { Appear } from '@/components/motion';
import { t } from '@/i18n';

function Stepper({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (n: number) => void }) {
  const btn = (icon: typeof Plus, next: number, label: string, disabled: boolean) => {
    const Icon = icon;
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={() => onChange(next)} hitSlop={4}
        style={({ pressed }) => ({ width: touch, height: touch, borderRadius: radius, borderWidth: 1, borderColor: colors.lineStrong,
          alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? colors.canvas : colors.surface, opacity: disabled ? 0.4 : 1 })}>
        <Icon size={20} color={colors.ink} strokeWidth={2} />
      </Pressable>
    );
  };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }} accessibilityRole="adjustable" accessibilityValue={{ min, max, now: value }}>
      {btn(Minus, value - 1, 'Fewer scooters', value <= min)}
      <Text variant="title" style={{ minWidth: 32, textAlign: 'center', fontVariant: ['tabular-nums'] }}>{value}</Text>
      {btn(Plus, value + 1, 'More scooters', value >= max)}
    </View>
  );
}

export default function Scooters() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const offline = useOffline();
  const settings = useSettings();
  const pending = usePendingBooking();
  const rentals = useOpenRentals();
  const [pickup, setPickup] = useState<string | null>(null);
  const [chosen, setChosen] = useState<string[]>([]);
  const [qty, setQty] = useState(1);
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

  const owned = rentals.data?.length ?? 0;
  const maxAllowed = Math.max(0, (settings.data?.max_scooters_per_customer ?? 10) - owned);
  const available = scooters.data?.length ?? 0;
  const quantity = Math.max(qty, chosen.length);

  const request = useMutation({
    mutationFn: async () => must(await supabase.rpc('request_scooter', { p_pickup: pickup!, p_quantity: quantity, p_preferred: chosen })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['booking'] });
      router.replace('/');
    },
    onError: (e) => setError((e as Error).message),
  });

  function toggle(id: string) {
    setError(null);
    setChosen((c) => {
      if (c.includes(id)) return c.filter((x) => x !== id);
      if (c.length >= maxAllowed) { setError(`You can add up to ${maxAllowed} more scooter${maxAllowed === 1 ? '' : 's'}`); return c; }
      return [...c, id];
    });
  }

  const approved = profile?.kyc_status === 'approved';
  const overdue = rentals.data?.some((r) => r.status === 'overdue');
  const blocked = !approved ? 'Your documents must be approved before you can request a scooter.'
    : overdue ? 'Clear your overdue rent before requesting more scooters.'
    : pending.data ? `Your request for ${pending.data.quantity} scooter${pending.data.quantity === 1 ? '' : 's'} is with our team. We'll notify you when they're allocated.`
    : maxAllowed === 0 ? `You already have the maximum of ${owned} scooters.` : null;
  const weekly = (scooters.data ?? []).filter((s) => chosen.includes(s.id)).reduce((a, s) => a + Number(s.weekly_rent ?? settings.data?.weekly_rent ?? 1820), 0)
    + Math.max(0, quantity - chosen.length) * Number(settings.data?.weekly_rent ?? 1820);

  return (
    <Screen title={owned ? 'Add more scooters' : 'Get scooters'}
      refreshControl={<RefreshControl refreshing={scooters.isRefetching} onRefresh={() => { scooters.refetch(); }} tintColor={colors.brand} />}
      footer={!blocked ? (
        <View style={{ gap: space.sm }}>
          {error ? <Text variant="small" color={colors.bad} accessibilityLiveRegion="polite">{error}</Text> : null}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text variant="small">{quantity} scooter{quantity === 1 ? '' : 's'} · {formatINR(weekly)}/week</Text>
            {chosen.length ? <Text variant="small">{chosen.length} picked</Text> : null}
          </View>
          <Button title={`Request ${quantity} scooter${quantity === 1 ? '' : 's'}`}
            onPress={() => { setError(null); if (!pickup) return setError('Choose a pickup location'); request.mutate(); }}
            loading={request.isPending} disabled={offline || !available} />
        </View>
      ) : undefined}>
      <OfflineBanner offline={offline} text={t('common.offline')} />
      {blocked ? <Banner tone={approved && !overdue ? 'amber' : overdue ? 'red' : 'grey'} title={blocked}
        action={!approved ? <Button title="Check verification" variant="secondary" compact onPress={() => router.push('/verification')} />
          : overdue ? <Button title="Pay now" compact onPress={() => router.push('/pay')} /> : undefined} /> : (
        <>
          <Appear index={0}><Card style={{ gap: space.md }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.md }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="bodyMedium">How many scooters?</Text>
                <Text variant="small">For you or your delivery team. Up to {maxAllowed}.</Text>
              </View>
              <Stepper value={quantity} min={Math.max(1, chosen.length)} max={Math.max(1, Math.min(maxAllowed, available))} onChange={setQty} />
            </View>
            <Text variant="caption">{formatINR(settings.data?.weekly_rent ?? 1820)} per scooter per week · deposit {formatINR(settings.data?.deposit_amount ?? 0)} each at pickup</Text>
          </Card></Appear>
          <SelectField label="Pickup location" placeholder="Choose where to collect" value={pickup}
            options={(hubs.data ?? []).map((h) => ({ value: h.id, label: h.name, sub: h.address }))} onChange={setPickup} />
        </>
      )}

      <SectionTitle>{`Available now${scooters.data ? ` · ${available}` : ''}`}</SectionTitle>
      {!blocked && available ? <Text variant="caption" style={{ marginTop: -space.sm }}>Tap scooters you prefer (optional). Our team confirms the final scooters.</Text> : null}
      {scooters.isPending ? [0, 1, 2].map((i) => <Skeleton key={i} height={104} />)
        : !available ? <EmptyState icon={Bike} title="No scooters available" body="All scooters are rented right now. Pull down to refresh, or check back tomorrow." />
        : scooters.data!.map((s, index) => {
          const selected = chosen.includes(s.id);
          return (
            <Appear key={s.id} index={index}><Card onPress={blocked ? undefined : () => toggle(s.id)}
              style={selected ? { borderColor: colors.brand, borderWidth: 2, padding: space.lg - 1 } : undefined}>
              <View accessibilityRole="checkbox" accessibilityState={{ checked: selected }}>
                <ScooterSummary scooter={s} rent={Number(s.weekly_rent ?? settings.data?.weekly_rent ?? 1820)} />
                {selected ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs, marginTop: space.md }}>
                    <Check size={16} color={colors.brand} strokeWidth={2} />
                    <Text variant="smallMedium" color={colors.brand}>Picked</Text>
                  </View>
                ) : null}
              </View>
            </Card></Appear>
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
