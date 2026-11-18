import { Image, Pressable, RefreshControl, View } from 'react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Bell, FileUp, ShieldAlert, Clock } from 'lucide-react-native';
import { KYC_STATUS } from '@snireva/shared';
import { Button, Card, Chip, OfflineBanner, Screen, Skeleton, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { isLive, useLastBooking, useOpenRentals, usePendingBooking, useUnreadCount } from '@/lib/queries';
import { DueCard } from '@/components/home/DueCard';
import { GetScooterCard, PendingBookingCard, RentalSetupCard } from '@/components/home/StatusCards';
import { LifeBuoy, Plus, Wrench, type LucideIcon } from 'lucide-react-native';
import { Appear } from '@/components/motion';
import { useOffline } from '@/lib/network';
import { colors, space, touch } from '@/lib/theme';
import { t } from '@/i18n';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

function QuickTile({ icon: Icon, title, sub, onPress }: { icon: LucideIcon; title: string; sub: string; onPress: () => void }) {
  return (
    <Card onPress={onPress} style={{ flex: 1, gap: space.sm, minHeight: 112 }}>
      <View style={{ width: 40, height: 40, borderRadius: 8, backgroundColor: colors.tint, alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={20} color={colors.brandPress} strokeWidth={1.75} />
      </View>
      <Text variant="bodyMedium">{title}</Text>
      <Text variant="caption">{sub}</Text>
    </Card>
  );
}

function Greeting() {
  const { profile } = useAuth();
  const unread = useUnreadCount();
  const first = profile?.full_name?.split(' ')[0] ?? '';
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingTop: space.sm }}>
      <Image source={require('../../../../assets/images/icon.png')} accessibilityLabel="SNIREVA"
        style={{ width: 44, height: 44, borderRadius: 10, backgroundColor: colors.logoBg }} />
      <View style={{ flex: 1 }}>
        <Text variant="caption">{greeting()}</Text>
        <Text variant="title" numberOfLines={1}>{first || 'Welcome'}</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={`Notifications${unread.data ? `, ${unread.data} unread` : ''}`}
        onPress={() => router.push('/notifications')} hitSlop={4}
        style={({ pressed }) => ({ width: touch, height: touch, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: pressed ? colors.line : colors.surface, borderWidth: 1, borderColor: colors.line })}>
        <Bell size={22} color={colors.ink} strokeWidth={1.75} />
        {unread.data ? <View style={{ position: 'absolute', top: 10, right: 12, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.bad }} /> : null}
      </Pressable>
    </View>
  );
}

function KycCard() {
  const { profile } = useAuth();
  const s = profile?.kyc_status ?? 'not_submitted';
  const Icon = s === 'rejected' ? ShieldAlert : s === 'not_submitted' ? FileUp : Clock;
  const title = { not_submitted: t('kyc.notSubmittedTitle'), submitted: t('kyc.submittedTitle'), under_review: t('kyc.reviewTitle'), rejected: t('kyc.rejectedTitle'), approved: '' }[s];
  const body = s === 'rejected' ? profile?.kyc_reject_reason ?? t('kyc.rejectedBody')
    : { not_submitted: t('kyc.notSubmittedBody'), submitted: t('kyc.submittedBody'), under_review: t('kyc.reviewBody'), approved: '' }[s];
  return (
    <Card style={{ gap: space.md }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Icon size={28} color={s === 'rejected' ? colors.bad : colors.brand} strokeWidth={1.75} />
        <Chip meta={KYC_STATUS[s]} />
      </View>
      <Text variant="title">{title}</Text>
      <Text variant="body" color={colors.ink2}>{body}</Text>
      {s === 'not_submitted' || s === 'rejected'
        ? <Button title={s === 'rejected' ? 'Fix documents' : 'Upload documents'} onPress={() => router.push('/documents')} />
        : <Button title="View status" variant="secondary" onPress={() => router.push('/verification')} />}
    </Card>
  );
}

function Primary() {
  const { profile } = useAuth();
  const rentals = useOpenRentals();
  const pending = usePendingBooking();
  const last = useLastBooking();
  const list = rentals.data ?? [];
  if (profile?.kyc_status !== 'approved' && !list.length) return <KycCard />;
  if (rentals.isPending || pending.isPending) return <Card style={{ gap: space.md }}><Skeleton height={16} width={140} /><Skeleton height={40} width={180} /><Skeleton height={48} /></Card>;
  const live = list.filter(isLive);
  const setup = list.filter((r) => !isLive(r));
  if (!list.length && !pending.data) return <GetScooterCard last={last.data} />;
  return (
    <View style={{ gap: space.lg }}>
      {setup.length ? <RentalSetupCard rentals={setup} /> : null}
      {live.length ? <DueCard rentals={live} /> : null}
      {pending.data ? <PendingBookingCard booking={pending.data} /> : null}
      {live.length && !pending.data && !setup.length ? (
        <Card onPress={() => router.push('/scooters')} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <View style={{ width: 40, height: 40, borderRadius: 8, backgroundColor: colors.tint, alignItems: 'center', justifyContent: 'center' }}>
            <Plus size={20} color={colors.brandPress} strokeWidth={2} />
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="bodyMedium">Need more scooters?</Text>
            <Text variant="caption">Add scooters for your delivery team</Text>
          </View>
        </Card>
      ) : null}
    </View>
  );
}

export default function Home() {
  const { refreshProfile } = useAuth();
  const offline = useOffline();
  const qc = useQueryClient();
  return (
    <Screen noHeader tabScreen refreshControl={<RefreshControl refreshing={false} tintColor={colors.brand}
      onRefresh={() => { refreshProfile(); qc.invalidateQueries({ queryKey: ['rental'] }); qc.invalidateQueries({ queryKey: ['booking'] }); qc.invalidateQueries({ queryKey: ['amount-due'] }); }} />}>
      <Appear index={0}><Greeting /></Appear>
      <OfflineBanner offline={offline} text={t('common.offline')} />
      <Appear index={1}><Primary /></Appear>
      <Appear index={2} style={{ flexDirection: 'row', gap: space.md }}>
        <QuickTile icon={Wrench} title="Report a problem" sub="Battery, brakes, tyres" onPress={() => router.push('/service/new')} />
        <QuickTile icon={LifeBuoy} title="Support" sub="Call or WhatsApp" onPress={() => router.push('/support')} />
      </Appear>
    </Screen>
  );
}
