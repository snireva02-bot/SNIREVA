import { View } from 'react-native';
import { router } from 'expo-router';
import { CheckCircle2, Clock, FileSearch, ShieldAlert, ShieldCheck, type LucideIcon } from 'lucide-react-native';
import { formatDateTime, KYC_STATUS } from '@snireva/shared';
import { Button, Card, Chip, Screen, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { colors, space } from '@/lib/theme';
import { t } from '@/i18n';

const STEPS = ['submitted', 'under_review', 'approved'] as const;

export default function Verification() {
  const { profile } = useAuth();
  const status = profile?.kyc_status ?? 'not_submitted';
  const content: Record<string, { icon: LucideIcon; title: string; body: string; tone: string }> = {
    not_submitted: { icon: FileSearch, title: t('kyc.notSubmittedTitle'), body: t('kyc.notSubmittedBody'), tone: colors.ink2 },
    submitted: { icon: Clock, title: t('kyc.submittedTitle'), body: t('kyc.submittedBody'), tone: colors.warn },
    under_review: { icon: FileSearch, title: t('kyc.reviewTitle'), body: t('kyc.reviewBody'), tone: colors.warn },
    approved: { icon: ShieldCheck, title: t('kyc.approvedTitle'), body: t('kyc.approvedBody'), tone: colors.ok },
    rejected: { icon: ShieldAlert, title: t('kyc.rejectedTitle'), body: profile?.kyc_reject_reason ?? t('kyc.rejectedBody'), tone: colors.bad },
  };
  const c = content[status];
  const reached = STEPS.indexOf(status as (typeof STEPS)[number]);

  return (
    <Screen title="Verification"
      footer={status === 'approved' ? <Button title="Browse scooters" onPress={() => router.replace('/scooters')} />
        : status === 'rejected' || status === 'not_submitted' ? <Button title={status === 'rejected' ? 'Upload again' : t('docs.title')} onPress={() => router.push('/documents')} />
        : <Button title="Back to home" variant="secondary" onPress={() => router.replace('/')} />}>
      <Card style={{ alignItems: 'flex-start', gap: space.md }}>
        <c.icon size={32} color={c.tone} strokeWidth={1.75} />
        <Text variant="title">{c.title}</Text>
        <Text variant="body" color={colors.ink2}>{c.body}</Text>
        <Chip meta={KYC_STATUS[status]} />
      </Card>
      {status !== 'rejected' && status !== 'not_submitted' ? (
        <Card style={{ gap: 0 }}>
          {STEPS.map((step, i) => {
            const done = i <= reached;
            return (
              <View key={step} style={{ flexDirection: 'row', gap: space.md, minHeight: 48 }}>
                <View style={{ alignItems: 'center' }}>
                  {done ? <CheckCircle2 size={24} color={colors.brand} strokeWidth={2} />
                    : <View style={{ width: 20, height: 20, margin: 2, borderRadius: 10, borderWidth: 2, borderColor: colors.lineStrong }} />}
                  {i < STEPS.length - 1 ? <View style={{ width: 2, flex: 1, backgroundColor: i < reached ? colors.brand : colors.line, marginVertical: 2 }} /> : null}
                </View>
                <View style={{ flex: 1, paddingBottom: space.lg }}>
                  <Text variant={done ? 'bodyMedium' : 'body'} color={done ? colors.ink : colors.muted}>{KYC_STATUS[step].label}</Text>
                  {i === 0 && profile?.updated_at ? <Text variant="caption">{formatDateTime(profile.updated_at)}</Text> : null}
                </View>
              </View>
            );
          })}
        </Card>
      ) : null}
    </Screen>
  );
}
