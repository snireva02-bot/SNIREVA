import { Stack } from 'expo-router';
import { colors } from '@/lib/theme';
import { LiveSync } from '@/lib/live';

export const unstable_settings = { initialRouteName: '(tabs)' };

export default function AppLayout() {
  return (
    <>
      <LiveSync />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas }, animation: 'slide_from_right' }} />
    </>
  );
}
