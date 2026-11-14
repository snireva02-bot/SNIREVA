import { Tabs } from 'expo-router/tabs';
import { Home, KeyRound, IndianRupee, LifeBuoy, User, type LucideIcon } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, font } from '@/lib/theme';
import { t } from '@/i18n';

const icon = (Icon: LucideIcon) => ({ color, focused }: { color: unknown; focused: boolean }) =>
  <Icon size={24} color={String(color)} strokeWidth={focused ? 2 : 1.75} />;

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: colors.brand,
      tabBarInactiveTintColor: colors.muted,
      tabBarLabelStyle: { fontFamily: font.medium, fontSize: 12 },
      tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.line, borderTopWidth: 1, height: 72 + insets.bottom, paddingTop: 8, paddingBottom: Math.max(insets.bottom, 12), elevation: 0, shadowOpacity: 0 },
      sceneStyle: { backgroundColor: colors.canvas },
    }}>
      <Tabs.Screen name="index" options={{ title: t('tabs.home'), tabBarIcon: icon(Home) }} />
      <Tabs.Screen name="rental" options={{ title: t('tabs.rental'), tabBarIcon: icon(KeyRound) }} />
      <Tabs.Screen name="payments" options={{ title: t('tabs.payments'), tabBarIcon: icon(IndianRupee) }} />
      <Tabs.Screen name="support" options={{ title: t('tabs.support'), tabBarIcon: icon(LifeBuoy) }} />
      <Tabs.Screen name="profile" options={{ title: t('tabs.profile'), tabBarIcon: icon(User) }} />
    </Tabs>
  );
}
