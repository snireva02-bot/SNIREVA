import { View } from 'react-native';
import { Text } from './ui';
import { space } from '@/lib/theme';

const sections: [string, string][] = [
  ['What we collect', 'Your name, mobile number, address, emergency contact, delivery platform, profile photo and the identity documents you upload (Aadhaar, PAN, driving licence, address proof). We also keep your rental, payment and service history.'],
  ['Why we collect it', 'To verify your identity, prepare your rental agreement, collect rent, contact you about your rental and keep records required by law.'],
  ['Who can see it', 'Only authorised SNIREVA staff. Payments are processed by Razorpay; we never store your UPI PIN or card details.'],
  ['How long we keep it', 'While you rent with us and for the period required by tax and legal rules after that.'],
  ['Your choices', 'You can update your details in the app, and request deletion of your account from Profile → Delete account. Some records may be kept where the law requires it.'],
  ['Contact', 'Questions about your data: use Support in the app.'],
];

export function PrivacyNotice() {
  return (
    <View style={{ gap: space.xl }}>
      <Text variant="small">Last updated 14 Nov 2026. Final wording to be reviewed by SNIREVA's lawyer.</Text>
      {sections.map(([h, b]) => (
        <View key={h} style={{ gap: space.sm }}>
          <Text variant="bodyMedium">{h}</Text>
          <Text variant="body" style={{ color: '#45534E' }}>{b}</Text>
        </View>
      ))}
    </View>
  );
}
