import { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { PLATFORM_LABEL, profileSchema, type ProfileInput } from '@snireva/shared';
import { Button, Input, Screen, SelectField, Text } from './ui';
import { Avatar } from './Avatar';
import { Checkbox } from './Checkbox';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { fileName, pickImage, uploadFile, type PickSource } from '@/lib/media';
import { colors, space } from '@/lib/theme';
import { t } from '@/i18n';

type Errors = Partial<Record<keyof ProfileInput | 'consent' | 'form', string>>;
const platforms = Object.entries(PLATFORM_LABEL).map(([value, label]) => ({ value: value as ProfileInput['delivery_platform'], label }));

export function ProfileForm({ mode, onSaved }: { mode: 'setup' | 'edit'; onSaved?: () => void }) {
  const { profile, refreshProfile } = useAuth();
  const [v, setV] = useState({
    full_name: profile?.full_name ?? '',
    address: profile?.address ?? '',
    emergency_contact_name: profile?.emergency_contact_name ?? '',
    emergency_contact_phone: profile?.emergency_contact_phone ?? '',
    delivery_platform: profile?.delivery_platform ?? null,
  });
  const [photo, setPhoto] = useState<string | null>(null);
  const [consent, setConsent] = useState(!!profile?.consent_at);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof v) => (val: string) => setV((x) => ({ ...x, [k]: val }));

  function choosePhoto() {
    const go = async (src: PickSource) => {
      try { const uri = await pickImage(src); if (uri) setPhoto(uri); } catch (e) { Alert.alert('Photo', (e as Error).message); }
    };
    Alert.alert(t('profile.photo'), undefined, [
      { text: t('docs.camera'), onPress: () => go('camera') },
      { text: t('docs.gallery'), onPress: () => go('gallery') },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  }

  async function save() {
    const parsed = profileSchema.safeParse(v);
    const errs: Errors = {};
    if (!parsed.success) for (const i of parsed.error.issues) errs[i.path[0] as keyof ProfileInput] ??= i.message;
    if (!consent) errs.consent = t('auth.consentRequired');
    setErrors(errs);
    if (Object.keys(errs).length || !parsed.success || !profile) return;
    setBusy(true);
    try {
      let photo_path = profile.photo_path;
      if (photo) photo_path = await uploadFile('avatars', `${profile.id}/${fileName('photo')}`, photo);
      const { error } = await supabase.from('profiles').update({ ...parsed.data, photo_path }).eq('id', profile.id);
      if (error) throw error;
      if (!profile.consent_at) await supabase.rpc('record_consent');
      await refreshProfile();
      onSaved?.();
    } catch (e) {
      setErrors({ form: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title={mode === 'setup' ? t('profile.setupTitle') : 'Edit profile'} back={mode === 'edit'}
      footer={<Button title={mode === 'setup' ? t('common.continue') : t('common.save')} onPress={save} loading={busy} />}>
      {mode === 'setup' ? <Text variant="small">{t('profile.setupSub')}</Text> : null}
      <Pressable accessibilityRole="button" accessibilityLabel={photo || profile?.photo_path ? t('profile.changePhoto') : t('profile.addPhoto')}
        onPress={choosePhoto} style={{ flexDirection: 'row', alignItems: 'center', gap: space.lg, minHeight: 72 }}>
        <Avatar path={profile?.photo_path} localUri={photo} name={v.full_name} size={64} />
        <Text variant="smallMedium" color={colors.brand}>{photo || profile?.photo_path ? t('profile.changePhoto') : t('profile.addPhoto')}</Text>
      </Pressable>
      <Input label={t('profile.fullName')} value={v.full_name} onChangeText={set('full_name')} autoComplete="name" textContentType="name" error={errors.full_name} />
      <Input label={t('profile.address')} value={v.address} onChangeText={set('address')} multiline autoComplete="street-address" error={errors.address} />
      <SelectField label={t('profile.platform')} placeholder="Choose platform" options={platforms}
        value={v.delivery_platform} onChange={(p) => setV((x) => ({ ...x, delivery_platform: p }))} error={errors.delivery_platform} />
      <Input label={t('profile.emergencyName')} value={v.emergency_contact_name} onChangeText={set('emergency_contact_name')} error={errors.emergency_contact_name} />
      <Input label={t('profile.emergencyPhone')} prefix="+91" keyboardType="phone-pad" maxLength={10}
        value={v.emergency_contact_phone.replace(/^\+?91/, '')} onChangeText={(x) => set('emergency_contact_phone')(x.replace(/\D/g, ''))} error={errors.emergency_contact_phone} />
      {!profile?.consent_at ? (
        <View style={{ gap: space.xs }}>
          <Checkbox checked={consent} onChange={setConsent}>{t('auth.consent')}</Checkbox>
          {errors.consent ? <Text variant="small" color={colors.bad}>{errors.consent}</Text> : null}
        </View>
      ) : null}
      {errors.form ? <Text variant="small" color={colors.bad}>{errors.form}</Text> : null}
    </Screen>
  );
}
