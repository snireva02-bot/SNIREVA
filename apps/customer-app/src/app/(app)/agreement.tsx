import { useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Download, FileText } from 'lucide-react-native';
import { formatDateTime } from '@snireva/shared';
import { Banner, Button, Card, EmptyState, ListItem, Screen, SectionTitle, Skeleton, Text } from '@/components/ui';
import { Checkbox } from '@/components/Checkbox';
import { SignaturePad, type SignaturePadHandle } from '@/components/SignaturePad';
import { SuccessMark } from '@/components/motion';
import { useOpenRentals } from '@/lib/queries';
import { must, supabase } from '@/lib/supabase';
import { dataUrlToBytes, openPdf } from '@/lib/files';
import { useAuth } from '@/lib/auth';
import { colors, space } from '@/lib/theme';

export default function Agreement() {
  const { rental: focus } = useLocalSearchParams<{ rental?: string }>();
  const { profile } = useAuth();
  const qc = useQueryClient();
  const rentals = useOpenRentals();
  const list = rentals.data ?? [];
  const toSign = useMemo(() => list.filter((r) => r.status === 'pending_agreement'), [list]);
  const signing = toSign.length > 0 && (!focus || toSign.some((r) => r.id === focus));
  const pad = useRef<SignaturePadHandle>(null);
  const [accepted, setAccepted] = useState(false);
  const [hasInk, setHasInk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(0);
  const [drawing, setDrawing] = useState(false);

  const terms = useQuery({
    queryKey: ['agreement-terms', toSign[0]?.id],
    enabled: signing,
    queryFn: async () => must(await supabase.rpc('render_agreement', { p_rental: toSign[0].id })) as unknown as { body: string },
  });
  const signed = useQuery({
    queryKey: ['agreement-signed', list.map((r) => r.id).join(',')],
    enabled: !signing && list.length > 0,
    queryFn: async () => must(await supabase.from('agreements').select('id, rental_id, terms_snapshot, signed_at, pdf_path')
      .in('rental_id', focus ? [focus] : list.map((r) => r.id)).order('signed_at', { ascending: false })) ?? [],
  });

  async function onSigned(dataUrl: string) {
    if (!profile || !toSign.length) return;
    setBusy(true); setError(null);
    try {
      const path = `${profile.id}/signature-${Date.now()}.png`;
      const { error: upErr } = await supabase.storage.from('agreements').upload(path, dataUrlToBytes(dataUrl), { contentType: 'image/png' });
      if (upErr) throw upErr;
      const { data, error: signErr } = await supabase.rpc('sign_agreements', { p_rentals: toSign.map((r) => r.id), p_signature_path: path });
      if (signErr) throw signErr;
      await qc.invalidateQueries({ queryKey: ['rental'] });
      setDone(Number(data) || toSign.length);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (rentals.isPending) return <Screen title="Rental agreement"><Skeleton height={320} /></Screen>;

  if (done) {
    const hub = list[0]?.pickup?.name ?? 'the hub';
    return (
      <Screen title="Rental agreement" back={false} footer={<Button title="Back to home" onPress={() => router.replace('/')} />}>
        <Card style={{ alignItems: 'center', gap: space.md, paddingVertical: space.xxl }}>
          <SuccessMark size={72} />
          <Text variant="title">{done > 1 ? `${done} agreements signed` : 'Agreement signed'}</Text>
          <Text variant="body" color={colors.ink2} style={{ textAlign: 'center' }}>
            Next, collect your scooter{done > 1 ? 's' : ''} at {hub}. Our staff will check each one with you.
          </Text>
        </Card>
      </Screen>
    );
  }

  if (!signing) {
    const rows = signed.data ?? [];
    const one = focus ? rows[0] : null;
    if (!list.length || (!signed.isPending && !rows.length)) {
      return <Screen title="Rental agreement"><EmptyState icon={FileText} title="No agreement yet" body="Your agreement appears here once scooters are allocated to you." /></Screen>;
    }
    return (
      <Screen title={rows.length > 1 && !focus ? 'Agreements' : 'Rental agreement'}>
        {error ? <Text variant="small" color={colors.bad}>{error}</Text> : null}
        <SectionTitle>Signed</SectionTitle>
        <Card style={{ padding: 0 }}>
          {rows.map((a, i) => {
            const r = list.find((x) => x.id === a.rental_id);
            return (
              <ListItem key={a.id} icon={CheckCircle2} title={r?.scooter?.code ?? 'Scooter'} subtitle={`Signed ${formatDateTime(a.signed_at)}${a.pdf_path ? '' : ' · PDF being prepared'}`}
                right={a.pdf_path ? <Download size={20} color={colors.brand} /> : undefined} last={i === rows.length - 1}
                onPress={a.pdf_path ? () => openPdf('agreements', a.pdf_path!, `SNIREVA-agreement-${r?.scooter?.code}`).catch((e) => setError(e.message)) : undefined} />
            );
          })}
        </Card>
        {(one ?? rows[0]) ? (
          <Card><Text variant="small" style={{ color: colors.ink }}>{((one ?? rows[0]).terms_snapshot as { body?: string }).body}</Text></Card>
        ) : null}
      </Screen>
    );
  }

  return (
    <Screen title="Rental agreement" scrollEnabled={!busy && !drawing}
      footer={
        <View style={{ gap: space.sm }}>
          {error ? <Text variant="small" color={colors.bad}>{error}</Text> : null}
          <Button title={toSign.length > 1 ? `Accept and sign ${toSign.length} agreements` : 'Accept and sign'} loading={busy} disabled={!accepted || !hasInk} onPress={() => pad.current?.read()} />
        </View>
      }>
      {toSign.length > 1 ? (
        <Banner tone="green" icon={FileText} title={`Covers ${toSign.length} scooters: ${toSign.map((r) => r.scooter?.code).join(', ')}`}
          body="Each scooter gets its own agreement with the same terms. You sign once." />
      ) : null}
      <Text variant="small">Read the full agreement, then sign below with your finger.</Text>
      <Card>
        {terms.isPending ? <View style={{ gap: space.sm }}>{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} height={14} />)}</View>
          : <Text variant="small" style={{ color: colors.ink }}>{terms.data?.body}</Text>}
      </Card>
      <Checkbox checked={accepted} onChange={setAccepted}>
        {toSign.length > 1 ? `I have read and accept these terms for all ${toSign.length} scooters.` : 'I have read and accept the terms of this agreement.'}
      </Checkbox>
      <View style={{ gap: space.sm }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text variant="smallMedium">Your signature</Text>
          <Button title="Clear" variant="ghost" compact onPress={() => { pad.current?.clear(); setHasInk(false); }} />
        </View>
        <SignaturePad ref={pad} onBegin={() => { setHasInk(true); setDrawing(true); }} onEnd={() => setDrawing(false)}
          onSigned={onSigned} onEmpty={() => setError('Draw your signature first')} />
      </View>
    </Screen>
  );
}
