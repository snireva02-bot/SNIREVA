import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link, router } from 'expo-router';
import { formatINR, phoneSchema, RENT_AMOUNT } from '@snireva/shared';
import { Button, Input, Text } from '@/components/ui';
import { Logo } from '@/components/Logo';
import { Checkbox } from '@/components/Checkbox';
import { supabase } from '@/lib/supabase';
import { lockedFor } from '@/lib/otp';
import { colors, space } from '@/lib/theme';
import { t } from '@/i18n';
import { DEMO_MODE } from '@/lib/config';

export default function Login() {
  const [phone, setPhone] = useState('');
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function send() {
    setError(null);
    const parsed = phoneSchema.safeParse(phone);
    if (!parsed.success) return setError(parsed.error.issues[0].message);
    if (!agree) return setError(t('auth.consentRequired'));
    const e164 = `+91${parsed.data}`;
    const locked = await lockedFor(e164);
    if (locked) return setError(t('auth.tooMany'));
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({ phone: e164 });
    setBusy(false);
    if (error) return setError(error.status === 429 ? t('auth.tooMany') : error.message);
    router.push({ pathname: '/verify', params: { phone: e164 } });
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, padding: space.xl, gap: space.xl }} keyboardShouldPersistTaps="handled">
          <View style={{ paddingTop: space.xxl, gap: space.xl }}>
            <Logo height={48} />
            <View style={{ gap: space.sm }}>
              <Text variant="title" style={{ fontSize: 24, lineHeight: 32 }}>{t('auth.title')}</Text>
              <Text variant="small">{t('auth.subtitle', { rent: formatINR(RENT_AMOUNT) })}</Text>
            </View>
          </View>
          <View style={{ gap: space.lg }}>
            <Input label={t('auth.phoneLabel')} prefix="+91" keyboardType="phone-pad" textContentType="telephoneNumber"
              autoComplete="tel" maxLength={10} value={phone} onChangeText={(v) => setPhone(v.replace(/\D/g, ''))}
              hint={t('auth.phoneHint')} error={error} returnKeyType="done" onSubmitEditing={send} />
            <Checkbox checked={agree} onChange={setAgree}>
              <Text variant="small">
                {t('auth.consent')}{' '}
                <Link href="/privacy" style={{ color: colors.brand, fontFamily: 'Inter_500Medium' }}>{t('auth.privacy')}</Link>
              </Text>
            </Checkbox>
          </View>
          <View style={{ flex: 1 }} />
          <View style={{ gap: space.sm }}>
            <Button title={t('auth.sendCode')} onPress={send} loading={busy} disabled={phone.length !== 10} />
            {DEMO_MODE || __DEV__ ? <Button title="Try the demo" variant="secondary" onPress={() => router.push('/dev-login')} /> : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
