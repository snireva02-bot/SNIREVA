import { Linking, View } from 'react-native';
import { router } from 'expo-router';
import { ClipboardList, MessageCircle, MessageSquareWarning, Phone, Wrench } from 'lucide-react-native';
import { formatPhone } from '@snireva/shared';
import { Card, ListItem, Screen, SectionTitle, Text } from '@/components/ui';
import { useSettings } from '@/lib/queries';
import { colors, space } from '@/lib/theme';

export default function SupportTab() {
  const s = useSettings();
  const phone = s.data?.support_phone;
  const wa = s.data?.support_whatsapp?.replace(/\D/g, '');
  return (
    <Screen title="Support" back={false} tabScreen>
      <Text variant="small">Mon–Sat, 9 am – 8 pm. For accidents or theft, call immediately.</Text>
      <Card style={{ padding: 0 }}>
        <ListItem icon={Phone} title="Call us" subtitle={phone ? formatPhone(phone) : 'Not set'} onPress={phone ? () => Linking.openURL(`tel:${phone}`) : undefined} />
        <ListItem icon={MessageCircle} title="WhatsApp" subtitle="Usually replies within an hour" last
          onPress={wa ? () => Linking.openURL(`https://wa.me/${wa}?text=${encodeURIComponent('Hi SNIREVA, I need help with my scooter.')}`) : undefined} />
      </Card>
      <SectionTitle>Scooter problems</SectionTitle>
      <Card style={{ padding: 0 }}>
        <ListItem icon={Wrench} title="Report a problem" subtitle="Battery, charging, brakes, tyres" onPress={() => router.push('/service/new')} />
        <ListItem icon={ClipboardList} title="My requests" subtitle="Track repairs and replies" onPress={() => router.push('/service')} last />
      </Card>
      <SectionTitle>Something else</SectionTitle>
      <Card style={{ padding: 0 }}>
        <ListItem icon={MessageSquareWarning} title="Raise a complaint" subtitle="About staff, billing or service" onPress={() => router.push({ pathname: '/service/new', params: { kind: 'complaint' } })} last />
      </Card>
      <View style={{ alignItems: 'center', paddingTop: space.sm }}>
        <Text variant="caption" color={colors.muted}>{s.data?.company_name}</Text>
      </View>
    </Screen>
  );
}
