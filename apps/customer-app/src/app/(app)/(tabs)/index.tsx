import { Pressable, RefreshControl, View } from 'react-native';
import { router } from 'expo-router';
import { Bell, FileUp, ShieldAlert, Clock } from 'lucide-react-native';
import { KYC_STATUS } from '@snireva/shared';
import { Button, Card, Chip, OfflineBanner, Screen, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useUnreadCount } from '@/lib/queries';
import { useOffline } from '@/lib/network';
import { colors, space, touch } from '@/lib/theme';
import { t } from '@/i18n';

function Greeting() {
  const { profile } = useAuth();
  const unread = useUnreadCount();
  const first = profile?.full_name?.split(' ')[0] ?? '';
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: space.sm }}>
      <View>
        <Text variant="caption">SNIREVA</Text>
        <Text variant="title">Hi, {first}</Text>
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

export default function Home() {
  const { profile, refreshProfile } = useAuth();
  const offline = useOffline();
  return (
    <Screen noHeader tabScreen refreshControl={<RefreshControl refreshing={false} onRefresh={() => { refreshProfile(); }} tintColor={colors.brand} />}>
      <Greeting />
      <OfflineBanner offline={offline} text={t('common.offline')} />
      {profile?.kyc_status !== 'approved' ? <KycCard /> : (
        <Card style={{ gap: space.sm }}>
          <Text variant="title">{t('kyc.approvedTitle')}</Text>
          <Text variant="body" color={colors.ink2}>{t('kyc.approvedBody')}</Text>
        </Card>
      )}
    </Screen>
  );
}
