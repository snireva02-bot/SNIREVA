import { useRef, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Download, FileText } from 'lucide-react-native';
import { formatDateTime } from '@snireva/shared';
import { Banner, Button, Card, EmptyState, Screen, Skeleton, Text } from '@/components/ui';
import { Checkbox } from '@/components/Checkbox';
import { SignaturePad, type SignaturePadHandle } from '@/components/SignaturePad';
import { useCurrentRental } from '@/lib/queries';
import { SuccessMark } from '@/components/motion';
import { must, supabase } from '@/lib/supabase';
import { dataUrlToBytes, openPdf } from '@/lib/files';
import { useAuth } from '@/lib/auth';
import { colors, space } from '@/lib/theme';

export default function Agreement() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const rental = useCurrentRental();
  const r = rental.data;
  const signed = r?.agreement?.[0] ?? null;
  const pad = useRef<SignaturePadHandle>(null);
  const [accepted, setAccepted] = useState(false);
  const [hasInk, setHasInk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [drawing, setDrawing] = useState(false);

  const terms = useQuery({
    queryKey: ['agreement-terms', r?.id],
    enabled: !!r && !signed,
    queryFn: async () => must(await supabase.rpc('render_agreement', { p_rental: r!.id })) as unknown as { body: string },
  });
  const signedTerms = useQuery({
    queryKey: ['agreement-signed', signed?.id],
    enabled: !!signed,
    queryFn: async () => must(await supabase.from('agreements').select('terms_snapshot, signed_at, pdf_path').eq('id', signed!.id).single()),
  });

  async function onSigned(dataUrl: string) {
    if (!r || !profile) return;
    setBusy(true); setError(null);
    try {
      const path = `${profile.id}/signature-${r.id}-${Date.now()}.png`;
      const { error: upErr } = await supabase.storage.from('agreements').upload(path, dataUrlToBytes(dataUrl), { contentType: 'image/png' });
      if (upErr) throw upErr;
      const { error: signErr } = await supabase.rpc('sign_agreement', { p_rental: r.id, p_signature_path: path });
      if (signErr) throw signErr;
      await qc.invalidateQueries({ queryKey: ['rental'] });
      setDone(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (rental.isPending) return <Screen title="Rental agreement"><Skeleton height={320} /></Screen>;
  if (!r) return <Screen title="Rental agreement"><EmptyState icon={FileText} title="No agreement to sign" body="Your agreement appears here once a scooter is allocated to you." /></Screen>;

  if (done) {
    return (
      <Screen title="Rental agreement" back={false} footer={<Button title="Back to home" onPress={() => router.replace('/')} />}>
        <Card style={{ alignItems: 'center', gap: space.md, paddingVertical: space.xxl }}>
          <SuccessMark size={72} />
          <Text variant="title">Agreement signed</Text>
          <Text variant="body" color={colors.ink2} style={{ textAlign: 'center' }}>
            Next, collect your scooter at {r.pickup?.name ?? 'the hub'}. Our staff will check it with you.
          </Text>
        </Card>
      </Screen>
    );
  }

  if (signed) {
    const st = signedTerms.data;
    return (
      <Screen title="Rental agreement"
        footer={st?.pdf_path ? <Button title="Download PDF" icon={Download} variant="secondary"
          onPress={() => openPdf('agreements', st.pdf_path!, `SNIREVA-agreement-${r.scooter?.code}`).catch((e) => setError(e.message))} /> : undefined}>
        <Banner tone="green" icon={CheckCircle2} title={`Signed ${formatDateTime(st?.signed_at ?? signed.signed_at)}`}
          body={st?.pdf_path ? undefined : 'Your PDF copy is being prepared.'} />
        {error ? <Text variant="small" color={colors.bad}>{error}</Text> : null}
        <Card><Text variant="small" style={{ color: colors.ink }}>{(st?.terms_snapshot as { body?: string } | undefined)?.body ?? ''}</Text></Card>
      </Screen>
    );
  }

  return (
    <Screen title="Rental agreement" scrollEnabled={!busy && !drawing}
      footer={
        <View style={{ gap: space.sm }}>
          {error ? <Text variant="small" color={colors.bad}>{error}</Text> : null}
          <Button title="Accept and sign" loading={busy} disabled={!accepted || !hasInk} onPress={() => pad.current?.read()} />
        </View>
      }>
      <Text variant="small">Read the full agreement, then sign below with your finger.</Text>
      <Card>
        {terms.isPending ? <View style={{ gap: space.sm }}>{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} height={14} />)}</View>
          : <Text variant="small" style={{ color: colors.ink }}>{terms.data?.body}</Text>}
      </Card>
      <Checkbox checked={accepted} onChange={setAccepted}>I have read and accept the terms of this agreement.</Checkbox>
      <View style={{ gap: space.sm }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text variant="smallMedium">Your signature</Text>
          <Button title="Clear" variant="ghost" compact onPress={() => { pad.current?.clear(); setHasInk(false); }} />
        </View>
        <SignaturePad ref={pad} onBegin={() => { setHasInk(true); setDrawing(true); }} onEnd={() => setDrawing(false)} onSigned={onSigned} onEmpty={() => setError('Draw your signature first')} />
      </View>
    </Screen>
  );
}
