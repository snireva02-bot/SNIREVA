import { useEffect } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BellOff } from 'lucide-react-native';
import { formatDateTime } from '@snireva/shared';
import { Card, EmptyState, Screen, Skeleton, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { must, supabase } from '@/lib/supabase';
import { colors, space } from '@/lib/theme';
import { Appear } from '@/components/motion';

export default function Notifications() {
  const { session } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['notifications', 'list', session?.user.id],
    queryFn: async () => must(await supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(100)),
  });

  // Opening the inbox marks everything as read.
  useEffect(() => {
    if (!q.data?.some((n) => !n.read_at)) return;
    supabase.from('notifications').update({ read_at: new Date().toISOString() }).is('read_at', null)
      .then(() => qc.invalidateQueries({ queryKey: ['notifications', 'unread'] }));
  }, [q.data, qc]);

  return (
    <Screen title="Notifications" scroll={false} contentContainerStyle={{ padding: 0 }}>
      {q.isPending ? <View style={{ padding: space.lg, gap: space.md }}>{[0, 1, 2].map((i) => <Skeleton key={i} height={72} />)}</View> : (
        <FlatList
          data={q.data ?? []}
          keyExtractor={(n) => n.id}
          contentContainerStyle={{ padding: space.lg, gap: space.sm, flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => { q.refetch(); }} tintColor={colors.brand} />}
          ListEmptyComponent={<EmptyState icon={BellOff} title="No notifications yet" body="Payment receipts, due reminders and updates on your requests will show here." />}
          renderItem={({ item: n, index }) => {
            const route = (n.data as { route?: string } | null)?.route;
            return (
              <Appear index={index}><Card onPress={route ? () => router.push(route as Href) : undefined} style={{ gap: space.xs }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                  {!n.read_at ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brand }} accessibilityLabel="Unread" /> : null}
                  <Text variant="bodyMedium" style={{ flex: 1 }}>{n.title}</Text>
                </View>
                <Text variant="small">{n.body}</Text>
                <Text variant="caption">{formatDateTime(n.created_at)}</Text>
              </Card></Appear>
            );
          }}
        />
      )}
    </Screen>
  );
}
