import { useEffect, useRef, useState } from 'react';
import { BackHandler, Platform, View } from 'react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { AlertCircle, Clock, KeyRound, ShieldCheck } from 'lucide-react-native';
import { Appear, FadeInView, SuccessMark } from '@/components/motion';
import { formatDate, formatINR } from '@snireva/shared';
import { Banner, Button, Card, EmptyState, OfflineBanner, Row, Screen, Skeleton, Text } from '@/components/ui';
import { useAmountDue, useCurrentRental } from '@/lib/queries';
import { useOffline } from '@/lib/network';
import { invoke, supabase } from '@/lib/supabase';
import { openCheckout } from '@/lib/razorpay';
import { useAuth } from '@/lib/auth';
import { colors, space } from '@/lib/theme';
import { t } from '@/i18n';
import { DEMO_MODE } from '@/lib/config';

type Phase = 'idle' | 'starting' | 'confirming' | 'paid' | 'failed' | 'pending';
interface Order { order_id: string; key_id: string; amount: number; amount_paise: number; payment_id: string; prefill: { name: string; contact: string } }

export default function Pay() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const offline = useOffline();
  const rental = useCurrentRental();
  const due = useAmountDue(rental.data?.id);
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ amount: number; receipt?: string | null; next?: string | null } | null>(null);
  const channel = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Don't let Android back interrupt a payment that is being confirmed.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => phase === 'starting' || phase === 'confirming');
    return () => sub.remove();
  }, [phase]);
  useEffect(() => () => { channel.current && supabase.removeChannel(channel.current); }, []);

  /** Waits for the webhook to settle the payment (Realtime + polling fallback). */
  function waitForResult(paymentId: string, amount: number) {
    setPhase('confirming');
    let settled = false;
    const finish = async (status: string) => {
      if (settled) return;
      settled = true;
      channel.current && supabase.removeChannel(channel.current);
      if (status === 'paid') {
        const { data: p } = await supabase.from('payments').select('receipt_no').eq('id', paymentId).single();
        const { data: r } = await supabase.from('rentals').select('next_due_date').eq('id', rental.data!.id).single();
        setResult({ amount, receipt: p?.receipt_no, next: r?.next_due_date });
        setPhase('paid');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      } else if (status === 'failed') {
        setPhase('failed');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      } else setPhase('pending');
      qc.invalidateQueries({ queryKey: ['rental'] });
      qc.invalidateQueries({ queryKey: ['payments'] });
      qc.invalidateQueries({ queryKey: ['amount-due'] });
    };
    channel.current = supabase.channel(`payment-${paymentId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'payments', filter: `id=eq.${paymentId}` },
        (e) => { const s = (e.new as { status: string }).status; if (s !== 'created') finish(s); })
      .subscribe();
    const started = Date.now();
    const poll = async () => {
      if (settled) return;
      const { data } = await supabase.from('payments').select('status').eq('id', paymentId).single();
      if (data && data.status !== 'created') return finish(data.status);
      if (Date.now() - started > 90_000) return finish('pending');
      setTimeout(poll, 3000);
    };
    setTimeout(poll, 3000);
  }

  async function pay() {
    if (!rental.data) return;
    setError(null); setPhase('starting');
    try {
      if (DEMO_MODE) {
        // Demo: server records the payment through the same path as the Razorpay webhook.
        const { data: paymentId, error } = await supabase.rpc('demo_pay_rent', { p_rental: rental.data.id });
        if (error) throw error;
        waitForResult(paymentId as string, Number(due.data?.total ?? rental.data.weekly_rent));
        return;
      }
      const order = await invoke<Order>('create-payment-order', { rental_id: rental.data.id });
      const res = await openCheckout({
        keyId: order.key_id, orderId: order.order_id, amountPaise: order.amount_paise,
        description: `Rent for ${rental.data.scooter?.code ?? 'scooter'}`, name: order.prefill.name || profile?.full_name || '', contact: order.prefill.contact,
      });
      if (res === 'cancelled') { setPhase('idle'); return; }
      waitForResult(order.payment_id, order.amount);
    } catch (e) {
      setError((e as Error).message);
      setPhase('idle');
    }
  }

  if (rental.isPending) return <Screen title="Pay rent"><Skeleton height={200} /></Screen>;
  const r = rental.data;
  if (!r || !['active', 'overdue'].includes(r.status)) {
    return <Screen title="Pay rent"><EmptyState icon={KeyRound} title="Nothing to pay" body="Rent payments start once your rental is active." /></Screen>;
  }

  if (phase === 'paid' && result) {
    return (
      <Screen title="" back={false} footer={<>
        <Button title="Done" onPress={() => router.replace('/')} />
        <Button title="View receipt" variant="ghost" onPress={() => router.replace('/payments')} />
      </>}>
        <View style={{ alignItems: 'center', gap: space.lg, paddingTop: space.xxxl }}>
          <SuccessMark />
          <FadeInView delay={250} style={{ alignItems: 'center', gap: space.sm }}>
            <Text variant="title">Payment received</Text>
            <Text variant="display">{formatINR(result.amount)}</Text>
            <Text variant="body" color={colors.ink2} style={{ textAlign: 'center' }}>
              Your rental is renewed.{result.next ? ` Next rent due ${formatDate(result.next)}.` : ''}
            </Text>
          </FadeInView>
        </View>
        <Appear index={6}><Card style={{ marginTop: space.xl, paddingVertical: space.sm }}>
          <Row label="Receipt" value={result.receipt ?? 'Being prepared'} />
          <Row label="Scooter" value={r.scooter?.code ?? ''} />
          <Row label="Next due" value={formatDate(result.next, true)} last />
        </Card></Appear>
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

  const d = due.data;
  const blocked = d?.renewal_blocked;
  const busy = phase === 'starting' || phase === 'confirming';
  return (
    <Screen title="Pay rent" back={!busy}
      footer={!blocked ? (
        <View style={{ gap: space.sm }}>
          {error ? <Text variant="small" color={colors.bad}>{error}</Text> : null}
          <Button title={phase === 'confirming' ? 'Confirming payment…' : `Pay ${formatINR(d?.total ?? r.weekly_rent)}`}
            onPress={pay} loading={busy} disabled={offline || !d} />
          <View style={{ flexDirection: 'row', gap: space.xs, justifyContent: 'center', alignItems: 'center' }}>
            <ShieldCheck size={14} color={colors.muted} />
            <Text variant="caption">{DEMO_MODE ? 'Demo payment – no money is charged' : 'Secure UPI payment by Razorpay'}</Text>
          </View>
        </View>
      ) : undefined}>
      <OfflineBanner offline={offline} text="You're offline. Connect to pay." />
      {blocked ? <Banner tone="red" title="Renewal on hold" body={r.renewal_block_reason ?? 'Contact support to continue your rental.'}
        action={<Button title="Contact support" variant="secondary" compact onPress={() => router.push('/support')} />} /> : null}
      <Appear index={0}><Card style={{ gap: space.xs }}>
        <Text variant="small">{(d?.days_late ?? 0) > 0 ? 'Overdue amount' : 'Amount due'}</Text>
        {due.isPending ? <Skeleton height={40} width={160} /> : <Text variant="display" color={(d?.days_late ?? 0) > 0 ? colors.bad : colors.ink}>{formatINR(d?.total ?? 0)}</Text>}
        <Text variant="small">For {formatDate(d?.period_start)} – {formatDate(d?.period_end, true)}</Text>
      </Card></Appear>
      <Card style={{ paddingVertical: space.sm }}>
        <Row label="Weekly rent" value={formatINR(d?.rent ?? r.weekly_rent)} />
        {(d?.late_fee ?? 0) > 0 ? <Row label={`Late fee (${d?.days_late} days)`} value={formatINR(d?.late_fee)} valueStyle={{ color: colors.bad }} /> : null}
        <Row label="Due date" value={formatDate(r.next_due_date, true)} />
        <Row label="Scooter" value={`${r.scooter?.code} · ${r.scooter?.model}`} last />
      </Card>
      <Text variant="caption">Paying early doesn't shorten your week. Your next due date moves 7 days from {formatDate(r.next_due_date)}.</Text>
    </Screen>
  );
}
