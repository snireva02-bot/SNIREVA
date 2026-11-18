import { useState } from 'react';
import { Alert, FlatList, RefreshControl, View } from 'react-native';
import { router } from 'expo-router';
import { FileDown, Receipt } from 'lucide-react-native';
import { formatDate, formatINR, PAYMENT_METHOD_LABEL, PAYMENT_STATUS, PAYMENT_TYPE_LABEL } from '@snireva/shared';
import { Button, Card, Chip, EmptyState, OfflineBanner, Screen, Skeleton, Text } from '@/components/ui';
import { isLive, useOpenRentals, usePayments } from '@/lib/queries';
import { useOffline } from '@/lib/network';
import { openPdf } from '@/lib/files';
import { colors, space } from '@/lib/theme';
import { Appear } from '@/components/motion';
import { t } from '@/i18n';

export default function PaymentsTab() {
  const q = usePayments();
  const rentals = useOpenRentals();
  const offline = useOffline();
  const [opening, setOpening] = useState<string | null>(null);
  const canPay = (rentals.data ?? []).some(isLive);

  async function receipt(path: string | null, no: string | null) {
    if (!path) return Alert.alert('Receipt', 'Your receipt is being prepared. Check again in a minute.');
    setOpening(path);
    try { await openPdf('receipts', path, `SNIREVA-${no ?? 'receipt'}`); } catch (e) { Alert.alert('Receipt', (e as Error).message); } finally { setOpening(null); }
  }

  return (
    <Screen title="Payments" back={false} tabScreen scroll={false} contentContainerStyle={{ padding: 0 }}
      footer={canPay ? <Button title="Pay rent" onPress={() => router.push('/pay')} /> : undefined}>
      {q.isPending ? <View style={{ padding: space.lg, gap: space.md }}>{[0, 1, 2, 3].map((i) => <Skeleton key={i} height={72} />)}</View> : (
        <FlatList
          data={q.data ?? []}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ padding: space.lg, gap: space.sm, flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => { q.refetch(); }} tintColor={colors.brand} />}
          ListHeaderComponent={<OfflineBanner offline={offline} text={t('common.offline')} />}
          ListEmptyComponent={<EmptyState icon={Receipt} title="No payments yet" body="Your rent payments and receipts will appear here." />}
          renderItem={({ item: p, index }) => (
            <Appear index={index}><Card onPress={p.status === 'paid' ? () => receipt(p.receipt_path, p.receipt_no) : undefined}
              style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="bodyMedium">{PAYMENT_TYPE_LABEL[p.type]}{p.period_start ? ` · ${formatDate(p.period_start)}–${formatDate(p.period_end)}` : ''}</Text>
                <Text variant="small">{p.rental?.scooter?.code ? `${p.rental.scooter.code} · ` : ''}{formatDate(p.paid_at ?? p.created_at, true)} · {PAYMENT_METHOD_LABEL[p.method]}</Text>
                {p.status !== 'paid' ? <View style={{ marginTop: space.xs }}><Chip meta={PAYMENT_STATUS[p.status]} /></View> : null}
              </View>
              <View style={{ alignItems: 'flex-end', gap: space.xs }}>
                <Text variant="bodyMedium" style={{ fontVariant: ['tabular-nums'] }}>{formatINR(p.amount)}</Text>
                {p.status === 'paid' ? (
                  <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }} accessibilityLabel="Download receipt">
                    <FileDown size={14} color={colors.brand} />
                    <Text variant="caption" color={colors.brand}>{opening !== null && opening === p.receipt_path ? 'Opening…' : 'Receipt'}</Text>
                  </View>
                ) : null}
              </View>
            </Card></Appear>
          )}
        />
      )}
    </Screen>
  );
}
