import { useState } from 'react';
import { Button, Input, Screen, Text } from '@/components/ui';
import { supabase } from '@/lib/supabase';

/** Development builds only: sign in with a seeded test account while SMS/OTP is not configured. */
export default function DevLogin() {
  const [email, setEmail] = useState('rider1@snireva.test');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!__DEV__) return null;
  async function go() {
    setBusy(true); setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) setError(error.message);
  }
  return (
    <Screen title="Developer sign-in" footer={<Button title="Sign in" onPress={go} loading={busy} />}>
      <Text variant="small">Only visible in development builds. Credentials are in scripts/.test-accounts.json.</Text>
      <Input label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
      <Input label="Password" value={password} onChangeText={setPassword} secureTextEntry error={error} />
    </Screen>
  );
}
