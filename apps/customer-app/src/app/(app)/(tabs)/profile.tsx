import { Alert, View } from 'react-native';
import { router } from 'expo-router';
import { Bell, FileText, LogOut, Pencil, ShieldCheck, Trash2, UserCheck } from 'lucide-react-native';
import { formatPhone, KYC_STATUS, PLATFORM_LABEL } from '@snireva/shared';
import { Card, Chip, ListItem, Screen, SectionTitle, Text } from '@/components/ui';
import { Avatar } from '@/components/Avatar';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { space } from '@/lib/theme';

export default function ProfileTab() {
  const { profile, signOut, refreshProfile } = useAuth();
  if (!profile) return null;

  function confirmDelete() {
    Alert.alert('Delete account?', 'We will close your account and delete your data, except records we must keep by law. Any open rental must be returned first.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Request deletion', style: 'destructive', onPress: async () => {
        const { error } = await supabase.rpc('request_account_deletion');
        if (error) return Alert.alert('Could not send request', error.message);
        await refreshProfile();
        Alert.alert('Request sent', 'Our team will contact you within 7 days.');
      } },
    ]);
  }

  return (
    <Screen title="Profile" back={false} tabScreen>
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: space.lg }}>
        <Avatar path={profile.photo_path} name={profile.full_name} size={56} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="bodyMedium">{profile.full_name}</Text>
          <Text variant="small">{formatPhone(profile.phone)}</Text>
          {profile.delivery_platform ? <Text variant="small">{PLATFORM_LABEL[profile.delivery_platform]}</Text> : null}
        </View>
      </Card>

      <SectionTitle>Account</SectionTitle>
      <Card style={{ padding: 0 }}>
        <ListItem icon={Pencil} title="Edit profile" onPress={() => router.push('/edit-profile')} />
        <ListItem icon={UserCheck} title="Verification" right={<Chip meta={KYC_STATUS[profile.kyc_status]} />} onPress={() => router.push('/verification')} />
        <ListItem icon={FileText} title="Documents" onPress={() => router.push('/documents')} />
        <ListItem icon={Bell} title="Notifications" onPress={() => router.push('/notifications')} last />
      </Card>

      <SectionTitle>Privacy</SectionTitle>
      <Card style={{ padding: 0 }}>
        <ListItem icon={ShieldCheck} title="Privacy notice" onPress={() => router.push('/privacy-notice')} />
        <ListItem icon={Trash2} title={profile.deletion_requested_at ? 'Deletion requested' : 'Delete account'}
          subtitle={profile.deletion_requested_at ? 'Our team will contact you' : undefined}
          onPress={profile.deletion_requested_at ? undefined : confirmDelete} last danger={!profile.deletion_requested_at} />
      </Card>

      <Card style={{ padding: 0 }}>
        <ListItem icon={LogOut} title="Log out" onPress={() => Alert.alert('Log out?', undefined, [
          { text: 'Cancel', style: 'cancel' }, { text: 'Log out', style: 'destructive', onPress: signOut },
        ])} last />
      </Card>
      <Text variant="caption" style={{ textAlign: 'center' }}>SNIREVA Pvt. Ltd. · v1.0.0</Text>
    </Screen>
  );
}
