import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { router, type Href } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from './auth';
import { supabase } from './supabase';

// Show pushes while the app is open too.
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

async function ensureChannels() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', {
    name: 'General', importance: Notifications.AndroidImportance.HIGH, lightColor: '#23915C',
  });
  await Notifications.setNotificationChannelAsync('payments', {
    name: 'Payments and due dates', importance: Notifications.AndroidImportance.HIGH, lightColor: '#23915C',
  });
}

/** Native FCM token (not an Expo push token): our Edge Function talks to FCM HTTP v1 directly. */
async function registerToken(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  await ensureChannels();
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') return null;
  const token = await Notifications.getDevicePushTokenAsync();
  return typeof token.data === 'string' ? token.data : null;
}

function openFromNotification(data: unknown) {
  const route = (data as { route?: string } | undefined)?.route;
  if (route) router.push(route as Href);
}

/** Saves the device token on login, refreshes it on change, and routes taps to the right screen. */
export function PushRegistration() {
  const { session } = useAuth();
  const qc = useQueryClient();
  const uid = session?.user.id;

  useEffect(() => {
    if (!uid || Platform.OS === 'web') return;
    let cancelled = false;
    registerToken()
      .then((t) => { if (t && !cancelled) supabase.rpc('set_fcm_token', { p_token: t }); })
      .catch((e) => console.warn('push registration failed', e));
    const tokenSub = Notifications.addPushTokenListener((t) => {
      if (typeof t.data === 'string') supabase.rpc('set_fcm_token', { p_token: t.data });
    });
    const receivedSub = Notifications.addNotificationReceivedListener(() => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.invalidateQueries({ queryKey: ['rental'] });
      qc.invalidateQueries({ queryKey: ['payments'] });
      qc.invalidateQueries({ queryKey: ['booking'] });
      qc.invalidateQueries({ queryKey: ['profile'] });
    });
    const responseSub = Notifications.addNotificationResponseReceivedListener((r) => openFromNotification(r.notification.request.content.data));
    // App opened from a killed state by tapping a notification
    Notifications.getLastNotificationResponseAsync().then((r) => r && openFromNotification(r.notification.request.content.data));
    return () => { cancelled = true; tokenSub.remove(); receivedSub.remove(); responseSub.remove(); };
  }, [uid, qc]);

  return null;
}
