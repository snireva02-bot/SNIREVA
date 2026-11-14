import { FlatList, RefreshControl, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Wrench } from 'lucide-react-native';
import { formatDate, SERVICE_CATEGORY_LABEL, SERVICE_STATUS } from '@snireva/shared';
import { Button, Card, Chip, EmptyState, Screen, Skeleton, Text } from '@/components/ui';
import { must, supabase } from '@/lib/supabase';
import { colors, space } from '@/lib/theme';

export default function ServiceList() {
  const q = useQuery({
    queryKey: ['service', 'list'],
    queryFn: async () => must(await supabase.from('service_requests').select('id, category, description, status, created_at').order('created_at', { ascending: false })),
  });
  return (
    <Screen title="My requests" scroll={false} contentContainerStyle={{ padding: 0 }}
      footer={<Button title="Report a problem" onPress={() => router.push('/service/new')} />}>
      {q.isPending ? <View style={{ padding: space.lg, gap: space.md }}>{[0, 1].map((i) => <Skeleton key={i} height={80} />)}</View> : (
        <FlatList data={q.data ?? []} keyExtractor={(s) => s.id}
          contentContainerStyle={{ padding: space.lg, gap: space.sm, flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => { q.refetch(); }} tintColor={colors.brand} />}
          ListEmptyComponent={<EmptyState icon={Wrench} title="No requests yet" body="If something is wrong with your scooter, report it here and track the fix." />}
          renderItem={({ item: s }) => (
            <Card onPress={() => router.push(`/service/${s.id}`)} style={{ gap: space.xs }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text variant="bodyMedium">{SERVICE_CATEGORY_LABEL[s.category]}</Text>
                <Chip meta={SERVICE_STATUS[s.status]} />
              </View>
              <Text variant="small" numberOfLines={2}>{s.description}</Text>
              <Text variant="caption">{formatDate(s.created_at, true)}</Text>
            </Card>
          )} />
      )}
    </Screen>
  );
}
