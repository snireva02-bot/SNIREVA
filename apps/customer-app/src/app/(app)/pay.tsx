import { useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, Platform, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { AlertCircle, Clock, KeyRound, ShieldCheck } from 'lucide-react-native';
import { formatDate, formatINR } from '@snireva/shared';
import { Banner, Button, Card, EmptyState, OfflineBanner, Row, Screen, Skeleton, Text } from '@/components/ui';
import { Checkbox } from '@/components/Checkbox';
import { Appear, FadeInView, SuccessMark } from '@/components/motion';
import { isLive, useDueSummary, useOpenRentals } from '@/lib/queries';
import { useOffline } from '@/lib/network';
import { invoke, supabase } from '@/lib/supabase';
import { openCheckout } from '@/lib/razorpay';
import { useAuth } from '@/lib/auth';
import { DEMO_MODE } from '@/lib/config';
import { colors, space } from '@/lib/theme';
import { t } from '@/i18n';

type Phase = 'idle' | 'starting' | 'confirming' | 'paid' | 'failed' | 'pending';
interface Order { order_id: string; key_id: string; amount: number; amount_paise: number; payment_order_id: string; prefill: { name: string; contact: string } }

export default function Pay() {
  const { rentals: param } = useLocalSearchParams<{ rentals?: string }>();
  const { profile } = useAuth();
  const qc = useQueryClient();
  const offline = useOffline();
  const open = useOpenRentals();
  const live = useMemo(() => (open.data ?? []).filter(isLive), [open.data]);
  const s = useDueSummary(live);
  const [selected, setSelected] = useState<string[] | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ amount: number; receipts: string[]; next: string[] } | null>(null);
  const channel = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Default selection: the scooter passed in, otherwise every scooter that can be paid.
  useEffect(() => {
    if (selected !== null || !live.length) return;
    const fromParam = param ? param.split(',').filter((id) => live.some((r) => r.id === id)) : [];
    setSelected(fromParam.length ? fromParam : live.filter((r) => !r.renewal_blocked).map((r) => r.id));
  }, [live, param, selected]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => phase === 'starting' || phase === 'confirming');
    return () => sub.remove();
  }, [phase]);
  useEffect(() => () => { if (channel.current) supabase.removeChannel(channel.current); }, []);

  const chosen = s.items.filter((x) => selected?.includes(x.rental.id));
  const total = chosen.reduce((a, x) => a + Number(x.due?.total ?? 0), 0);

  /** Waits for the webhook to settle the order (Realtime + polling fallback). Client success is never trusted. */
  function waitForResult(orderId: string, amount: number) {
    setPhase('confirming');
    let settled = false;
    const finish = async (status: string) => {
      if (settled) return;
      settled = true;
      if (channel.current) supabase.removeChannel(channel.current);
      if (status === 'paid') {
        const { data: rows } = await supabase.from('payments').select('receipt_no, rental_id').eq('order_id', orderId);
        const ids = (rows ?? []).map((p) => p.rental_id!).filter(Boolean);
        const { data: rs } = await supabase.from('rentals').select('next_due_date').in('id', ids);
        setResult({ amount, receipts: (rows ?? []).map((p) => p.receipt_no ?? '').filter(Boolean), next: [...new Set((rs ?? []).map((r) => r.next_due_date!).filter(Boolean))] });
        setPhase('paid');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      } else if (status === 'failed') {
        setPhase('failed');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      } else setPhase('pending');
      for (const k of ['rental', 'payments', 'amount-due']) qc.invalidateQueries({ queryKey: [k] });
    };
    channel.current = supabase.channel(`order-${orderId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'payment_orders', filter: `id=eq.${orderId}` },
        (e) => { const st = (e.new as { status: string }).status; if (st !== 'created') finish(st); })
      .subscribe();
    const started = Date.now();
    const poll = async () => {
      if (settled) return;
      const { data } = await supabase.from('payment_orders').select('status').eq('id', orderId).single();
      if (data && data.status !== 'created') return finish(data.status);
      if (Date.now() - started > 90_000) return finish('pending');
      setTimeout(poll, 3000);
    };
    setTimeout(poll, 1500);
  }

  async function pay() {
    if (!chosen.length) return setError('Choose at least one scooter');
    setError(null); setPhase('starting');
    const ids = chosen.map((x) => x.rental.id);
    try {
      if (DEMO_MODE) {
        // Demo: the server settles the order through the same path as the Razorpay webhook.
        const { data: orderId, error } = await supabase.rpc('demo_pay_rent', { p_rentals: ids });
        if (error) throw error;
        waitForResult(orderId as string, total);
        return;
      }
      const order = await invoke<Order>('create-payment-order', { rental_ids: ids });
      const res = await openCheckout({
        keyId: order.key_id, orderId: order.order_id, amountPaise: order.amount_paise,
        description: ids.length > 1 ? `Rent for ${ids.length} scooters` : `Rent for ${chosen[0].rental.scooter?.code ?? 'scooter'}`,
        name: order.prefill.name || profile?.full_name || '', contact: order.prefill.contact,
      });
      if (res === 'cancelled') { setPhase('idle'); return; }
      waitForResult(order.payment_order_id, order.amount);
    } catch (e) {
      setError((e as Error).message);
      setPhase('idle');
    }
  }

  if (open.isPending) return <Screen title="Pay rent"><Skeleton height={200} /></Screen>;
  if (!live.length) {
    return <Screen title="Pay rent"><EmptyState icon={KeyRound} title="Nothing to pay" body="Rent payments start once a scooter is handed over to you." /></Screen>;
  }

  if (phase === 'paid' && result) {
    return (
      <Screen title="" back={false} footer={<>
        <Button title="Done" onPress={() => router.replace('/')} />
        <Button title="View receipts" variant="ghost" onPress={() => router.replace('/payments')} />
      </>}>
        <View style={{ alignItems: 'center', gap: space.lg, paddingTop: space.xxxl }}>
          <SuccessMark />
          <FadeInView delay={250} style={{ alignItems: 'center', gap: space.sm }}>
            <Text variant="title">Payment received</Text>
            <Text variant="display">{formatINR(result.amount)}</Text>
            <Text variant="body" color={colors.ink2} style={{ textAlign: 'center' }}>
              {result.receipts.length > 1 ? `${result.receipts.length} scooters renewed.` : 'Your rental is renewed.'}
              {result.next.length ? ` Next rent due ${result.next.map((d) => formatDate(d)).join(', ')}.` : ''}
            </Text>
          </FadeInView>
        </View>
        <Card style={{ marginTop: space.xl, paddingVertical: space.sm }}>
          <Row label={result.receipts.length > 1 ? 'Receipts' : 'Receipt'} value={result.receipts.join(', ') || 'Being prepared'} />
          <Row label="Next due" value={result.next.map((d) => formatDate(d, true)).join(', ')} last />
        </Card>
      </Screen>
    );
  }

  if (phase === 'failed' || phase === 'pending') {
    const failed = phase === 'failed';
    return (
      <Screen title="Pay rent" footer={<>
        <Button title={t('common.retry')} onPress={() => setPhase('idle')} />
        <Button title="Contact support" variant="ghost" onPress={() => router.push('/support')} />
      </>}>
        <View style={{ alignItems: 'center', gap: space.md, paddingTop: space.xxxl }}>
          {failed ? <AlertCircle size={48} color={colors.bad} strokeWidth={1.75} /> : <Clock size={48} color={colors.warn} strokeWidth={1.75} />}
          <Text variant="title">{failed ? 'Payment failed' : 'Still confirming'}</Text>
          <Text variant="body" color={colors.ink2} style={{ textAlign: 'center', maxWidth: 320 }}>
            {failed ? 'No money was taken. If it was, your bank will refund it in 5–7 days. You can try again.'
              : "We haven't heard from the bank yet. If money left your account, you'll get a notification once it's confirmed. Don't pay twice."}
          </Text>
        </View>
      </Screen>
    );
  }

  const busy = phase === 'starting' || phase === 'confirming';
  const late = chosen.some((x) => (x.due?.days_late ?? 0) > 0);
  return (
    <Screen title="Pay rent" back={!busy}
      footer={
        <View style={{ gap: space.sm }}>
          {error ? <Text variant="small" color={colors.bad}>{error}</Text> : null}
          <Button title={phase === 'confirming' ? 'Confirming payment…' : `Pay ${formatINR(total)}`}
            onPress={pay} loading={busy} disabled={offline || s.loading || !chosen.length} />
          <View style={{ flexDirection: 'row', gap: space.xs, justifyContent: 'center', alignItems: 'center' }}>
            <ShieldCheck size={14} color={colors.muted} />
            <Text variant="caption">{DEMO_MODE ? 'Demo payment – no money is charged' : 'Secure UPI payment by Razorpay'}</Text>
          </View>
        </View>
      }>
      <OfflineBanner offline={offline} text="You're offline. Connect to pay." />
      <Appear index={0}><Card style={{ gap: space.xs }}>
        <Text variant="small">{late ? 'Overdue amount' : 'Amount due'}{chosen.length > 1 ? ` · ${chosen.length} scooters` : ''}</Text>
        {s.loading ? <Skeleton height={40} width={160} /> : <Text variant="display" color={late ? colors.bad : colors.ink}>{formatINR(total)}</Text>}
        <Text variant="small">Each scooter moves 7 days from its own due date.</Text>
      </Card></Appear>
      {s.blocked.length ? <Banner tone="red" title={`Renewal on hold for ${s.blocked.map((r) => r.scooter?.code).join(', ')}`}
        body={s.blocked[0].renewal_block_reason ?? 'Contact support to continue.'} /> : null}
      <Card style={{ paddingVertical: space.sm }}>
        {s.items.map((x, i) => {
          const r = x.rental;
          const on = !!selected?.includes(r.id);
          const label = `${r.scooter?.code} · due ${formatDate(r.next_due_date)}`;
          const amount = formatINR(x.due?.total ?? r.weekly_rent);
          return (
            <View key={r.id} style={{ borderBottomWidth: i < s.items.length - 1 ? 1 : 0, borderBottomColor: colors.line, paddingVertical: space.xs }}>
              {s.items.length > 1 && !r.renewal_blocked ? (
                <Checkbox checked={on} onChange={(v) => setSelected((c) => (v ? [...(c ?? []), r.id] : (c ?? []).filter((y) => y !== r.id)))}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.md }}>
                    <Text variant="smallMedium">{label}</Text>
                    <Text variant="smallMedium" style={{ fontVariant: ['tabular-nums'] }}>{amount}</Text>
                  </View>
                  {(x.due?.late_fee ?? 0) > 0 ? <Text variant="caption" color={colors.bad}>Includes {formatINR(x.due?.late_fee)} late fee</Text> : null}
                </Checkbox>
              ) : (
                <Row label={label} value={r.renewal_blocked ? 'On hold' : amount} last
                  valueStyle={(x.due?.late_fee ?? 0) > 0 ? { color: colors.bad } : undefined} />
              )}
            </View>
          );
        })}
      </Card>
      <Text variant="caption">Paying early doesn't shorten your week. Each scooter's next due date moves 7 days from its current due date.</Text>
    </Screen>
  );
}
