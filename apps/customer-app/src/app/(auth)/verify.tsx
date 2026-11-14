import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { formatPhone } from '@snireva/shared';
import { Button, Input, Screen, Text } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { clearGuard, lockedFor, recordFail, RESEND_SECONDS } from '@/lib/otp';
import { space } from '@/lib/theme';
import { t } from '@/i18n';

export default function Verify() {
  const { phone } = useLocalSearchParams<{ phone: string }>();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [left, setLeft] = useState(RESEND_SECONDS);
  const ref = useRef<ComponentRef<typeof TextInput>>(null);

  useEffect(() => {
    const id = setInterval(() => setLeft((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, []);

  async function verify(value = code) {
    if (value.length !== 6 || busy) return;
    setError(null);
    if (await lockedFor(phone)) return setError(t('auth.tooMany'));
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({ phone, token: value, type: 'sms' });
    setBusy(false);
    if (error) {
      const locked = await recordFail(phone);
      setCode('');
      return setError(locked ? t('auth.tooMany') : t('auth.wrongCode'));
    }
    await clearGuard(phone);
    await supabase.rpc('record_consent'); // consent was given on the previous screen
    // Root navigator switches to setup / app automatically once the session exists.
  }

  async function resend() {
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({ phone });
    if (error) return setError(error.status === 429 ? t('auth.tooMany') : error.message);
    setLeft(RESEND_SECONDS);
  }

  return (
    <Screen title={t('auth.verifyTitle')}
      footer={<Button title={t('auth.verify')} onPress={() => verify()} loading={busy} disabled={code.length !== 6} />}>
      <Text variant="small">{t('auth.verifySub', { phone: formatPhone(phone) })}</Text>
      <Input ref={ref} label={t('auth.codeLabel')} value={code} autoFocus keyboardType="number-pad" maxLength={6}
        textContentType="oneTimeCode" autoComplete="sms-otp" error={error}
        style={{ letterSpacing: 8, fontVariant: ['tabular-nums'] }}
        onChangeText={(v) => { const d = v.replace(/\D/g, ''); setCode(d); if (d.length === 6) verify(d); }} />
      <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
        {left > 0
          ? <Text variant="small" style={{ paddingVertical: space.md }}>{t('auth.resendIn', { s: left })}</Text>
          : <Button title={t('auth.resend')} variant="secondary" compact onPress={resend} />}
        <Button title={t('auth.changeNumber')} variant="ghost" compact onPress={() => router.back()} />
      </View>
    </Screen>
  );
}
