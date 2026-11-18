import { useState } from 'react';
import { RefreshControl, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRightLeft, CheckCircle2, CircleDot, MessageCircle, Wrench } from 'lucide-react-native';
import { formatDateTime, SERVICE_CATEGORY_LABEL, SERVICE_STATUS } from '@snireva/shared';
import { Banner, Button, Card, Chip, Input, Screen, SectionTitle, Skeleton, Text } from '@/components/ui';
import { ScooterImage } from '@/components/ScooterCard';
import { Appear } from '@/components/motion';
import { must, supabase } from '@/lib/supabase';
import { colors, space } from '@/lib/theme';

const STEPS = ['open', 'assigned', 'in_progress', 'resolved', 'closed'] as const;

export default function ServiceDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const [reply, setReply] = useState('');
  const [error, setError] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ['service', id],
    queryFn: async () => {
      const [req, updates] = await Promise.all([
        supabase.from('service_requests').select('*, scooter:scooters(code, model, photo_paths), rental:rentals(id, scooter:scooters(code))').eq('id', id).single(),
        supabase.from('service_updates').select('id, author_kind, body, status_to, created_at').eq('request_id', id).order('created_at'),
      ]);
      return { req: must(req)!, updates: must(updates) ?? [] };
    },
  });

  const act = useMutation({
    mutationFn: async (a: { kind: 'reply' } | { kind: 'confirm'; fixed: boolean }) => {
      if (a.kind === 'reply') return must(await supabase.rpc('service_reply', { p_request: id, p_body: reply }));
      return must(await supabase.rpc('service_confirm', { p_request: id, p_fixed: a.fixed, p_note: reply || undefined }));
    },
    onSuccess: () => { setReply(''); setError(null); qc.invalidateQueries({ queryKey: ['service'] }); },
    onError: (e) => setError((e as Error).message),
  });

  if (!q.data) return <Screen title="Request"><Skeleton height={140} /><Skeleton height={220} /></Screen>;
  const { req: s, updates } = q.data;
  const reached = STEPS.indexOf(s.status as (typeof STEPS)[number]);
  const swappedTo = s.rental?.scooter?.code && s.scooter?.code && s.rental.scooter.code !== s.scooter.code ? s.rental.scooter.code : null;
  const isComplaint = s.category === 'complaint';

  return (
    <Screen title={isComplaint ? 'Complaint' : 'Problem report'}
      refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => { q.refetch(); }} tintColor={colors.brand} />}
      footer={s.status === 'resolved' ? (
        <View style={{ gap: space.sm }}>
          <Text variant="smallMedium">Is it fixed?</Text>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Button title="Still not fixed" variant="secondary" style={{ flex: 1 }} loading={act.isPending} onPress={() => act.mutate({ kind: 'confirm', fixed: false })} />
            <Button title="Yes, it's fixed" style={{ flex: 1 }} loading={act.isPending} onPress={() => act.mutate({ kind: 'confirm', fixed: true })} />
          </View>
        </View>
      ) : undefined}>
      <Appear index={0}><Card style={{ gap: space.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          {s.scooter ? <ScooterImage path={s.scooter.photo_paths?.[0]} size={48} /> : null}
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="bodyMedium">{SERVICE_CATEGORY_LABEL[s.category]}{s.scooter ? ` · ${s.scooter.code}` : ''}</Text>
            <Text variant="caption">Reported {formatDateTime(s.created_at)}</Text>
          </View>
          <Chip meta={SERVICE_STATUS[s.status]} />
        </View>
        <Text variant="body" color={colors.ink2}>{s.description}</Text>
        {s.reopened_count > 0 ? <Text variant="caption">Reopened {s.reopened_count} time{s.reopened_count === 1 ? '' : 's'}</Text> : null}
      </Card></Appear>

      {swappedTo ? <Banner tone="green" icon={ArrowRightLeft} title={`Replacement scooter: ${swappedTo}`}
        body={`${s.scooter?.code} was taken for repair. Your due dates and payments stay the same.`} /> : null}
      {s.status === 'resolved' ? <Banner tone="amber" icon={Wrench} title="Marked as fixed by our team" body="Please confirm below. If the problem continues, tap Still not fixed." /> : null}

      {!isComplaint || reached >= 0 ? (
        <Card style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          {STEPS.slice(0, 4).map((step, i) => {
            const done = i <= reached || s.status === 'closed';
            return (
              <View key={step} style={{ alignItems: 'center', flex: 1, gap: space.xs }}>
                {done ? <CheckCircle2 size={22} color={colors.brand} strokeWidth={2} /> : <CircleDot size={22} color={colors.lineStrong} strokeWidth={2} />}
                <Text variant="caption" color={done ? colors.ink : colors.muted} style={{ textAlign: 'center' }}>{SERVICE_STATUS[step].label}</Text>
              </View>
            );
          })}
        </Card>
      ) : null}

      <SectionTitle>Updates</SectionTitle>
      <View style={{ gap: space.sm }}>
        {updates.map((u, i) => {
          const mine = u.author_kind === 'customer';
          return (
            <Appear key={u.id} index={i}>
              <View style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '88%', gap: 2 }}>
                <View style={{ backgroundColor: mine ? colors.tint : u.author_kind === 'system' ? colors.neutralBg : colors.surface,
                  borderWidth: u.author_kind === 'staff' ? 1 : 0, borderColor: colors.line, borderRadius: 12, paddingHorizontal: space.md, paddingVertical: space.sm }}>
                  {u.author_kind !== 'customer' ? <Text variant="caption" color={colors.brandPress}>{u.author_kind === 'staff' ? 'SNIREVA team' : 'Status'}</Text> : null}
                  <Text variant="small" style={{ color: colors.ink }}>{u.body}</Text>
                </View>
                <Text variant="caption" style={{ alignSelf: mine ? 'flex-end' : 'flex-start' }}>{formatDateTime(u.created_at)}</Text>
              </View>
            </Appear>
          );
        })}
      </View>

      {s.status !== 'closed' ? (
        <View style={{ gap: space.sm }}>
          <Input label={s.status === 'resolved' ? 'Add a note (optional)' : 'Reply to our team'} value={reply} onChangeText={setReply} multiline
            placeholder="e.g. I'll bring the scooter at 4 pm" />
          {error ? <Text variant="small" color={colors.bad}>{error}</Text> : null}
          {s.status !== 'resolved' ? <Button title="Send reply" variant="secondary" icon={MessageCircle} disabled={!reply.trim()} loading={act.isPending}
            onPress={() => act.mutate({ kind: 'reply' })} /> : null}
        </View>
      ) : <Text variant="small">Closed {formatDateTime(s.closed_at)}. Report a new problem if it comes back.</Text>}
    </Screen>
  );
}
