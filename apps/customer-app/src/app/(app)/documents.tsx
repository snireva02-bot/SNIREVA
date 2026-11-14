import { useState } from 'react';
import { Alert, Image, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, FileText } from 'lucide-react-native';
import { DOC_STATUS, DOC_TYPE_LABEL } from '@snireva/shared';
import { Banner, Button, Card, Chip, Screen, Skeleton, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useDocuments } from '@/lib/queries';
import { fileName, pickImage, uploadFile, type PickSource } from '@/lib/media';
import { signedUrl, supabase, type Enums, type Tables } from '@/lib/supabase';
import { colors, radius, space } from '@/lib/theme';
import { t } from '@/i18n';

type DocType = Enums<'doc_type'>;
const LIST: { type: DocType; required: boolean }[] = [
  { type: 'aadhaar', required: true },
  { type: 'pan', required: true },
  { type: 'driving_licence', required: true },
  { type: 'address_proof', required: false },
];

function Thumb({ path }: { path: string }) {
  const { data } = useQuery({ queryKey: ['signed', 'kyc', path], queryFn: () => signedUrl('kyc', path), staleTime: 45 * 60 * 1000 });
  return (
    <View style={{ width: 56, height: 56, borderRadius: radius, backgroundColor: colors.canvas, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
      {data ? <Image source={{ uri: data }} style={{ width: 56, height: 56 }} accessibilityLabel="Document photo" /> : <FileText size={24} color={colors.muted} />}
    </View>
  );
}

export default function Documents() {
  const { profile, refreshProfile } = useAuth();
  const qc = useQueryClient();
  const docs = useDocuments();
  const [busy, setBusy] = useState<DocType | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const locked = profile?.kyc_status === 'approved' || profile?.kyc_status === 'under_review';

  const latest = (type: DocType): Tables<'kyc_documents'> | undefined => docs.data?.find((d) => d.doc_type === type);

  function upload(type: DocType) {
    const go = async (src: PickSource) => {
      setError(null);
      try {
        const uri = await pickImage(src);
        if (!uri || !profile) return;
        setBusy(type);
        const path = await uploadFile('kyc', `${profile.id}/${fileName(type)}`, uri);
        const prev = latest(type);
        if (prev && prev.status === 'pending') await supabase.from('kyc_documents').delete().eq('id', prev.id);
        const { error } = await supabase.from('kyc_documents').insert({ user_id: profile.id, doc_type: type, file_path: path });
        if (error) throw error;
        await qc.invalidateQueries({ queryKey: ['documents'] });
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(null);
      }
    };
    Alert.alert(DOC_TYPE_LABEL[type], undefined, [
      { text: t('docs.camera'), onPress: () => go('camera') },
      { text: t('docs.gallery'), onPress: () => go('gallery') },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  }

  const missing = LIST.filter((d) => d.required && !['pending', 'approved'].includes(latest(d.type)?.status ?? ''));

  async function submit() {
    if (missing.length) return setError(t('docs.missing'));
    setSubmitting(true); setError(null);
    const { error } = await supabase.rpc('submit_kyc');
    setSubmitting(false);
    if (error) return setError(error.message);
    await refreshProfile();
    router.replace('/verification');
  }

  return (
    <Screen title={t('docs.title')}
      footer={!locked ? <Button title={t('docs.submit')} onPress={submit} loading={submitting} disabled={!!busy || missing.length > 0} /> : undefined}>
      <Text variant="small">{t('docs.sub')}</Text>
      {profile?.kyc_status === 'rejected' && profile.kyc_reject_reason
        ? <Banner tone="red" title={t('kyc.rejectedTitle')} body={profile.kyc_reject_reason} /> : null}
      {docs.isPending ? <Card><Skeleton height={56} /></Card> : (
        <Card style={{ padding: 0 }}>
          {LIST.map((d, i) => {
            const doc = latest(d.type);
            const canReplace = !locked && doc?.status !== 'approved';
            return (
              <View key={d.type} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, borderBottomWidth: i < LIST.length - 1 ? 1 : 0, borderBottomColor: colors.line }}>
                {doc ? <Thumb path={doc.file_path} /> : (
                  <View style={{ width: 56, height: 56, borderRadius: radius, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.lineStrong, alignItems: 'center', justifyContent: 'center' }}>
                    <Camera size={24} color={colors.muted} strokeWidth={1.75} />
                  </View>
                )}
                <View style={{ flex: 1, gap: space.xs }}>
                  <Text variant="bodyMedium">{DOC_TYPE_LABEL[d.type]}</Text>
                  {doc ? <Chip meta={DOC_STATUS[doc.status]} /> : <Text variant="caption">{d.required ? t('docs.required') : t('docs.optional')}</Text>}
                  {doc?.status === 'rejected' && doc.review_note ? <Text variant="small" color={colors.bad}>{doc.review_note}</Text> : null}
                </View>
                {canReplace ? (
                  <Button title={doc ? t('docs.replace') : t('docs.upload')} variant="secondary" compact
                    loading={busy === d.type} disabled={!!busy && busy !== d.type} onPress={() => upload(d.type)} />
                ) : null}
              </View>
            );
          })}
        </Card>
      )}
      {error ? <Text variant="small" color={colors.bad} accessibilityLiveRegion="polite">{error}</Text> : null}
    </Screen>
  );
}
