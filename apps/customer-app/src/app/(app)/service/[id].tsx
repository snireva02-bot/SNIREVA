import { RefreshControl, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2 } from 'lucide-react-native';
import { formatDateTime, SERVICE_CATEGORY_LABEL, SERVICE_STATUS } from '@snireva/shared';
import { Card, Chip, Screen, Skeleton, Text } from '@/components/ui';
import { must, supabase } from '@/lib/supabase';
import { colors, space } from '@/lib/theme';

const STEPS = ['open', 'assigned', 'in_progress', 'resolved'] as const;

export default function ServiceDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useQuery({
    queryKey: ['service', id],
    queryFn: async () => must(await supabase.from('service_requests').select('*').eq('id', id).single()),
  });
  const s = q.data;
  const reached = s ? (s.status === 'closed' ? STEPS.length - 1 : STEPS.indexOf(s.status as (typeof STEPS)[number])) : -1;
  return (
    <Screen title="Request" refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => { q.refetch(); }} tintColor={colors.brand} />}>
      {!s ? <Skeleton height={160} /> : (
        <>
          <Card style={{ gap: space.sm }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text variant="bodyMedium">{SERVICE_CATEGORY_LABEL[s.category]}</Text>
              <Chip meta={SERVICE_STATUS[s.status]} />
            </View>
            <Text variant="body" color={colors.ink2}>{s.description}</Text>
            <Text variant="caption">Sent {formatDateTime(s.created_at)}</Text>
          </Card>
          <Card>
            {STEPS.map((step, i) => {
              const done = i <= reached;
              return (
                <View key={step} style={{ flexDirection: 'row', gap: space.md, minHeight: 44 }}>
                  <View style={{ alignItems: 'center' }}>
                    {done ? <CheckCircle2 size={22} color={colors.brand} strokeWidth={2} />
                      : <View style={{ width: 18, height: 18, margin: 2, borderRadius: 9, borderWidth: 2, borderColor: colors.lineStrong }} />}
                    {i < STEPS.length - 1 ? <View style={{ width: 2, flex: 1, backgroundColor: i < reached ? colors.brand : colors.line }} /> : null}
                  </View>
                  <Text variant={done ? 'bodyMedium' : 'body'} color={done ? colors.ink : colors.muted} style={{ paddingBottom: space.md }}>{SERVICE_STATUS[step].label}</Text>
                </View>
              );
            })}
          </Card>
          {s.admin_notes ? (
            <Card style={{ gap: space.xs }}>
              <Text variant="smallMedium">Note from SNIREVA</Text>
              <Text variant="body" color={colors.ink2}>{s.admin_notes}</Text>
            </Card>
          ) : null}
        </>
      )}
    </Screen>
  );
}
