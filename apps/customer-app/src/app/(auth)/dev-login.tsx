import { useState } from 'react';
import { View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { Button, Card, Input, ListItem, Screen, SectionTitle, Text } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { DEMO_MODE, DEMO_PASSWORD } from '@/lib/config';
import { colors, space } from '@/lib/theme';

/** Demo / development sign-in while SMS OTP is not configured. Hidden in production builds. */
const RIDERS: [string, string, string][] = [
  ['priya', 'Priya Sharma', 'New rider – upload documents'],
  ['arjun', 'Arjun Reddy', 'Documents under review'],
  ['imran', 'Mohammed Imran', 'Verified – request a scooter'],
  ['kiran', 'Kiran Kumar', 'Request for 2 scooters pending'],
  ['lakshmi', 'Lakshmi Devi', 'Scooter allocated – sign agreement'],
  ['ravi', 'Ravi Teja', 'Active rental – rent due in 2 days'],
  ['suresh', 'Suresh Babu', 'Overdue + battery problem being handled'],
  ['anitha', 'Anitha Rao', 'Past rental – returned'],
  ['venkat', 'Venkat Fleet Services', 'Fleet of 3 scooters – one payment for all'],
];

export default function DemoLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  if (!DEMO_MODE && !__DEV__) return null;

  async function signIn(e: string, p: string) {
    setBusy(e); setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: e.trim(), password: p });
    setBusy(null);
    if (error) setError(error.message === 'Invalid login credentials' ? 'Demo account not found. Run "npm run demo:seed".' : error.message);
  }

  return (
    <Screen title="Try the demo">
      <Text variant="small">Pick a rider. Each one is at a different step, so you can try every screen. Payments here are simulated.</Text>
      {error ? <Text variant="small" color={colors.bad}>{error}</Text> : null}
      <Card style={{ padding: 0 }}>
        {RIDERS.map(([key, name, stage], i) => (
          <ListItem key={key} title={name} subtitle={busy === `${key}@demo.snireva.in` ? 'Signing in…' : stage}
            onPress={() => signIn(`${key}@demo.snireva.in`, DEMO_PASSWORD)} last={i === RIDERS.length - 1}
            right={<ChevronRight size={20} color={colors.muted} strokeWidth={1.75} />} />
        ))}
      </Card>
      <SectionTitle>Other account</SectionTitle>
      <View style={{ gap: space.md }}>
        <Input label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
        <Input label="Password" value={password} onChangeText={setPassword} secureTextEntry />
        <Button title="Sign in" variant="secondary" loading={!!busy && busy === email} onPress={() => signIn(email, password)} />
      </View>
    </Screen>
  );
}
